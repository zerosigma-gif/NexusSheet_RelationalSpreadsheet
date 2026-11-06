import { ColumnDef, Sheet } from '../types/spreadsheet';
import { columnIndexToLetter } from './formulaEngine';

export interface FormulaSuggestionResult {
  formula: string;
  explanation: string;
  functionUsed: string;
  source: 'gemini' | 'local-nlp';
  confidence: number;
  sampleResult?: string | number;
}

/**
 * Intelligent local NLP rule parser that converts Indonesian and English natural language prompts
 * into accurate NexusSheet spreadsheet formulas.
 */
export function generateLocalFormulaSuggestion(
  prompt: string,
  sheet: Sheet,
  selectedCell: { rowId: string; colKey: string; rowIndex: number; colIndex: number } | null
): FormulaSuggestionResult {
  const p = prompt.toLowerCase().trim();
  const columns = sheet.columns;

  // Find column candidates
  const findCol = (predicate: (c: ColumnDef) => boolean): ColumnDef | undefined => {
    return columns.find(predicate);
  };

  const qtyCol = findCol((c) => /qty|quantity|jumlah|banyak|unit/i.test(c.key) || /qty|quantity|jumlah|banyak|unit/i.test(c.name));
  const priceCol = findCol((c) => /price|harga|tarif|biaya|unitprice/i.test(c.key) || /price|harga|tarif|biaya/i.test(c.name));
  const discCol = findCol((c) => /disc|diskon|potongan/i.test(c.key) || /disc|diskon|potongan/i.test(c.name));
  const totalCol = findCol((c) => /total|subtotal|amount|bersih|nominal/i.test(c.key) || /total|subtotal|amount|bersih/i.test(c.name));

  // 1. Multiplication / QTY * PRICE or Discounted Total
  if (
    p.includes('kali') ||
    p.includes('perkalian') ||
    p.includes('multiply') ||
    p.includes('x') ||
    p.includes('*') ||
    (p.includes('total') && (p.includes('harga') || p.includes('pendapatan') || p.includes('pesanan') || p.includes('omset')))
  ) {
    if (qtyCol && priceCol && discCol && (p.includes('diskon') || p.includes('potongan') || p.includes('bersih'))) {
      return {
        formula: `=[${qtyCol.name}] * [${priceCol.name}] * (1 - [${discCol.name}] / 100)`,
        explanation: `Mengalikan kolom ${qtyCol.name} dengan ${priceCol.name}, lalu memotong persentase dari ${discCol.name} untuk menghasilkan nilai bersih akhir.`,
        functionUsed: 'ARITHMETIC_MULTIPLY_DISCOUNT',
        source: 'local-nlp',
        confidence: 0.98,
      };
    }

    if (qtyCol && priceCol) {
      return {
        formula: `=[${qtyCol.name}] * [${priceCol.name}]`,
        explanation: `Mengalikan volume unit (${qtyCol.name}) dengan tarif harga satuan (${priceCol.name}) per baris.`,
        functionUsed: 'ARITHMETIC_MULTIPLY',
        source: 'local-nlp',
        confidence: 0.95,
      };
    }
  }

  // 2. SUM (Penjumlahan / Akumulasi)
  if (p.includes('sum') || p.includes('jumlah') || p.includes('total') || p.includes('akumulasi') || p.includes('tambah')) {
    const targetCol = totalCol || priceCol || qtyCol || columns.find((c) => c.type === 'currency' || c.type === 'number') || columns[0];
    const colIdx = columns.findIndex((c) => c.key === targetCol?.key);
    const letter = colIdx >= 0 ? columnIndexToLetter(colIdx) : 'A';
    const rowCount = Math.max(1, sheet.data.length);

    return {
      formula: `=SUM(${letter}1:${letter}${rowCount})`,
      explanation: `Menghitung total keseluruhan nilai pada rentang kolom ${targetCol?.name} (${letter}1 s/d ${letter}${rowCount}).`,
      functionUsed: 'SUM',
      source: 'local-nlp',
      confidence: 0.92,
    };
  }

  // 3. AVG (Rata-rata)
  if (p.includes('avg') || p.includes('rata') || p.includes('average') || p.includes('mean')) {
    const targetCol = priceCol || totalCol || qtyCol || columns.find((c) => c.type === 'currency' || c.type === 'number') || columns[0];
    const colIdx = columns.findIndex((c) => c.key === targetCol?.key);
    const letter = colIdx >= 0 ? columnIndexToLetter(colIdx) : 'A';
    const rowCount = Math.max(1, sheet.data.length);

    return {
      formula: `=AVG(${letter}1:${letter}${rowCount})`,
      explanation: `Menghitung rata-rata aritmatika pada kolom ${targetCol?.name} dari baris 1 sampai baris ${rowCount}.`,
      functionUsed: 'AVG',
      source: 'local-nlp',
      confidence: 0.94,
    };
  }

  // 4. MAX (Nilai Tertinggi)
  if (p.includes('max') || p.includes('tertinggi') || p.includes('terbesar') || p.includes('maksimum') || p.includes('puncak')) {
    const targetCol = totalCol || priceCol || qtyCol || columns.find((c) => c.type === 'currency' || c.type === 'number') || columns[0];
    const colIdx = columns.findIndex((c) => c.key === targetCol?.key);
    const letter = colIdx >= 0 ? columnIndexToLetter(colIdx) : 'A';
    const rowCount = Math.max(1, sheet.data.length);

    return {
      formula: `=MAX(${letter}1:${letter}${rowCount})`,
      explanation: `Mengambil nilai rekor tertinggi dari kolom ${targetCol?.name} pada rentang ${letter}1:${letter}${rowCount}.`,
      functionUsed: 'MAX',
      source: 'local-nlp',
      confidence: 0.95,
    };
  }

  // 5. MIN (Nilai Terendah)
  if (p.includes('min') || p.includes('terendah') || p.includes('terkecil') || p.includes('minimum')) {
    const targetCol = priceCol || totalCol || qtyCol || columns.find((c) => c.type === 'currency' || c.type === 'number') || columns[0];
    const colIdx = columns.findIndex((c) => c.key === targetCol?.key);
    const letter = colIdx >= 0 ? columnIndexToLetter(colIdx) : 'A';
    const rowCount = Math.max(1, sheet.data.length);

    return {
      formula: `=MIN(${letter}1:${letter}${rowCount})`,
      explanation: `Mengambil nilai rekor terendah dari kolom ${targetCol?.name} pada rentang ${letter}1:${letter}${rowCount}.`,
      functionUsed: 'MIN',
      source: 'local-nlp',
      confidence: 0.95,
    };
  }

  // 6. COUNT (Hitung Jumlah Baris/Data)
  if (p.includes('count') || p.includes('hitung') || p.includes('banyak transaksi') || p.includes('jumlah pesanan')) {
    const targetCol = columns[0] || columns.find((c) => c.isPrimaryKey);
    const colIdx = columns.findIndex((c) => c.key === targetCol?.key);
    const letter = colIdx >= 0 ? columnIndexToLetter(colIdx) : 'A';
    const rowCount = Math.max(1, sheet.data.length);

    return {
      formula: `=COUNT(${letter}1:${letter}${rowCount})`,
      explanation: `Menghitung total kuantitas baris data valid pada kolom ${targetCol?.name}.`,
      functionUsed: 'COUNT',
      source: 'local-nlp',
      confidence: 0.91,
    };
  }

  // 7. IF Condition
  if (p.includes('jika') || p.includes('if') || p.includes('apabila') || p.includes('status')) {
    const condCol = qtyCol || columns.find((c) => c.type === 'number') || columns[0];
    return {
      formula: `=IF([${condCol?.name || 'Quantity'}] > 10, "Grosir", "Retail")`,
      explanation: `Melakukan percabangan logika: Jika ${condCol?.name || 'Quantity'} lebih besar dari 10 maka 'Grosir', selain itu 'Retail'.`,
      functionUsed: 'IF',
      source: 'local-nlp',
      confidence: 0.90,
    };
  }

  // Default fallback recommendation
  const primaryCol = columns.find((c) => c.type === 'currency' || c.type === 'number') || columns[0];
  const colIdx = columns.findIndex((c) => c.key === primaryCol?.key);
  const letter = colIdx >= 0 ? columnIndexToLetter(colIdx) : 'A';
  const rowCount = Math.max(1, sheet.data.length);

  return {
    formula: `=SUM(${letter}1:${letter}${rowCount})`,
    explanation: `Formula estimasi agregasi SUM untuk rentang kolom ${primaryCol?.name} (${letter}1 s/d ${letter}${rowCount}).`,
    functionUsed: 'SUM',
    source: 'local-nlp',
    confidence: 0.85,
  };
}

