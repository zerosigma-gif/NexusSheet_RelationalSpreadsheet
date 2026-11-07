import {
  ColumnDef,
  FilterRule,
  RelationalJoinConfig,
  RowData,
  Sheet,
  SortConfig,
} from '../types/spreadsheet';

/**
 * Safely parse any numeric value from strings, numbers, currencies (e.g., 'IDR 40.000.000', '40.000.000,50')
 */
export function parseNumericValue(val: any): number {
  if (typeof val === 'number') {
    return isNaN(val) ? NaN : val;
  }
  if (val === null || val === undefined || val === '') {
    return NaN;
  }
  if (typeof val === 'boolean') {
    return val ? 1 : 0;
  }

  let s = String(val).trim();
  // Strip currency labels, symbols, and non-numeric characters except digits, dots, commas, minus
  s = s.replace(/[^0-9.,-]/g, '').trim();
  if (!s || s === '-') return NaN;

  // Handle thousand separators & decimal points
  if (/\d+\.\d{3}(,\d+)?$/.test(s) || (s.includes('.') && !s.includes(','))) {
    // Indonesian/German style: 40.000.000 or 40.000,50
    if (/\d+\.\d{3}/.test(s) && !s.includes(',')) {
      s = s.replace(/\./g, '');
    } else if (s.includes('.') && s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    }
  } else if (/\d+,\d{3}/.test(s) && !s.includes('.')) {
    // US/UK style: 40,000,000
    s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    // Comma as decimal
    s = s.replace(/,/g, '.');
  }

  const num = Number(s);
  return isNaN(num) ? NaN : num;
}

/**
 * Safely parse date strings including Indonesian formats like '01 Mar 2026' or ISO '2026-03-01'
 */
