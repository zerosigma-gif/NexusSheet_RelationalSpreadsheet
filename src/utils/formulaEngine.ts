import { ColumnDef, RowData, Sheet } from '../types/spreadsheet';
import { parseNumericValue } from './filterEngine';

/**
 * Convert 0-indexed column number to Excel-style letter (0 -> A, 25 -> Z, 26 -> AA)
 */
export function columnIndexToLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Convert Excel-style column letter to 0-indexed column number (A -> 0, Z -> 25, AA -> 26)
 */
export function letterToColumnIndex(letterStr: string): number {
  const str = letterStr.toUpperCase().trim();
  let col = 0;
  for (let i = 0; i < str.length; i++) {
    col = col * 26 + (str.charCodeAt(i) - 64);
  }
  return col - 1;
}

/**
 * Check if a cell value contains a formula (starts with '=')
 */
export function isFormula(val: any): boolean {
  return typeof val === 'string' && val.trim().startsWith('=');
}

export interface CellReference {
  colLetter: string;
  isColAbsolute: boolean;
  rowNumber: number; // 1-based
  isRowAbsolute: boolean;
  colIndex: number; // 0-based
  rowIndex: number; // 0-based
}

/**
 * Parse single cell reference token like $A$1, A1, $F2, F$2
 */
export function parseCellReference(token: string): CellReference | null {
  const match = token.trim().match(/^(\$?)([A-Za-z]+)(\$?)(\d+)$/);
  if (!match) return null;

  const isColAbsolute = match[1] === '$';
  const colLetter = match[2].toUpperCase();
  const isRowAbsolute = match[3] === '$';
  const rowNumber = parseInt(match[4], 10);

  const colIndex = letterToColumnIndex(colLetter);
  const rowIndex = rowNumber - 1;

  return {
    colLetter,
    isColAbsolute,
    rowNumber,
    isRowAbsolute,
    colIndex,
    rowIndex,
  };
}

export interface AIFormulaCacheEntry {
  status: 'loading' | 'success' | 'error';
  result?: string;
  error?: string;
}

export type AIFormulaCache = Record<string, AIFormulaCacheEntry>;

export interface AICallTarget {
  label: string;
  value: unknown;
}

export interface AICallRequest {
  cacheKey: string;
  cellKey: string;
  rowId: string;
  colKey: string;
  cellRef: string;
  formula: string;
  prompt: string;
  sheetName: string;
  columnName: string;
  targets: AICallTarget[];
  rowContext: Array<{ columnName: string; value: unknown }>;
}

export interface AICellMeta {
  cacheKey: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  result?: string;
  error?: string;
  request: AICallRequest;
}