/**
 * Request formula suggestion from server Gemini API endpoint, with automatic fallback to local NLP engine.
 */
export async function suggestFormulaWithAI(
  prompt: string,
  sheet: Sheet,
  selectedCell: { rowId: string; colKey: string; rowIndex: number; colIndex: number } | null
): Promise<FormulaSuggestionResult> {
  try {
    const sheetContext = {
      sheetName: sheet.name,
      columns: sheet.columns.map((c, idx) => ({
        key: c.key,
        name: c.name,
        type: c.type,
        letter: columnIndexToLetter(idx),
        category: c.category,
      })),
      totalRows: sheet.data.length,
    };

    const response = await fetch('/api/ai/suggest-formula', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        prompt,
        sheetContext,
        selectedCell,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.formula && !data.fallback) {
        return {
          formula: data.formula.startsWith('=') ? data.formula : `=${data.formula}`,
          explanation: data.explanation || 'Formula dibuat oleh Gemini AI berdasarkan instruksi teks Anda.',
          functionUsed: data.functionUsed || 'GEMINI_AI',
          source: 'gemini',
          confidence: data.confidence || 0.96,
        };
      }
    }
  } catch (err) {
    console.warn('Gemini API call skipped or unavailable, using local NLP suggester:', err);
  }

  // Graceful, instant offline fallback
  return generateLocalFormulaSuggestion(prompt, sheet, selectedCell);
}
