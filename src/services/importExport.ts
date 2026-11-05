import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { ColumnDef, ColumnType, RowData, Sheet } from '../types/spreadsheet';

function inferColumnType(values: any[], colName: string): ColumnType {
  const nonNulls = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (nonNulls.length === 0) return 'text';

  const lowerName = colName.toLowerCase();

  // Name based heuristics
  if (lowerName.includes('harga') || lowerName.includes('price') || lowerName.includes('biaya') || lowerName.includes('cost') || lowerName.includes('amount') || lowerName.includes('total') || lowerName.includes('gaji') || lowerName.includes('revenue')) {
    return 'currency';
  }
  if (lowerName.includes('persen') || lowerName.includes('percent') || lowerName.includes('discount') || lowerName.includes('diskon') || lowerName.includes('margin')) {
    return 'percentage';
  }
  if (lowerName.includes('date') || lowerName.includes('tanggal') || lowerName.includes('tgl') || lowerName.includes('waktu')) {
    return 'date';
  }
  if (lowerName.includes('rating') || lowerName.includes('skor') || lowerName.includes('score') || lowerName.includes('bintang')) {
    return 'rating';
  }
  if (lowerName.includes('status') || lowerName.includes('kategori') || lowerName.includes('category') || lowerName.includes('wilayah') || lowerName.includes('region') || lowerName.includes('metode') || lowerName.includes('segment')) {
    return 'category';
  }

  // Value based heuristics
  let numericCount = 0;
  let dateCount = 0;
  let booleanCount = 0;

  for (const v of nonNulls.slice(0, 50)) {
    if (typeof v === 'boolean' || v === 'true' || v === 'false' || v === 'Ya' || v === 'Tidak') {
      booleanCount++;
    } else if (typeof v === 'number') {
      numericCount++;
    } else if (!isNaN(Number(v)) && String(v).trim() !== '') {
      numericCount++;
    } else if (!isNaN(Date.parse(String(v))) && String(v).length >= 8 && (String(v).includes('-') || String(v).includes('/'))) {
      dateCount++;
    }
  }

  const sampleSize = Math.min(nonNulls.length, 50);
  if (booleanCount / sampleSize > 0.8) return 'boolean';
  if (dateCount / sampleSize > 0.8) return 'date';
  if (numericCount / sampleSize > 0.8) return 'number';

  // Check unique values for category
  const uniqueCount = new Set(nonNulls.map((v) => String(v).trim())).size;
  if (uniqueCount <= 12 && nonNulls.length >= 8) {
    return 'category';
  }

  return 'text';
}

function inferColumnCategory(colName: string, type: ColumnType): string {
  const n = colName.toLowerCase();
  if (n.includes('id') || n.includes('kode') || n.includes('code') || n.includes('no')) return 'Identifikasi';
  if (n.includes('pelanggan') || n.includes('customer') || n.includes('klien') || n.includes('client')) return 'Profil & Identitas';
  if (n.includes('produk') || n.includes('product') || n.includes('item') || n.includes('barang')) return 'Spesifikasi & Nama';
  if (type === 'currency' || n.includes('qty') || n.includes('jumlah') || n.includes('total') || n.includes('harga') || n.includes('price')) return 'Finansial & Volume';
  if (type === 'date' || n.includes('kirim') || n.includes('wilayah') || n.includes('region') || n.includes('kota') || n.includes('city')) return 'Logistik & Waktu';
  if (n.includes('status') || n.includes('bayar') || n.includes('payment')) return 'Status & Operasional';
  return 'General Data';
}

