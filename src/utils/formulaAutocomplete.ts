import { Sheet, ColumnDef } from '../types/spreadsheet';
import { columnIndexToLetter } from './formulaEngine';

export interface AutocompleteSuggestion {
  id: string;
  type: 'function' | 'column' | 'range';
  title: string;
  insertText: string;
  cursorOffset?: number; // Relative position from end of insertText or inside parens
  subtitle: string;
  description: string;
  badge?: string;
  badgeColor?: string;
  iconType: 'fx' | 'column' | 'range';
}

export interface AutocompleteContext {
  activeToken: string;
  tokenStartIndex: number;
  tokenEndIndex: number;
  isInsideBracket: boolean;
  isFormula: boolean;
}

export const SUPPORTED_FUNCTIONS: {
  name: string;
  syntax: string;
  desc: string;
  category: string;
  insertTemplate: string;
  cursorOffsetInside: number;
}[] = [
  {
    name: 'SUM',
    syntax: 'SUM(range)',
    desc: 'Menjumlahkan semua angka pada rentang sel atau kolom',
    category: 'Matematika',
    insertTemplate: 'SUM()',
    cursorOffsetInside: 1, // cursor placed inside ()
  },
  {
    name: 'AVG',
    syntax: 'AVG(range)',
    desc: 'Menghitung nilai rata-rata dari sekumpulan angka',
    category: 'Statistik',
    insertTemplate: 'AVG()',
    cursorOffsetInside: 1,
  },
  {
    name: 'COUNT',
    syntax: 'COUNT(range)',
    desc: 'Menghitung banyaknya sel yang memuat nilai numerik',
    category: 'Statistik',
    insertTemplate: 'COUNT()',
    cursorOffsetInside: 1,
  },
  {
    name: 'COUNTA',
    syntax: 'COUNTA(range)',
    desc: 'Menghitung banyaknya sel yang tidak kosong (teks maupun angka)',
    category: 'Statistik',
    insertTemplate: 'COUNTA()',
    cursorOffsetInside: 1,
  },
  {
    name: 'MIN',
    syntax: 'MIN(range)',
    desc: 'Menghasilkan nilai terkecil dari sekumpulan data angka',
    category: 'Statistik',
    insertTemplate: 'MIN()',
    cursorOffsetInside: 1,
  },
  {
    name: 'MAX',
    syntax: 'MAX(range)',
    desc: 'Menghasilkan nilai terbesar dari sekumpulan data angka',
    category: 'Statistik',
    insertTemplate: 'MAX()',
    cursorOffsetInside: 1,
  },
  {
    name: 'ROUND',
    syntax: 'ROUND(value, digits)',
    desc: 'Membulatkan angka ke jumlah digit desimal tertentu',
    category: 'Matematika',
    insertTemplate: 'ROUND(, 0)',
    cursorOffsetInside: 4,
  },
  {
    name: 'IF',
    syntax: 'IF(kondisi, jika_benar, jika_salah)',
    desc: 'Evaluasi logika IF dengan perbandingan nilai',
    category: 'Logika',
    insertTemplate: 'IF( > 0, "Ya", "Tidak")',
    cursorOffsetInside: 18,
  },
  {
    name: 'AI',
    syntax: 'AI("instruksi", sel_atau_rentang)',
    desc: 'Menganalisis nilai sel atau rentang data menggunakan Gemini AI',
    category: 'Analisis',
    insertTemplate: 'AI("Analisis sel ini", )',
    cursorOffsetInside: 1,
  },
];

/**
 * Extracts the active typing token and context at cursor position
 */
export function extractFormulaContext(
  text: string,
  cursorPos: number
): AutocompleteContext | null {
  if (!text || !text.startsWith('=')) {
    return null;
  }

  const textBeforeCursor = text.slice(0, cursorPos);

  // Skip autocomplete while cursor is inside a quoted string literal (e.g. =AI("Analyze...
  let activeQuote: '"' | "'" | null = null;
  for (let i = 0; i < textBeforeCursor.length; i++) {
    const ch = textBeforeCursor[i];
    if (activeQuote) {
      if (ch === activeQuote) activeQuote = null;
    } else if (ch === '"' || ch === "'") {
      activeQuote = ch;
    }
  }
  if (activeQuote !== null) {
    return null;
  }

  // Check if we are inside square brackets: e.g. "=[Col"
  const lastOpenBracket = textBeforeCursor.lastIndexOf('[');
  const lastCloseBracket = textBeforeCursor.lastIndexOf(']');

  if (lastOpenBracket > lastCloseBracket) {
    // We are inside brackets: e.g., "=[Quan"
    const token = textBeforeCursor.slice(lastOpenBracket + 1);
    return {
      activeToken: token,
      tokenStartIndex: lastOpenBracket,
      tokenEndIndex: cursorPos,
      isInsideBracket: true,
      isFormula: true,
    };
  }

  // Token delimiters: whitespace, operators, parentheses, commas
  const delimiters = /[\s+\-*/^%(),=]/;
  let tokenStart = cursorPos;
  while (tokenStart > 0 && !delimiters.test(text[tokenStart - 1])) {
    tokenStart--;
  }

  const activeToken = text.slice(tokenStart, cursorPos);

  // If token is empty but just typed '=' or '(' or ',' or operator, show all options!
  return {
    activeToken,
    tokenStartIndex: tokenStart,
    tokenEndIndex: cursorPos,
    isInsideBracket: false,
    isFormula: true,
  };
}

