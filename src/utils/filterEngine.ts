import {
  ColumnDef,
  FilterRule,
  RelationalJoinConfig,
  RowData,
  Sheet,
  SortConfig,
} from '../types/spreadsheet';

export function filterRows(
  rows: RowData[],
  rules: FilterRule[],
  columns: ColumnDef[],
  globalQuery: string
): RowData[] {
  let result = [...rows];

  // 1. Global text search
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
  if (rules.length === 0) return result;

  return result.filter((row) => {
    return rules.every((rule) => {
      const col = columns.find((c) => c.key === rule.columnKey);
      if (!col) return true;

      const rawVal = row[rule.columnKey];

      switch (rule.operator) {
        case 'contains':
          if (rawVal === null || rawVal === undefined) return false;
          return String(rawVal).toLowerCase().includes(String(rule.value || '').toLowerCase());

        case 'not_contains':
          if (rawVal === null || rawVal === undefined) return true;
          return !String(rawVal).toLowerCase().includes(String(rule.value || '').toLowerCase());

        case 'equals': {
          if (col.type === 'number' || col.type === 'currency' || col.type === 'percentage') {
            return Number(rawVal) === Number(rule.value);
          }
          return String(rawVal ?? '').toLowerCase() === String(rule.value ?? '').toLowerCase();
        }

        case 'not_equals': {
          if (col.type === 'number' || col.type === 'currency' || col.type === 'percentage') {
            return Number(rawVal) !== Number(rule.value);
          }
          return String(rawVal ?? '').toLowerCase() !== String(rule.value ?? '').toLowerCase();
        }

        case 'starts_with':
          return String(rawVal ?? '')
            .toLowerCase()
            .startsWith(String(rule.value ?? '').toLowerCase());

        case 'ends_with':
          return String(rawVal ?? '')
            .toLowerCase()
            .endsWith(String(rule.value ?? '').toLowerCase());

        case 'greater_than':
          return Number(rawVal) > Number(rule.value);

        case 'greater_equal':
          return Number(rawVal) >= Number(rule.value);

        case 'less_than':
          return Number(rawVal) < Number(rule.value);

        case 'less_equal':
          return Number(rawVal) <= Number(rule.value);

        case 'between': {
          const num = Number(rawVal);
          const min = Number(rule.value);
          const max = Number(rule.secondValue);
          return num >= min && num <= max;
        }

        case 'in': {
          if (!Array.isArray(rule.value) || rule.value.length === 0) return true;
          return rule.value.includes(rawVal);
        }

        case 'not_in': {
          if (!Array.isArray(rule.value) || rule.value.length === 0) return true;
          return !rule.value.includes(rawVal);
        }

        case 'is_empty':
          return rawVal === null || rawVal === undefined || String(rawVal).trim() === '';

        case 'is_not_empty':
          return rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== '';

        case 'date_range': {
          if (!rawVal) return false;
          const rowDate = new Date(rawVal).getTime();
          const startDate = rule.value ? new Date(rule.value).getTime() : -Infinity;
          const endDate = rule.secondValue ? new Date(rule.secondValue).getTime() : Infinity;
          return rowDate >= startDate && rowDate <= endDate;
        }

        case 'this_month': {
          if (!rawVal) return false;
          const d = new Date(rawVal);
          const now = new Date();
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }

        case 'this_year': {
          if (!rawVal) return false;
          const d = new Date(rawVal);
          const now = new Date();
          return d.getFullYear() === now.getFullYear();
        }

        default:
          return true;
      }
    });
  });
}