export function parseSafeDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }

  // Try standard parse first
  const parsed = new Date(val);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  // Indonesian / English month dictionary
  const monthsMap: Record<string, string> = {
    jan: '01', januari: '01', january: '01',
    feb: '02', februari: '02', february: '02',
    mar: '03', maret: '03', march: '03',
    apr: '04', april: '04',
    mei: '05', may: '05',
    jun: '06', juni: '06', june: '06',
    jul: '07', juli: '07', july: '07',
    agu: '08', agustus: '08', aug: '08', august: '08',
    sep: '09', september: '09',
    okt: '10', oktober: '10', oct: '10', october: '10',
    nov: '11', november: '11',
    des: '12', desember: '12', dec: '12', december: '12',
  };

  const parts = String(val).trim().split(/[\s/-]+/);
  if (parts.length === 3) {
    const monthKey = parts[1].toLowerCase();
    if (monthsMap[monthKey]) {
      const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      const isoStr = `${year}-${monthsMap[monthKey]}-${parts[0].padStart(2, '0')}`;
      const d = new Date(isoStr);
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

export function filterRows(
  rows: RowData[],
  rules: FilterRule[],
  columns: ColumnDef[],
  globalQuery: string
): RowData[] {
  let result = [...rows];

  // 1. Global text search across visible columns
  if (globalQuery && globalQuery.trim() !== '') {
    const q = globalQuery.toLowerCase().trim();
    result = result.filter((row) => {
      return columns.some((col) => {
        if (!col.visible) return false;
        const val = row[col.key];
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(q);
      });
    });
  }

  // 2. Structured filter rules
  if (!rules || rules.length === 0) return result;

  return result.filter((row) => {
    return rules.every((rule) => {
      try {
        const col = columns.find((c) => c.key === rule.columnKey);
        // If column does not belong to the current active sheet, gracefully pass
        if (!col) return true;

        const rawVal = row[rule.columnKey];

        switch (rule.operator) {
          case 'contains': {
            if (rawVal === null || rawVal === undefined) return false;
            const query = String(rule.value || '').trim();
            if (!query) return true;

            // 1. If user typed comparison prefix like "> 22000000", ">= 22000000", "< 22000000", "<= 22000000"
            const matchGte = query.match(/^>=\s*(.+)$/);
            if (matchGte) {
              const numVal = parseNumericValue(rawVal);
              const numRule = parseNumericValue(matchGte[1]);
              if (!isNaN(numVal) && !isNaN(numRule)) return numVal >= numRule;
            }
            const matchGt = query.match(/^>\s*(.+)$/);
            if (matchGt) {
              const numVal = parseNumericValue(rawVal);
              const numRule = parseNumericValue(matchGt[1]);
              if (!isNaN(numVal) && !isNaN(numRule)) return numVal > numRule;
            }
            const matchLte = query.match(/^<=\s*(.+)$/);
            if (matchLte) {
              const numVal = parseNumericValue(rawVal);
              const numRule = parseNumericValue(matchLte[1]);
              if (!isNaN(numVal) && !isNaN(numRule)) return numVal <= numRule;
            }
            const matchLt = query.match(/^<\s*(.+)$/);
            if (matchLt) {
              const numVal = parseNumericValue(rawVal);
              const numRule = parseNumericValue(matchLt[1]);
              if (!isNaN(numVal) && !isNaN(numRule)) return numVal < numRule;
            }

            // 2. Direct string contains
            const cleanQuery = query.toLowerCase();
            const rawStr = String(rawVal).toLowerCase();
            if (rawStr.includes(cleanQuery)) return true;

            // 3. Normalized numeric contains for currency/numbers
            const numVal = parseNumericValue(rawVal);
            const numQuery = parseNumericValue(query);
            if (!isNaN(numVal) && !isNaN(numQuery)) {
              if (String(numVal).includes(String(numQuery))) return true;
            }

            return false;
          }

          case 'not_contains': {
            if (rawVal === null || rawVal === undefined) return true;
            const query = String(rule.value || '').trim();
            if (!query) return true;

            const cleanQuery = query.toLowerCase();
            const rawStr = String(rawVal).toLowerCase();
            if (rawStr.includes(cleanQuery)) return false;

            const numVal = parseNumericValue(rawVal);
            const numQuery = parseNumericValue(query);
            if (!isNaN(numVal) && !isNaN(numQuery)) {
              if (String(numVal).includes(String(numQuery))) return false;
            }

            return true;
          }

          case 'equals': {
            if (
              col.type === 'number' ||
              col.type === 'currency' ||
              col.type === 'percentage' ||
              col.type === 'rating'
            ) {
              const numVal = parseNumericValue(rawVal);
              const numRule = parseNumericValue(rule.value);
              if (!isNaN(numVal) && !isNaN(numRule)) {
                return numVal === numRule;
              }
            }
            return (
              String(rawVal ?? '').toLowerCase().trim() ===
              String(rule.value ?? '').toLowerCase().trim()
            );
          }

          case 'not_equals': {
            if (
              col.type === 'number' ||
              col.type === 'currency' ||
              col.type === 'percentage' ||
              col.type === 'rating'
            ) {
              const numVal = parseNumericValue(rawVal);
              const numRule = parseNumericValue(rule.value);
              if (!isNaN(numVal) && !isNaN(numRule)) {
                return numVal !== numRule;
              }
            }
            return (
              String(rawVal ?? '').toLowerCase().trim() !==
              String(rule.value ?? '').toLowerCase().trim()
            );
          }

          case 'starts_with': {
            const query = String(rule.value ?? '').toLowerCase().trim();
            return String(rawVal ?? '')
              .toLowerCase()
              .startsWith(query);
          }

          case 'ends_with': {
            const query = String(rule.value ?? '').toLowerCase().trim();
            return String(rawVal ?? '')
              .toLowerCase()
              .endsWith(query);
          }

          case 'greater_than': {
            const numVal = parseNumericValue(rawVal);
            const numRule = parseNumericValue(rule.value);
            if (isNaN(numVal) || isNaN(numRule)) return false;
            return numVal > numRule;
          }

          case 'greater_equal': {
            const numVal = parseNumericValue(rawVal);
            const numRule = parseNumericValue(rule.value);
            if (isNaN(numVal) || isNaN(numRule)) return false;
            return numVal >= numRule;
          }

          case 'less_than': {
            const numVal = parseNumericValue(rawVal);
            const numRule = parseNumericValue(rule.value);
            if (isNaN(numVal) || isNaN(numRule)) return false;
            return numVal < numRule;
          }

          case 'less_equal': {
            const numVal = parseNumericValue(rawVal);
            const numRule = parseNumericValue(rule.value);
            if (isNaN(numVal) || isNaN(numRule)) return false;
            return numVal <= numRule;
          }

          case 'between': {
            const numVal = parseNumericValue(rawVal);
            const minVal = parseNumericValue(rule.value);
            const maxVal = parseNumericValue(rule.secondValue);
            if (isNaN(numVal)) return false;

            const passMin = isNaN(minVal) || numVal >= minVal;
            const passMax = isNaN(maxVal) || numVal <= maxVal;
            return passMin && passMax;
          }

          case 'in': {
            if (!Array.isArray(rule.value) || rule.value.length === 0) return true;
            return rule.value.some((v) => String(v).toLowerCase() === String(rawVal).toLowerCase());
          }

          case 'not_in': {
            if (!Array.isArray(rule.value) || rule.value.length === 0) return true;
            return !rule.value.some((v) => String(v).toLowerCase() === String(rawVal).toLowerCase());
          }

          case 'is_empty':
            return rawVal === null || rawVal === undefined || String(rawVal).trim() === '';

          case 'is_not_empty':
            return rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== '';

          case 'date_range': {
            if (!rawVal) return false;
            const rowDate = parseSafeDate(rawVal);
            if (!rowDate) return false;
            const rowTime = rowDate.getTime();

            let startTime = -Infinity;
            if (rule.value) {
              const sDate = parseSafeDate(rule.value);
              if (sDate) {
                sDate.setHours(0, 0, 0, 0);
                startTime = sDate.getTime();
              }
            }

            let endTime = Infinity;
            if (rule.secondValue) {
              const eDate = parseSafeDate(rule.secondValue);
              if (eDate) {
                eDate.setHours(23, 59, 59, 999);
                endTime = eDate.getTime();
              }
            }

            return rowTime >= startTime && rowTime <= endTime;
          }

          case 'this_month': {
            if (!rawVal) return false;
            const d = parseSafeDate(rawVal);
            if (!d) return false;
            const now = new Date();
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }

          case 'this_year': {
            if (!rawVal) return false;
            const d = parseSafeDate(rawVal);
            if (!d) return false;
            const now = new Date();
            return d.getFullYear() === now.getFullYear();
          }

          default:
            return true;
        }
      } catch {
        // Any parsing failure or unhandled edge case safely passes
        return true;
      }
    });
  });
}

export function sortRows(rows: RowData[], sortConfig: SortConfig | null): RowData[] {
  if (!sortConfig) return rows;

  return [...rows].sort((a, b) => {
    try {
      const valA = a[sortConfig.columnKey];
      const valB = b[sortConfig.columnKey];

      if (valA === valB) return 0;
      if (valA === null || valA === undefined || valA === '') return 1;
      if (valB === null || valB === undefined || valB === '') return -1;

      // Check if numeric using parseNumericValue
      const numA = parseNumericValue(valA);
      const numB = parseNumericValue(valB);
      if (!isNaN(numA) && !isNaN(numB)) {
        return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
      }

      // Default string comparison
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return sortConfig.direction === 'asc'
        ? strA.localeCompare(strB)
        : strB.localeCompare(strA);
    } catch {
      return 0;
    }
  });
}

export function calculateColumnSummary(
  rows: RowData[],
  column: ColumnDef
): { label: string; value: string | number } | null {
  if (column.summary === 'none' || rows.length === 0) return null;

  const values = rows
    .map((r) => r[column.key])
    .filter((v) => v !== null && v !== undefined && v !== '');

  switch (column.summary) {
    case 'count':
      return { label: 'Total Baris', value: values.length };

    case 'unique': {
      const set = new Set(values.map((v) => String(v)));
      return { label: 'Unik', value: set.size };
    }

    case 'sum': {
      const numbers = values.map(parseNumericValue).filter((n) => !isNaN(n));
      const sum = numbers.reduce((acc, n) => acc + n, 0);
      return {
        label: 'Total Jumlah',
        value:
          column.type === 'currency'
            ? new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: column.currencyCode || 'IDR',
                maximumFractionDigits: 0,
              }).format(sum)
            : sum.toLocaleString('id-ID'),
      };
    }

    case 'avg': {
      const numbers = values.map(parseNumericValue).filter((n) => !isNaN(n));
      if (numbers.length === 0) return { label: 'Rata-rata', value: 0 };
      const avg = numbers.reduce((acc, n) => acc + n, 0) / numbers.length;
      return {
        label: 'Rata-rata',
        value:
          column.type === 'currency'
            ? new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: column.currencyCode || 'IDR',
                maximumFractionDigits: 0,
              }).format(avg)
            : avg.toLocaleString('id-ID', { maximumFractionDigits: 1 }),
      };
    }

    case 'min': {
      const numbers = values.map(parseNumericValue).filter((n) => !isNaN(n));
      if (numbers.length === 0) return { label: 'Min', value: '—' };
      const min = Math.min(...numbers);
      return {
        label: 'Nilai Terendah',
        value:
          column.type === 'currency'
            ? new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: column.currencyCode || 'IDR',
                maximumFractionDigits: 0,
              }).format(min)
            : min.toLocaleString('id-ID'),
      };
    }

    case 'max': {
      const numbers = values.map(parseNumericValue).filter((n) => !isNaN(n));
      if (numbers.length === 0) return { label: 'Max', value: '—' };
      const max = Math.max(...numbers);
      return {
        label: 'Nilai Tertinggi',
        value:
          column.type === 'currency'
            ? new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: column.currencyCode || 'IDR',
                maximumFractionDigits: 0,
              }).format(max)
            : max.toLocaleString('id-ID'),
      };
    }

    default:
      return null;
  }
}