export function isAIFormula(val: any): boolean {
  if (!isFormula(val)) return false;
  return /\bAI\s*\(/i.test(String(val));
}

function hashAIKey(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `ai_${(h2 >>> 0).toString(16)}_${(h1 >>> 0).toString(16)}`;
}

/**
 * Formula Parser and Evaluator Engine
 */
export class FormulaEngine {
  private sheet: Sheet;
  private cache: Map<string, any> = new Map();
  private visiting: Set<string> = new Set();
  private columnKeyToIndex: Map<string, number> = new Map();
  private columnNameToKey: Map<string, string> = new Map();
  private aiCache: AIFormulaCache;
  private aiRequests: Map<string, AICallRequest> = new Map();
  private aiCellMeta: Map<string, AICellMeta> = new Map();

  constructor(sheet: Sheet, aiCache: AIFormulaCache = {}) {
    this.sheet = sheet;
    this.aiCache = aiCache || {};
    sheet.columns.forEach((col, idx) => {
      this.columnKeyToIndex.set(col.key, idx);
      this.columnNameToKey.set(col.name.toLowerCase().trim(), col.key);
      this.columnNameToKey.set(col.key.toLowerCase().trim(), col.key);
    });
  }

  public getAIRequests(): AICallRequest[] {
    return Array.from(this.aiRequests.values());
  }

  public getAICellMeta(rowId: string, colKey: string): AICellMeta | undefined {
    return this.aiCellMeta.get(`${rowId}:${colKey}`);
  }

  /**
   * Get raw cell value before formula evaluation
   */
  public getRawCellValue(rowId: string, colKey: string): any {
    const row = this.sheet.data.find((r) => r._id === rowId);
    return row ? row[colKey] : undefined;
  }

  /**
   * Evaluate a specific cell, resolving formula if present
   */
  public evaluateCell(rowId: string, colKey: string): any {
    const cellKey = `${rowId}:${colKey}`;

    if (this.cache.has(cellKey)) {
      return this.cache.get(cellKey);
    }

    if (this.visiting.has(cellKey)) {
      return '#CIRCULAR!';
    }

    const row = this.sheet.data.find((r) => r._id === rowId);
    if (!row) return undefined;

    const rawVal = row[colKey];
    if (!isFormula(rawVal)) {
      this.cache.set(cellKey, rawVal);
      return rawVal;
    }

    const formulaString = String(rawVal).trim().substring(1); // remove '='

    this.visiting.add(cellKey);
    let result: any;
    try {
      result = this.evaluateExpression(formulaString, rowId, colKey, String(rawVal).trim(), true);
    } catch (err: any) {
      result = err.message.startsWith('#') ? err.message : '#ERROR!';
    } finally {
      this.visiting.delete(cellKey);
    }

    this.cache.set(cellKey, result);
    return result;
  }

  /**
   * Evaluates all formulas in the sheet and returns a lookup table
   */
  public evaluateAll(): Map<string, any> {
    this.cache.clear();
    this.aiRequests.clear();
    this.aiCellMeta.clear();
    this.sheet.data.forEach((row) => {
      this.sheet.columns.forEach((col) => {
        this.evaluateCell(row._id, col.key);
      });
    });
    return this.cache;
  }

  /**
   * Directly evaluate an ad-hoc formula string (e.g. '=SUM(A1:A5)') for live preview
   */
  public evaluateFormulaString(formulaStr: string, rowId?: string, colKey?: string): any {
    if (!isFormula(formulaStr)) return formulaStr;
    const expr = formulaStr.trim().substring(1);
    const rId = rowId || this.sheet.data[0]?._id || 'temp-row';
    const cKey = colKey || this.sheet.columns[0]?.key || 'temp-col';
    try {
      return this.evaluateExpression(expr, rId, cKey, formulaStr.trim(), false);
    } catch (err: any) {
      return err.message && err.message.startsWith('#') ? err.message : '#ERROR!';
    }
  }

  /**
   * Parse and evaluate formula expression
   */
  private evaluateExpression(
    expr: string,
    currentRowId: string,
    currentColKey: string,
    fullFormula?: string,
    recordAIMeta: boolean = false
  ): any {
    const trimmedExpr = expr.trim();
    const topLevelAIArgs = this.extractTopLevelAIArgs(trimmedExpr);
    if (topLevelAIArgs !== null) {
      return this.evaluateTopLevelAI(
        topLevelAIArgs,
        currentRowId,
        currentColKey,
        fullFormula || `=${trimmedExpr}`,
        recordAIMeta
      );
    }

    const tokens = this.tokenize(trimmedExpr);
    if (tokens.length === 0) return 0;
    const rpn = this.shuntingYard(tokens);
    return this.evaluateRPN(
      rpn,
      currentRowId,
      currentColKey,
      fullFormula || `=${trimmedExpr}`,
      recordAIMeta
    );
  }

  /**
   * Tokenizer for expressions: numbers, strings, cell references, ranges, operators, functions
   */
  private tokenize(expr: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    const len = expr.length;

    while (i < len) {
      const char = expr[i];

      // Whitespace
      if (/\s/.test(char)) {
        i++;
        continue;
      }

      // Operators and punctuation
      if (['+', '-', '*', '/', '^', '%', '(', ')', ',', ';'].includes(char)) {
        tokens.push(char === ';' ? ',' : char);
        i++;
        continue;
      }

      // Comparison operators: >=, <=, !=, <>, =, >, <
      if (char === '>' || char === '<' || char === '!' || char === '=') {
        if (i + 1 < len) {
          const nextTwo = expr.substring(i, i + 2);
          if (['>=', '<=', '!=', '<>'].includes(nextTwo)) {
            tokens.push(nextTwo === '<>' ? '!=' : nextTwo);
            i += 2;
            continue;
          }
        }
        tokens.push(char);
        i++;
        continue;
      }

      // String literal: "hello"
      if (char === '"' || char === "'") {
        const quote = char;
        let str = '';
        i++;
        while (i < len && expr[i] !== quote) {
          str += expr[i];
          i++;
        }
        i++; // skip closing quote
        tokens.push(`"${str}"`);
        continue;
      }

      // Bracketed column name reference: [UnitPrice] or [Jumlah (Qty)]
      if (char === '[') {
        let colRef = '';
        i++;
        while (i < len && expr[i] !== ']') {
          colRef += expr[i];
          i++;
        }
        i++; // skip ']'
        tokens.push(`[${colRef}]`);
        continue;
      }

      // Numbers (e.g. 100, 3.14, .5)
      if (/\d/.test(char) || (char === '.' && i + 1 < len && /\d/.test(expr[i + 1]))) {
        let numStr = '';
        while (i < len && (/[\d.]/.test(expr[i]))) {
          numStr += expr[i];
          i++;
        }
        tokens.push(numStr);
        continue;
      }

      // Identifiers, Cell References, Functions, or Ranges ($A$1:$A$10 or SUM or A1)
      if (/[a-zA-Z_$]/.test(char)) {
        let ident = '';
        while (i < len && /[a-zA-Z0-9_$:.]/.test(expr[i])) {
          ident += expr[i];
          i++;
        }
        tokens.push(ident);
        continue;
      }

      // Unknown character, skip
      i++;
    }

    return tokens;
  }

  /**
   * Shunting-yard algorithm to convert infix tokens to Reverse Polish Notation (RPN)
   */
  private shuntingYard(tokens: string[]): string[] {
    const output: string[] = [];
    const opStack: string[] = [];
    const parenStack: Array<{ isFunc: boolean; argCount: number; hasArgToken: boolean }> = [];
    let pendingFunc = false;

    const precedence: Record<string, number> = {
      '=': 1,
      '!=': 1,
      '<': 2,
      '<=': 2,
      '>': 2,
      '>=': 2,
      '+': 3,
      '-': 3,
      '*': 4,
      '/': 4,
      '%': 4,
      '^': 5,
      'u-': 6, // Unary minus
    };

    const isFunction = (t: string) =>
      ['SUM', 'AVG', 'AVERAGE', 'COUNT', 'COUNTA', 'MIN', 'MAX', 'ROUND', 'IF', 'PRODUCT', 'ABS', 'AI'].includes(
        t.toUpperCase()
      );

    const markParenHasToken = () => {
      if (parenStack.length > 0) {
        parenStack[parenStack.length - 1].hasArgToken = true;
      }
    };

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Number or string literal
      if (!isNaN(Number(token)) || (token.startsWith('"') && token.endsWith('"'))) {
        markParenHasToken();
        output.push(token);
        continue;
      }

      // Function
      if (isFunction(token)) {
        markParenHasToken();
        opStack.push(token.toUpperCase());
        pendingFunc = true;
        continue;
      }

      // Argument separator
      if (token === ',') {
        while (opStack.length > 0 && opStack[opStack.length - 1] !== '(') {
          output.push(opStack.pop()!);
        }
        if (parenStack.length > 0) {
          parenStack[parenStack.length - 1].argCount += 1;
          parenStack[parenStack.length - 1].hasArgToken = false;
        }
        continue;
      }

      // Check for unary minus: '-' after operator or '(' or at start
      if (token === '-') {
        const prev = i > 0 ? tokens[i - 1] : null;
        if (!prev || ['+', '-', '*', '/', '^', '(', ',', '=', '!=', '<', '<=', '>', '>='].includes(prev)) {
          opStack.push('u-');
          continue;
        }
      }

      // Operators
      if (precedence[token]) {
        while (
          opStack.length > 0 &&
          opStack[opStack.length - 1] !== '(' &&
          precedence[opStack[opStack.length - 1]] >= precedence[token]
        ) {
          output.push(opStack.pop()!);
        }
        opStack.push(token);
        continue;
      }

      // Left paren
      if (token === '(') {
        if (!pendingFunc) {
          markParenHasToken();
        }
        parenStack.push({ isFunc: pendingFunc, argCount: 0, hasArgToken: false });
        pendingFunc = false;
        opStack.push('(');
        continue;
      }

      // Right paren
      if (token === ')') {
        while (opStack.length > 0 && opStack[opStack.length - 1] !== '(') {
          output.push(opStack.pop()!);
        }
        if (opStack.length > 0 && opStack[opStack.length - 1] === '(') {
          opStack.pop(); // remove '('
        }
        const pCtx = parenStack.pop();
        const arity = pCtx ? (pCtx.hasArgToken ? pCtx.argCount + 1 : pCtx.argCount) : 0;
        if (opStack.length > 0 && isFunction(opStack[opStack.length - 1])) {
          const fnName = opStack.pop()!;
          output.push(fnName === 'AI' ? `AI#${arity}` : fnName);
        }
        continue;
      }

      // Cell reference, range, or column identifier
      markParenHasToken();
      output.push(token);
    }

    while (opStack.length > 0) {
      output.push(opStack.pop()!);
    }

    return output;
  }

  /**
   * Evaluates Reverse Polish Notation stack
   */
  private evaluateRPN(
    rpn: string[],
    currentRowId: string,
    currentColKey: string,
    fullFormula: string,
    recordAIMeta: boolean
  ): any {
    const stack: any[] = [];

    for (const token of rpn) {
      // 1. Literal numbers
      if (!isNaN(Number(token))) {
        stack.push(Number(token));
        continue;
      }

      // 2. Literal strings
      if (token.startsWith('"') && token.endsWith('"')) {
        stack.push(token.substring(1, token.length - 1));
        continue;
      }

      // 3. Unary minus
      if (token === 'u-') {
        const val = stack.pop();
        stack.push(-Number(val || 0));
        continue;
      }

      // 4. Binary operators
      if (['+', '-', '*', '/', '^', '%', '=', '!=', '<', '<=', '>', '>='].includes(token)) {
        const b = stack.pop();
        const a = stack.pop();
        stack.push(this.applyBinaryOp(token, a, b));
        continue;
      }

      // 5. Variable-arity AI function
      if (token.startsWith('AI#')) {
        const arity = parseInt(token.split('#')[1] || '0', 10);
        const args: any[] = [];
        for (let a = 0; a < arity; a++) {
          args.unshift(stack.pop());
        }
        const resolved = this.resolveAIValues(args, currentRowId, currentColKey, fullFormula, recordAIMeta);
        stack.push(resolved);
        continue;
      }

      // 5b. Standard Functions
      if (
        ['SUM', 'AVG', 'AVERAGE', 'COUNT', 'COUNTA', 'MIN', 'MAX', 'ROUND', 'IF', 'PRODUCT', 'ABS'].includes(
          token
        )
      ) {
        this.applyFunction(token, stack);
        continue;
      }

      // 6. Cell range (e.g. F1:F5 or $F$1:$F$10 or F:F)
      if (token.includes(':')) {
        const rangeValues = this.resolveRangeValues(token);
        stack.push(rangeValues);
        continue;
      }

      // 7. Bracketed column reference: [UnitPrice] or [Quantity]
      if (token.startsWith('[') && token.endsWith(']')) {
        const colIdentifier = token.substring(1, token.length - 1).trim();
        const resolvedVal = this.resolveColumnInCurrentRow(colIdentifier, currentRowId);
        stack.push(resolvedVal);
        continue;
      }

      // 8. Cell coordinate reference: A1, $A$1, F2, $F$2, etc.
      const cellRef = parseCellReference(token);
      if (cellRef) {
        const resolvedVal = this.resolveCellRefValue(cellRef);
        stack.push(resolvedVal);
        continue;
      }

      // 9. Plain column name or key reference in current row: e.g. Quantity or UnitPrice
      const colKey = this.columnNameToKey.get(token.toLowerCase());
      if (colKey) {
        const resolvedVal = this.resolveColumnInCurrentRow(colKey, currentRowId);
        stack.push(resolvedVal);
        continue;
      }

      // Fallback: push raw token
      stack.push(token);
    }

    if (stack.length === 0) return 0;
    const finalVal = stack[stack.length - 1];

    // If an array was left on stack (e.g. formula was just =F1:F5), return first element or sum
    if (Array.isArray(finalVal)) {
      return finalVal.length > 0 ? finalVal[0] : 0;
    }

    return finalVal;
  }

  /**
   * Apply basic binary arithmetic & comparison operations
   */
  private applyBinaryOp(op: string, a: any, b: any): any {
    // Unpack array if range was passed directly to arithmetic
    const numA = Array.isArray(a)
      ? parseNumericValue(a[0]) || 0
      : parseNumericValue(a) || 0;
    const numB = Array.isArray(b)
      ? parseNumericValue(b[0]) || 0
      : parseNumericValue(b) || 0;

    switch (op) {
      case '+':
        return numA + numB;
      case '-':
        return numA - numB;
      case '*':
        return numA * numB;
      case '/':
        if (numB === 0) throw new Error('#DIV/0!');
        return numA / numB;
      case '^':
        return Math.pow(numA, numB);
      case '%':
        return numA % numB;
      case '=':
        return a === b;
      case '!=':
        return a !== b;
      case '>':
        return numA > numB;
      case '>=':
        return numA >= numB;
      case '<':
        return numA < numB;
      case '<=':
        return numA <= numB;
      default:
        return 0;
    }
  }

  /**
   * Apply spreadsheet functions like SUM, AVG, COUNT, MIN, MAX
   */
  private applyFunction(func: string, stack: any[]) {
    const rawArg = stack.pop();
    // Normalize argument(s) into flat array of items
    const items: any[] = Array.isArray(rawArg) ? rawArg : [rawArg];

    switch (func) {
      case 'SUM': {
        const numbers = items.map(parseNumericValue).filter((n) => !isNaN(n));
        const sum = numbers.reduce((acc, curr) => acc + curr, 0);
        stack.push(sum);
        break;
      }

      case 'AVG':
      case 'AVERAGE': {
        const numbers = items.map(parseNumericValue).filter((n) => !isNaN(n));
        if (numbers.length === 0) {
          stack.push(0);
        } else {
          const avg = numbers.reduce((acc, curr) => acc + curr, 0) / numbers.length;
          stack.push(avg);
        }
        break;
      }

      case 'COUNT': {
        const count = items.filter(
          (v) => v !== null && v !== undefined && v !== '' && !isNaN(parseNumericValue(v))
        ).length;
        stack.push(count);
        break;
      }

      case 'COUNTA': {
        const count = items.filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
          .length;
        stack.push(count);
        break;
      }

      case 'MIN': {
        const numbers = items.map(parseNumericValue).filter((n) => !isNaN(n));
        stack.push(numbers.length > 0 ? Math.min(...numbers) : 0);
        break;
      }

      case 'MAX': {
        const numbers = items.map(parseNumericValue).filter((n) => !isNaN(n));
        stack.push(numbers.length > 0 ? Math.max(...numbers) : 0);
        break;
      }

      case 'ROUND': {
        // ROUND requires two args: number and decimals
        const decimals = parseNumericValue(rawArg) || 0;
        const targetNum = parseNumericValue(stack.pop()) || 0;
        const factor = Math.pow(10, decimals);
        stack.push(Math.round(targetNum * factor) / factor);
        break;
      }

      case 'ABS': {
        const val = parseNumericValue(rawArg) || 0;
        stack.push(Math.abs(val));
        break;
      }

      case 'IF': {
        // IF takes 3 args: cond, trueVal, falseVal
        const falseVal = rawArg;
        const trueVal = stack.pop();
        const cond = stack.pop();
        stack.push(cond ? trueVal : falseVal);
        break;
      }

      default:
        stack.push(0);
        break;
    }
  }

  /**
   * Resolve values in a range like F1:F5, $F$1:$F$10, or column-wide F:F
   */
  private resolveRangeValues(rangeToken: string): any[] {
    const parts = rangeToken.split(':').map((s) => s.trim());
    if (parts.length !== 2) return [];

    const startPart = parts[0];
    const endPart = parts[1];

    // Check if column-wide like F:F or $F:$F
    if (/^\$?[A-Za-z]+$/.test(startPart) && /^\$?[A-Za-z]+$/.test(endPart)) {
      const colLetter = startPart.replace(/\$/g, '').toUpperCase();
      const colIndex = letterToColumnIndex(colLetter);
      const colDef = this.sheet.columns[colIndex];
      if (!colDef) return [];

      return this.sheet.data.map((r) => this.evaluateCell(r._id, colDef.key));
    }

    // Check cell-to-cell range like F1:F10 or $F$1:$F$10
    const startRef = parseCellReference(startPart);
    const endRef = parseCellReference(endPart);

    if (!startRef || !endRef) return [];

    const minCol = Math.min(startRef.colIndex, endRef.colIndex);
    const maxCol = Math.max(startRef.colIndex, endRef.colIndex);
    const minRow = Math.min(startRef.rowIndex, endRef.rowIndex);
    const maxRow = Math.max(startRef.rowIndex, endRef.rowIndex);

    const values: any[] = [];

    for (let r = minRow; r <= maxRow; r++) {
      if (r < 0 || r >= this.sheet.data.length) continue;
      const row = this.sheet.data[r];

      for (let c = minCol; c <= maxCol; c++) {
        if (c < 0 || c >= this.sheet.columns.length) continue;
        const col = this.sheet.columns[c];
        const val = this.evaluateCell(row._id, col.key);
        values.push(val);
      }
    }

    return values;
  }

  /**
   * Resolve single cell reference like F2 or $F$2
   */
  private resolveCellRefValue(ref: CellReference): any {
    if (ref.rowIndex < 0 || ref.rowIndex >= this.sheet.data.length) {
      return '#REF!';
    }
    if (ref.colIndex < 0 || ref.colIndex >= this.sheet.columns.length) {
      return '#REF!';
    }

    const targetRow = this.sheet.data[ref.rowIndex];
    const targetCol = this.sheet.columns[ref.colIndex];

    return this.evaluateCell(targetRow._id, targetCol.key);
  }

  /**
   * Resolve a column by name or key within the current row
   */
  private resolveColumnInCurrentRow(colIdentifier: string, currentRowId: string): any {
    const colKey =
      this.columnNameToKey.get(colIdentifier.toLowerCase().trim()) || colIdentifier;
    const col = this.sheet.columns.find((c) => c.key === colKey);
    if (!col) return '#REF!';

    return this.evaluateCell(currentRowId, col.key);
  }

  /**
   * Check if the expression is a single top-level AI(...) invocation and extract raw argument substrings
   */
  private extractTopLevelAIArgs(expr: string): string[] | null {
    const match = expr.match(/^AI\s*\(/i);
    if (!match) return null;

    const openIdx = expr.indexOf('(');
    if (openIdx === -1) return null;

    const args: string[] = [];
    let current = '';
    let depth = 0;
    let inQuote: '"' | "'" | null = null;
    let inBracket = false;

    for (let i = openIdx; i < expr.length; i++) {
      const ch = expr[i];

      if (inQuote) {
        current += ch;
        if (ch === inQuote) inQuote = null;
        continue;
      }

      if (ch === '"' || ch === "'") {
        inQuote = ch;
        current += ch;
        continue;
      }

      if (ch === '[') {
        inBracket = true;
        current += ch;
        continue;
      }

      if (ch === ']' && inBracket) {
        inBracket = false;
        current += ch;
        continue;
      }

      if (!inBracket) {
        if (ch === '(') {
          depth++;
          if (depth === 1) continue; // skip outer '('
        } else if (ch === ')') {
          depth--;
          if (depth === 0) {
            if (i !== expr.length - 1) {
              // Trailing tokens exist outside AI(...)
              return null;
            }
            if (current.trim().length > 0 || args.length > 0) {
              args.push(current.trim());
            }
            return args;
          }
        } else if ((ch === ',' || ch === ';') && depth === 1) {
          args.push(current.trim());
          current = '';
          continue;
        }
      }

      current += ch;
    }

    return null;
  }

  /**
   * Resolve labeled targets and prompt for top-level =AI(...) calls
   */
  private evaluateTopLevelAI(
    rawArgs: string[],
    currentRowId: string,
    currentColKey: string,
    fullFormula: string,
    recordAIMeta: boolean
  ): string {
    const promptParts: string[] = [];
    const targets: AICallTarget[] = [];

    for (const arg of rawArgs) {
      if (!arg) continue;

      // Quoted prompt string literal
      if (
        (arg.startsWith('"') && arg.endsWith('"') && arg.length >= 2) ||
        (arg.startsWith("'") && arg.endsWith("'") && arg.length >= 2)
      ) {
        const unquoted = arg.slice(1, -1).trim();
        if (unquoted) promptParts.push(unquoted);
        continue;
      }

      // Range reference like B2:G2 or $F$1:$F$10
      if (arg.includes(':') && !/[+\-*/^%()"]/.test(arg)) {
        const labeledRange = this.resolveLabeledRangeValues(arg, currentRowId, currentColKey);
        targets.push(...labeledRange);
        continue;
      }

      // Single cell reference like F2 or $F$2
      const cellRef = parseCellReference(arg);
      if (cellRef) {
        const val = this.resolveCellRefValue(cellRef);
        const colDef = this.sheet.columns[cellRef.colIndex];
        const colLabel = colDef ? `${cellRef.colLetter}${cellRef.rowNumber} (${colDef.name})` : arg.toUpperCase();
        targets.push({ label: colLabel, value: val });
        continue;
      }

      // Bracketed column reference like [TotalAmount]
      if (arg.startsWith('[') && arg.endsWith(']')) {
        const colId = arg.slice(1, -1).trim();
        const colKey = this.columnNameToKey.get(colId.toLowerCase()) || colId;
        const colDef = this.sheet.columns.find((c) => c.key === colKey);
        const val = this.resolveColumnInCurrentRow(colId, currentRowId);
        targets.push({ label: colDef?.name || colId, value: val });
        continue;
      }

      // General sub-expression (e.g. SUM(F1:F5), [Qty]*[Price], number)
      const val = this.evaluateExpression(arg, currentRowId, currentColKey, fullFormula, false);
      targets.push({ label: arg, value: val });
    }

    return this.finalizeAICall(
      promptParts.join(' — '),
      targets,
      currentRowId,
      currentColKey,
      fullFormula,
      recordAIMeta
    );
  }

  /**
   * Fallback AI invocation resolver when AI() is nested inside another expression like IF(...)
   */
  private resolveAIValues(
    args: any[],
    currentRowId: string,
    currentColKey: string,
    fullFormula: string,
    recordAIMeta: boolean
  ): string {
    const promptParts: string[] = [];
    const targets: AICallTarget[] = [];

    args.forEach((arg, idx) => {
      if (Array.isArray(arg)) {
        arg.slice(0, 60).forEach((item, i) => {
          targets.push({ label: `Item ${i + 1}`, value: item });
        });
      } else if (typeof arg === 'string' && idx === 0 && args.length > 1) {
        promptParts.push(arg);
      } else {
        targets.push({ label: `Argumen ${idx + 1}`, value: arg });
      }
    });

    return this.finalizeAICall(
      promptParts.join(' — '),
      targets,
      currentRowId,
      currentColKey,
      fullFormula,
      recordAIMeta
    );
  }

  private resolveLabeledRangeValues(
    rangeToken: string,
    currentRowId: string,
    currentColKey: string
  ): AICallTarget[] {
    const parts = rangeToken.split(':').map((s) => s.trim());
    if (parts.length !== 2) return [];

    const startPart = parts[0];
    const endPart = parts[1];
    const items: AICallTarget[] = [];
    const maxItems = 60;

    if (/^\$?[A-Za-z]+$/.test(startPart) && /^\$?[A-Za-z]+$/.test(endPart)) {
      const colLetter = startPart.replace(/\$/g, '').toUpperCase();
      const colIndex = letterToColumnIndex(colLetter);
      const colDef = this.sheet.columns[colIndex];
      if (!colDef) return [];

      for (let r = 0; r < this.sheet.data.length && items.length < maxItems; r++) {
        const row = this.sheet.data[r];
        if (row._id === currentRowId && colDef.key === currentColKey) continue;
        const val = this.evaluateCell(row._id, colDef.key);
        items.push({
          label: `${colLetter}${r + 1} (${colDef.name})`,
          value: val,
        });
      }
      return items;
    }

    const startRef = parseCellReference(startPart);
    const endRef = parseCellReference(endPart);
    if (!startRef || !endRef) return [];

    const minCol = Math.min(startRef.colIndex, endRef.colIndex);
    const maxCol = Math.max(startRef.colIndex, endRef.colIndex);
    const minRow = Math.min(startRef.rowIndex, endRef.rowIndex);
    const maxRow = Math.max(startRef.rowIndex, endRef.rowIndex);

    for (let r = minRow; r <= maxRow && items.length < maxItems; r++) {
      if (r < 0 || r >= this.sheet.data.length) continue;
      const row = this.sheet.data[r];

      for (let c = minCol; c <= maxCol && items.length < maxItems; c++) {
        if (c < 0 || c >= this.sheet.columns.length) continue;
        const col = this.sheet.columns[c];
        if (row._id === currentRowId && col.key === currentColKey) continue;
        const val = this.evaluateCell(row._id, col.key);
        items.push({
          label: `${columnIndexToLetter(c)}${r + 1} (${col.name})`,
          value: val,
        });
      }
    }

    return items;
  }

  private finalizeAICall(
    prompt: string,
    targets: AICallTarget[],
    currentRowId: string,
    currentColKey: string,
    fullFormula: string,
    recordAIMeta: boolean
  ): string {
    const rowIdx = this.sheet.data.findIndex((r) => r._id === currentRowId);
    const colIdx = this.columnKeyToIndex.get(currentColKey) ?? 0;
    const colDef = this.sheet.columns[colIdx];
    const cellRef = `${columnIndexToLetter(colIdx)}${rowIdx >= 0 ? rowIdx + 1 : 1}`;
    const cellKey = `${currentRowId}:${currentColKey}`;

    // Build concise row context (exclude self and pending AI placeholders)
    const row = rowIdx >= 0 ? this.sheet.data[rowIdx] : undefined;
    const rowContext: Array<{ columnName: string; value: unknown }> = [];
    if (row) {
      for (const col of this.sheet.columns) {
        if (col.key === currentColKey) continue;
        const raw = row[col.key];
        if (raw === undefined || raw === null || raw === '') continue;
        if (isAIFormula(raw)) continue;
        const val = isFormula(raw) ? this.evaluateCell(row._id, col.key) : raw;
        rowContext.push({ columnName: col.name, value: val });
      }
    }

    // If no explicit targets were passed (e.g. =AI("Analisis baris ini") or =AI()), analyze rowContext
    const effectiveTargets =
      targets.length > 0
        ? targets
        : rowContext.map((c) => ({ label: c.columnName, value: c.value }));

    const keyPayload = JSON.stringify({
      sheetId: this.sheet.id,
      prompt: prompt.trim(),
      targets: effectiveTargets,
      rowContext: targets.length > 0 ? rowContext.slice(0, 8) : [],
    });
    const cacheKey = hashAIKey(keyPayload);

    const request: AICallRequest = {
      cacheKey,
      cellKey,
      rowId: currentRowId,
      colKey: currentColKey,
      cellRef,
      formula: fullFormula,
      prompt: prompt.trim(),
      sheetName: this.sheet.name,
      columnName: colDef?.name || currentColKey,
      targets: effectiveTargets,
      rowContext: targets.length > 0 ? rowContext.slice(0, 12) : [],
    };

    const cached = this.aiCache[cacheKey];

    if (recordAIMeta) {
      this.aiRequests.set(cellKey, request);
      this.aiCellMeta.set(cellKey, {
        cacheKey,
        status: cached ? cached.status : 'pending',
        result: cached?.result,
        error: cached?.error,
        request,
      });
    }

    if (cached?.status === 'success') {
      return cached.result ?? '';
    }
    if (cached?.status === 'error') {
      return '#AI_ERR!';
    }
    if (!recordAIMeta) {
      return 'Tekan Enter untuk menganalisis dengan AI';
    }
    return 'Menganalisis...';
  }
}

/**
 * Returns a copy of the sheet with all formulas evaluated into concrete values
 */
export function getEvaluatedSheet(sheet: Sheet, aiCache: AIFormulaCache = {}): Sheet {
  const engine = new FormulaEngine(sheet, aiCache);
  const evalData: RowData[] = sheet.data.map((row) => {
    const newRow: Record<string, any> = { ...row };
    sheet.columns.forEach((col) => {
      const rawVal = row[col.key];
      if (isFormula(rawVal)) {
        newRow[col.key] = engine.evaluateCell(row._id, col.key);
      }
    });
    return newRow as RowData;
  });

  return {
    ...sheet,
    data: evalData,
  };
}

export interface FormulaDocItem {
  name: string;
  syntax: string;
  desc: string;
  example: string;
}

export const FORMULA_DOCS: FormulaDocItem[] = [
  {
    name: 'SUM',
    syntax: '=SUM(range_atau_nilai)',
    desc: 'Menjumlahkan semua angka pada rentang sel atau kolom.',
    example: '=SUM(F1:F10) atau =SUM($F$1:$F$10)',
  },
  {
    name: 'AVG / AVERAGE',
    syntax: '=AVG(range_atau_nilai)',
    desc: 'Menghitung nilai rata-rata aritmatika dari rentang sel.',
    example: '=AVG(G1:G15) atau =AVG([UnitPrice])',
  },
  {
    name: 'COUNT',
    syntax: '=COUNT(range)',
    desc: 'Menghitung jumlah sel numerik yang berisi angka.',
    example: '=COUNT(A1:A15) atau =COUNT($F:$F)',
  },
  {
    name: 'COUNTA',
    syntax: '=COUNTA(range)',
    desc: 'Menghitung semua sel yang tidak kosong (teks maupun angka).',
    example: '=COUNTA(B1:B20)',
  },
  {
    name: 'MIN & MAX',
    syntax: '=MIN(range) / =MAX(range)',
    desc: 'Mencari nilai terendah atau tertinggi dari sekumpulan sel.',
    example: '=MIN(F1:F10) atau =MAX(TotalAmount)',
  },
  {
    name: 'Operasi Aritmatika',
    syntax: '=A1 + B1, =F2 * G2, =F2 / 10',
    desc: 'Mendukung operator +, -, *, /, ^, %, dan tanda kurung ( ).',
    example: '=[UnitPrice] * [Quantity] * (1 - [DiscountPercent]/100)',
  },
  {
    name: 'Referensi Relatif vs Absolut',
    syntax: 'F2 (relatif), $F$2 (absolut), F$2, $F2',
    desc: 'Gunakan tanda $ untuk mengunci kolom atau baris absolut.',
    example: '=$F$1 * G2 (F1 terkunci, G2 relatif per baris)',
  },
  {
    name: 'IF Kondisional',
    syntax: '=IF(kondisi, nilai_jika_benar, nilai_jika_salah)',
    desc: 'Evaluasi logika IF dengan perbandingan >, <, =, !=.',
    example: '=IF(F2 > 10000000, "High Value", "Normal")',
  },
  {
    name: 'AI (Analisis Sel)',
    syntax: '=AI("instruksi", sel_atau_rentang)',
    desc: 'Menganalisis nilai sel, rentang data, atau konteks baris secara cerdas menggunakan Gemini AI.',
    example: '=AI("Klasifikasikan risiko & ringkas transaksi", B2:G2) atau =AI(F2)',
  },
];