export function sortRows(rows: RowData[], sortConfig: SortConfig | null): RowData[] {
  if (!sortConfig) return rows;

  return [...rows].sort((a, b) => {
    const valA = a[sortConfig.columnKey];
    const valB = b[sortConfig.columnKey];

    if (valA === valB) return 0;
    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;

    // Check if numeric
    const numA = Number(valA);
    const numB = Number(valB);
    if (!isNaN(numA) && !isNaN(numB)) {
      return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
    }

    // Default string comparison
    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();
    return sortConfig.direction === 'asc'
      ? strA.localeCompare(strB)
      : strB.localeCompare(strA);
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
      const numbers = values.map(Number).filter((n) => !isNaN(n));
      const sum = numbers.reduce((acc, n) => acc + n, 0);
      return {
        label: 'Total Jumlah',
        value: column.type === 'currency'
          ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: column.currencyCode || 'IDR', maximumFractionDigits: 0 }).format(sum)
          : sum.toLocaleString('id-ID'),
      };
    }

    case 'avg': {
      const numbers = values.map(Number).filter((n) => !isNaN(n));
      if (numbers.length === 0) return { label: 'Rata-rata', value: 0 };
      const avg = numbers.reduce((acc, n) => acc + n, 0) / numbers.length;
      return {
        label: 'Rata-rata',
        value: column.type === 'currency'
          ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: column.currencyCode || 'IDR', maximumFractionDigits: 0 }).format(avg)
          : avg.toLocaleString('id-ID', { maximumFractionDigits: 1 }),
      };
    }

    case 'min': {
      const numbers = values.map(Number).filter((n) => !isNaN(n));
      if (numbers.length === 0) return { label: 'Min', value: '—' };
      const min = Math.min(...numbers);
      return {
        label: 'Nilai Terendah',
        value: column.type === 'currency'
          ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: column.currencyCode || 'IDR', maximumFractionDigits: 0 }).format(min)
          : min.toLocaleString('id-ID'),
      };
    }

    case 'max': {
      const numbers = values.map(Number).filter((n) => !isNaN(n));
      if (numbers.length === 0) return { label: 'Max', value: '—' };
      const max = Math.max(...numbers);
      return {
        label: 'Nilai Tertinggi',
        value: column.type === 'currency'
          ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: column.currencyCode || 'IDR', maximumFractionDigits: 0 }).format(max)
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

  const row = targetSheet.data.find(
    (r) => String(r[relation.targetColumnKey]) === String(foreignKeyValue)
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
  columns: { key: string; name: string; type: string; sourceSheetId: string; sourceColumnKey: string }[];
  rows: Record<string, any>[];
} {
  const primarySheet = sheets.find((s) => s.id === config.primarySheetId);
  const foreignSheet = sheets.find((s) => s.id === config.foreignSheetId);

  if (!primarySheet || !foreignSheet) {
    return { columns: [], rows: [] };
  }

  // Build column definitions with guaranteed unique keys across both sheets
  const columns = config.includedColumns.map((colSpec, idx) => {
    const sourceSheet = colSpec.sheetId === primarySheet.id ? primarySheet : foreignSheet;
    const colDef = sourceSheet.columns.find((c) => c.key === colSpec.columnKey);
    const uniqueKey = `${sourceSheet.id}_${colSpec.columnKey}_${idx}`;
    return {
      key: uniqueKey,
      name: `${colSpec.alias} (${sourceSheet.name})`,
      type: colDef ? colDef.type : 'text',
      sourceSheetId: sourceSheet.id,
      sourceColumnKey: colSpec.columnKey,
    };
  });

  const joinedRows: Record<string, any>[] = [];

  primarySheet.data.forEach((pRow, idx) => {
    const pKeyVal = pRow[config.primaryKeyColumn];
    const matchRow = foreignSheet.data.find(
      (fRow) => String(fRow[config.foreignKeyColumn]) === String(pKeyVal)
    );

    if (config.joinType === 'inner' && !matchRow) {
      return; // Skip non-matching rows in inner join
    }

    const rowObj: Record<string, any> = { _id: `join-${idx}` };

    columns.forEach((col) => {
      if (col.sourceSheetId === primarySheet.id) {
        rowObj[col.key] = pRow[col.sourceColumnKey];
      } else {
        rowObj[col.key] = matchRow ? matchRow[col.sourceColumnKey] : null;
      }
    });

    joinedRows.push(rowObj);
  });

  return { columns, rows: joinedRows };
}