// Find record from foreign sheet
export function resolveRelation(
  sheets: Sheet[],
  relation?: { targetSheetId: string; targetColumnKey: string; displayColumnKey?: string },
  foreignKeyValue?: any
): { targetRow: RowData | null; displayText: string } {
  if (!relation || !foreignKeyValue) {
    return { targetRow: null, displayText: String(foreignKeyValue || '—') };
  }

  const targetSheet = sheets.find((s) => s.id === relation.targetSheetId);
  if (!targetSheet) {
    return { targetRow: null, displayText: String(foreignKeyValue) };
  }

  const searchVal = String(foreignKeyValue).trim().toLowerCase();
  const row = targetSheet.data.find(
    (r) => String(r[relation.targetColumnKey]).trim().toLowerCase() === searchVal
  );

  if (!row) {
    return { targetRow: null, displayText: String(foreignKeyValue) };
  }

  const displayVal = relation.displayColumnKey ? row[relation.displayColumnKey] : null;
  const displayText = displayVal ? `${foreignKeyValue} · ${displayVal}` : String(foreignKeyValue);

  return { targetRow: row, displayText };
}

// Execute relational Join between Sheet A and Sheet B
export function executeRelationalJoin(
  sheets: Sheet[],
  config: RelationalJoinConfig
): {
  columns: {
    key: string;
    name: string;
    type: string;
    sourceSheetId: string;
    sourceColumnKey: string;
    currencyCode?: string;
  }[];
  rows: Record<string, any>[];
} {
  const primarySheet = sheets.find((s) => s.id === config.primarySheetId);
  const foreignSheet = sheets.find((s) => s.id === config.foreignSheetId);
  const tertiarySheet = config.tertiarySheetId
    ? sheets.find((s) => s.id === config.tertiarySheetId)
    : undefined;

  if (!primarySheet || !foreignSheet) {
    return { columns: [], rows: [] };
  }

  // Build column definitions with guaranteed unique keys across all participating sheets
  const columns = config.includedColumns.map((colSpec, idx) => {
    const sourceSheet = sheets.find((s) => s.id === colSpec.sheetId) || primarySheet;
    const colDef = sourceSheet.columns.find((c) => c.key === colSpec.columnKey);
    const uniqueKey = `${sourceSheet.id}_${colSpec.columnKey}_${idx}`;
    return {
      key: uniqueKey,
      name: `${colSpec.alias} (${sourceSheet.name})`,
      type: colDef ? colDef.type : 'text',
      sourceSheetId: sourceSheet.id,
      sourceColumnKey: colSpec.columnKey,
      currencyCode: colDef?.currencyCode,
    };
  });

  const joinedRows: Record<string, any>[] = [];

  primarySheet.data.forEach((pRow, idx) => {
    // 1. Join Foreign Sheet (Sheet 2)
    const pKeyVal = pRow[config.primaryKeyColumn];
    const pKeyStr = String(pKeyVal || '').trim().toLowerCase();
    const matchRow = foreignSheet.data.find(
      (fRow) => String(fRow[config.foreignKeyColumn] || '').trim().toLowerCase() === pKeyStr
    );

    if (config.joinType === 'inner' && !matchRow) {
      return; // Skip non-matching rows in inner join
    }

    // 2. Join Tertiary Sheet (Sheet 3) if configured
    let tertiaryMatchRow: Record<string, any> | null = null;
    if (tertiarySheet && config.tertiarySourceKeyColumn && config.tertiaryTargetKeyColumn) {
      // Find matching source key in primary row or foreign row
      const tertKeyVal =
        pRow[config.tertiarySourceKeyColumn] !== undefined
          ? pRow[config.tertiarySourceKeyColumn]
          : matchRow
          ? matchRow[config.tertiarySourceKeyColumn]
          : '';
      const tertKeyStr = String(tertKeyVal || '').trim().toLowerCase();

      tertiaryMatchRow =
        tertiarySheet.data.find(
          (tRow) =>
            String(tRow[config.tertiaryTargetKeyColumn!] || '').trim().toLowerCase() === tertKeyStr
        ) || null;

      if (config.tertiaryJoinType === 'inner' && !tertiaryMatchRow) {
        return; // Skip non-matching rows in tertiary inner join
      }
    }

    const rowObj: Record<string, any> = { _id: `join-${idx}` };

    columns.forEach((col) => {
      if (col.sourceSheetId === primarySheet.id) {
        rowObj[col.key] = pRow[col.sourceColumnKey];
      } else if (col.sourceSheetId === foreignSheet.id) {
        rowObj[col.key] = matchRow ? matchRow[col.sourceColumnKey] : null;
      } else if (tertiarySheet && col.sourceSheetId === tertiarySheet.id) {
        rowObj[col.key] = tertiaryMatchRow ? tertiaryMatchRow[col.sourceColumnKey] : null;
      } else {
        rowObj[col.key] = null;
      }
    });

    joinedRows.push(rowObj);
  });

  return { columns, rows: joinedRows };
}