export async function parseExcelFile(file: File): Promise<Sheet[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

  const parsedSheets: Sheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

    if (!rawData || rawData.length === 0) continue;

    // Detect column keys
    const firstRow = rawData[0];
    const keys = Object.keys(firstRow);

    const columns: ColumnDef[] = keys.map((key) => {
      const colValues = rawData.map((row) => row[key]);
      const colType = inferColumnType(colValues, key);
      const colCategory = inferColumnCategory(key, colType);

      // Unique values for category colors
      let categoryColors: Record<string, string> | undefined = undefined;
      if (colType === 'category') {
        const uniqueVals = Array.from(new Set(colValues.filter(Boolean).map(String))).slice(0, 8);
        const palette = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#64748b', '#f97316'];
        categoryColors = {};
        uniqueVals.forEach((val, idx) => {
          categoryColors![val] = palette[idx % palette.length];
        });
      }

      return {
        key,
        name: key,
        type: colType,
        category: colCategory,
        description: `Kolom ${key} hasil import file`,
        summary: colType === 'currency' || colType === 'number' ? 'sum' : colType === 'category' ? 'unique' : 'none',
        width: Math.max(120, Math.min(260, key.length * 12 + 40)),
        visible: true,
        categoryColors,
        currencyCode: 'IDR',
        isPrimaryKey: key.toLowerCase() === 'id' || key.toLowerCase().endsWith('id'),
      };
    });

    const rows: RowData[] = rawData.map((row, idx) => {
      const cleanRow: Record<string, any> = { _id: `imp-${sheetName}-${idx + 1}` };
      for (const k of keys) {
        let val = row[k];
        if (val instanceof Date) {
          val = val.toISOString().split('T')[0];
        }
        cleanRow[k] = val;
      }
      return cleanRow as RowData;
    });

    parsedSheets.push({
      id: `sheet-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: sheetName,
      description: `Diimpor dari ${file.name}`,
      columns,
      data: rows,
      primaryKey: columns.find((c) => c.isPrimaryKey)?.key,
    });
  }

  // Detect and link cross-sheet relations
  autoLinkRelations(parsedSheets);

  return parsedSheets;
}

export async function parseCsvFile(file: File): Promise<Sheet> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, any>>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        const rawData = results.data;
        if (!rawData || rawData.length === 0) {
          reject(new Error('File CSV kosong atau tidak valid'));
          return;
        }

        const keys = results.meta.fields || Object.keys(rawData[0]);

        const columns: ColumnDef[] = keys.map((key) => {
          const colValues = rawData.map((r) => r[key]);
          const colType = inferColumnType(colValues, key);
          const colCategory = inferColumnCategory(key, colType);

          return {
            key,
            name: key,
            type: colType,
            category: colCategory,
            description: `Kolom CSV: ${key}`,
            summary: colType === 'currency' || colType === 'number' ? 'sum' : colType === 'category' ? 'unique' : 'none',
            width: Math.max(120, Math.min(260, key.length * 12 + 40)),
            visible: true,
            currencyCode: 'IDR',
            isPrimaryKey: key.toLowerCase() === 'id' || key.toLowerCase().endsWith('id'),
          };
        });

        const rows: RowData[] = rawData.map((row, idx) => ({
          _id: `csv-${Date.now()}-${idx + 1}`,
          ...row,
        }));

        const cleanSheetName = file.name.replace(/\.[^/.]+$/, '');

        resolve({
          id: `sheet-${Date.now()}`,
          name: cleanSheetName || 'Data CSV',
          description: `Diimpor dari file CSV: ${file.name}`,
          columns,
          data: rows,
          primaryKey: columns.find((c) => c.isPrimaryKey)?.key,
        });
      },
      error: (err) => reject(err),
    });
  });
}

function autoLinkRelations(sheets: Sheet[]) {
  if (sheets.length < 2) return;

  for (const sheet of sheets) {
    for (const col of sheet.columns) {
      if (col.isPrimaryKey) continue;

      // Look for another sheet that has this column as primary key
      for (const targetSheet of sheets) {
        if (targetSheet.id === sheet.id) continue;
        const matchingTargetCol = targetSheet.columns.find(
          (tc) => tc.key.toLowerCase() === col.key.toLowerCase()
        );

        if (matchingTargetCol) {
          col.type = 'relation';
          col.category = 'Relasi Entitas';
          const displayCol = targetSheet.columns.find(
            (tc) => tc.key !== matchingTargetCol.key && (tc.type === 'text' || tc.key.toLowerCase().includes('name') || tc.key.toLowerCase().includes('nama'))
          );

          col.relation = {
            targetSheetId: targetSheet.id,
            targetColumnKey: matchingTargetCol.key,
            displayColumnKey: displayCol ? displayCol.key : undefined,
          };
          break;
        }
      }
    }
  }
}

export function exportToExcel(
  sheets: Sheet[],
  activeSheetId?: string,
  filteredDataOnly?: boolean,
  filteredRows?: RowData[]
) {
  const wb = XLSX.utils.book_new();

  if (activeSheetId && filteredDataOnly && filteredRows) {
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (activeSheet) {
      // Export only visible columns
      const visibleCols = activeSheet.columns.filter((c) => c.visible);
      const cleanRows = filteredRows.map((r) => {
        const rowObj: Record<string, any> = {};
        visibleCols.forEach((col) => {
          rowObj[col.name] = r[col.key];
        });
        return rowObj;
      });

      const ws = XLSX.utils.json_to_sheet(cleanRows);
      XLSX.utils.book_append_sheet(wb, ws, activeSheet.name.substring(0, 31));
      XLSX.writeFile(wb, `${activeSheet.name}_Filtered_${new Date().toISOString().slice(0, 10)}.xlsx`);
      return;
    }
  }

  // Export all sheets (preserving relational workbook!)
  for (const sheet of sheets) {
    const visibleCols = sheet.columns.filter((c) => c.visible);
    const cleanRows = sheet.data.map((r) => {
      const rowObj: Record<string, any> = {};
      visibleCols.forEach((col) => {
        rowObj[col.name] = r[col.key];
      });
      return rowObj;
    });

    const ws = XLSX.utils.json_to_sheet(cleanRows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31));
  }

  XLSX.writeFile(wb, `NexusSheet_Workbook_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportToCsv(sheet: Sheet, rowsToExport?: RowData[], delimiter = ',') {
  const visibleCols = sheet.columns.filter((c) => c.visible);
  const rows = rowsToExport || sheet.data;

  const cleanRows = rows.map((r) => {
    const rowObj: Record<string, any> = {};
    visibleCols.forEach((col) => {
      rowObj[col.name] = r[col.key];
    });
    return rowObj;
  });

  const csv = Papa.unparse(cleanRows, {
    delimiter,
    header: true,
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${sheet.name}_Export_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