/**
 * Generate matching suggestions for functions and sheet columns
 */
export function getFormulaSuggestions(
  context: AutocompleteContext,
  sheet: Sheet
): AutocompleteSuggestion[] {
  const token = context.activeToken.toLowerCase().trim();
  const suggestions: AutocompleteSuggestion[] = [];
  const rowCount = Math.max(1, sheet.data.length);

  // 1. Column suggestions (always valid inside brackets or formulas)
  const columnSuggestions: AutocompleteSuggestion[] = [];
  sheet.columns.forEach((col, idx) => {
    const colLetter = columnIndexToLetter(idx);
    const nameMatch = col.name.toLowerCase().includes(token);
    const keyMatch = col.key.toLowerCase().includes(token);
    const letterMatch = colLetter.toLowerCase() === token;

    if (token && !nameMatch && !keyMatch && !letterMatch && !context.isInsideBracket) {
      return;
    }

    const isNumeric = col.type === 'number' || col.type === 'currency' || col.type === 'percentage';
    const badgeColor = isNumeric
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-blue-50 text-blue-700 border-blue-200';

    columnSuggestions.push({
      id: `col-${col.key}`,
      type: 'column',
      title: col.name,
      insertText: `[${col.name}]`,
      subtitle: `Kolom ${colLetter} · [${col.key}]`,
      description: `${col.category} · Tipe: ${col.type}`,
      badge: colLetter,
      badgeColor,
      iconType: 'column',
    });
  });

  // 2. Function suggestions (if not inside [brackets])
  const functionSuggestions: AutocompleteSuggestion[] = [];
  if (!context.isInsideBracket) {
    SUPPORTED_FUNCTIONS.forEach((fn) => {
      if (!token || fn.name.toLowerCase().startsWith(token) || fn.syntax.toLowerCase().includes(token)) {
        functionSuggestions.push({
          id: `fn-${fn.name}`,
          type: 'function',
          title: fn.name,
          insertText: fn.insertTemplate,
          cursorOffset: fn.cursorOffsetInside,
          subtitle: fn.syntax,
          description: fn.desc,
          badge: fn.category,
          badgeColor:
            fn.name === 'AI'
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-slate-100 text-slate-700 border-slate-200',
          iconType: 'fx',
        });
      }
    });
  }

  // 3. Quick Column Range Suggestions (e.g. F1:F20) if token matches letter or empty
  const rangeSuggestions: AutocompleteSuggestion[] = [];
  if (!context.isInsideBracket && token.length > 0 && token.length <= 2) {
    sheet.columns.forEach((col, idx) => {
      const colLetter = columnIndexToLetter(idx);
      if (colLetter.toLowerCase() === token) {
        rangeSuggestions.push({
          id: `range-${colLetter}`,
          type: 'range',
          title: `${colLetter}1:${colLetter}${rowCount}`,
          insertText: `${colLetter}1:${colLetter}${rowCount}`,
          subtitle: `Rentang penuh kolom ${col.name}`,
          description: `Semua baris 1 s/d ${rowCount} pada kolom ${colLetter}`,
          badge: 'Rentang Sel',
          badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
          iconType: 'range',
        });
        rangeSuggestions.push({
          id: `range-abs-${colLetter}`,
          type: 'range',
          title: `$${colLetter}$1:$${colLetter}$${rowCount}`,
          insertText: `$${colLetter}$1:$${colLetter}$${rowCount}`,
          subtitle: `Rentang absolut terkunci ($)`,
          description: `Referensi absolut baris & kolom terkunci`,
          badge: 'Absolut $',
          badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
          iconType: 'range',
        });
      }
    });
  }

  // Prioritize based on context
  if (context.isInsideBracket) {
    return columnSuggestions;
  }

  // Combine: functions first if token looks like function name, else columns
  return [...functionSuggestions, ...columnSuggestions, ...rangeSuggestions];
}

/**
 * Apply selected suggestion to current text and calculate new cursor position
 */
export function applySuggestion(
  currentText: string,
  context: AutocompleteContext,
  suggestion: AutocompleteSuggestion
): { newText: string; newCursorPos: number } {
  let startIndex = context.tokenStartIndex;
  let endIndex = context.tokenEndIndex;

  // If inside brackets and suggestion starts with bracket, replace including the opening bracket
  if (context.isInsideBracket && suggestion.insertText.startsWith('[')) {
    // startIndex is already at lastOpenBracket
  }

  const before = currentText.slice(0, startIndex);
  const after = currentText.slice(endIndex);

  const newText = before + suggestion.insertText + after;
  let newCursorPos = before.length + suggestion.insertText.length;

  if (suggestion.cursorOffset !== undefined) {
    newCursorPos = before.length + suggestion.insertText.length - suggestion.cursorOffset;
  }

  return { newText, newCursorPos };
}
