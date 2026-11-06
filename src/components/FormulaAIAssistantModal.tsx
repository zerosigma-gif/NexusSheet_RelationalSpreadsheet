import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Send,
  Check,
  Copy,
  HelpCircle,
  Columns,
  ArrowRight,
  Zap,
  Info,
  CornerDownLeft
} from 'lucide-react';
import { Sheet } from '../types/spreadsheet';
import { suggestFormulaWithAI, FormulaSuggestionResult } from '../utils/aiFormulaSuggester';
import { columnIndexToLetter } from '../utils/formulaEngine';

interface FormulaAIAssistantModalProps {
  sheet: Sheet;
  selectedCell: { rowId: string; colKey: string; rowIndex: number; colIndex: number } | null;
  isOpen: boolean;
  onClose: () => void;
  onApplyFormula: (formula: string, applyToEntireColumn?: boolean) => void;
}

const EXAMPLE_PROMPTS = [
  'Kalikan Quantity dan UnitPrice',
  'Hitung total bersih setelah diskon persen',
  'Rata-rata Harga Satuan seluruh pesanan',
  'Total keseluruhan unit Quantity',
  'Cari nilai transaksi TotalAmount tertinggi',
  'Jika Quantity > 10 maka "Grosir" selain itu "Retail"',
];

export const FormulaAIAssistantModal: React.FC<FormulaAIAssistantModalProps> = ({
  sheet,
  selectedCell,
  isOpen,
  onClose,
  onApplyFormula,
}) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FormulaSuggestionResult | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const activeCol = selectedCell
    ? sheet.columns.find((c) => c.key === selectedCell.colKey)
    : sheet.columns[0];

  const cellCoord = selectedCell
    ? `${columnIndexToLetter(selectedCell.colIndex)}${selectedCell.rowIndex + 1}`
    : 'A1';

  const handleGenerate = async (queryText?: string) => {
    const q = (queryText !== undefined ? queryText : prompt).trim();
    if (!q) return;

    setLoading(true);
    try {
      const res = await suggestFormulaWithAI(q, sheet, selectedCell);
      setResult(res);
    } catch (err) {
      console.error('Error generating formula:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInsertColumnTag = (colName: string) => {
    setPrompt((prev) => (prev ? `${prev} [${colName}]` : `[${colName}]`));
  };

  const handleCopyFormula = (formula: string) => {
    navigator.clipboard.writeText(formula);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyToActiveCell = () => {
    if (result) {
      onApplyFormula(result.formula, false);
      onClose();
    }
  };

  const handleApplyToColumn = () => {
    if (result) {
      onApplyFormula(result.formula, true);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight">Formula AI Assistant</h3>
                <span className="text-[10px] bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 px-2 py-0.5 rounded-full font-mono font-medium">
                  Gemini Smart Engine
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Konversikan kalimat instruksi bahasa manusia menjadi rumus spreadsheet otomatis
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Active Context Banner */}
          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600">
            <div className="flex items-center gap-2">
              <Columns className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                Target Sheet: <strong className="text-slate-900 font-semibold">{sheet.name}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Target Sel:</span>
              <span className="font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">
                {cellCoord} {activeCol ? `(${activeCol.name})` : ''}
              </span>
            </div>
          </div>

          {/* Prompt Input Form */}
          <div className="space-y-2">
            <label className="block text-slate-700 font-bold text-xs">
              Jelaskan apa yang ingin Anda hitung:
            </label>
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                rows={2}
                placeholder="Contoh: Kalikan Quantity dengan UnitPrice dikurangi Diskon..."
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none font-sans"
              />
              <button
                onClick={() => handleGenerate()}
                disabled={loading || !prompt.trim()}
                className="absolute right-2.5 bottom-3.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 transition-colors shadow-xs"
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Menganalisis...</span>
                  </>
                ) : (
                  <>
                    <span>Generate</span>
                    <CornerDownLeft className="w-3 h-3 text-indigo-200" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Example Quick Prompt Chips */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-500" />
              <span>Contoh Instruksi Cepat:</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setPrompt(ex);
                    handleGenerate(ex);
                  }}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 border border-slate-200 rounded-lg text-[11px] text-slate-600 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Insert Columns Chips */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-500">
              Sisipkan Kolom ke Prompt:
            </span>
            <div className="flex flex-wrap gap-1">
              {sheet.columns.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => handleInsertColumnTag(c.name)}
                  className="px-2 py-0.5 bg-slate-50 hover:bg-slate-200/80 border border-slate-200 rounded text-[10px] font-mono text-slate-700 transition-colors"
                  title={`Klik untuk menyisipkan [${c.name}]`}
                >
                  [{c.name}]
                </button>
              ))}
            </div>
          </div>

          {/* AI Generated Result Box */}
          {result && (
            <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-bold text-indigo-900 text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Rekomendasi Rumus AI</span>
                </span>
                <span className="text-[10px] font-mono font-medium text-indigo-700 bg-indigo-100/70 border border-indigo-200 px-2 py-0.5 rounded-full">
                  Fungsi: {result.functionUsed}
                </span>
              </div>

              {/* Highlighted Formula Display */}
              <div className="flex items-center justify-between gap-3 p-3 bg-white border border-indigo-200 rounded-lg font-mono text-sm text-slate-900 shadow-2xs">
                <div className="flex items-center gap-2 overflow-x-auto py-0.5">
                  <span className="text-indigo-600 font-serif italic font-bold">fx</span>
                  <span className="font-bold text-slate-900 font-mono tracking-tight select-all">
                    {result.formula}
                  </span>
                </div>
                <button
                  onClick={() => handleCopyFormula(result.formula)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-sans font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded border border-slate-200 shrink-0 transition-colors"
                  title="Salin rumus ke clipboard"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Salin</span>
                    </>
                  )}
                </button>
              </div>

              {/* Explanation text */}
              <p className="text-xs text-slate-600 leading-relaxed">
                {result.explanation}
              </p>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center justify-end gap-2 border-t border-indigo-100">
                <button
                  type="button"
                  onClick={handleApplyToColumn}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold rounded-lg text-xs transition-colors shadow-2xs"
                >
                  Terapkan ke Seluruh Kolom ({activeCol?.name || 'Kolom Aktif'})
                </button>

                <button
                  type="button"
                  onClick={handleApplyToActiveCell}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <span>Terapkan ke Sel {cellCoord}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-slate-400 text-[11px]">
          <span className="flex items-center gap-1">
            <Info className="w-3 h-3 text-slate-400" />
            <span>Rumus mendukung referensi nama kolom [Kolom] dan koordinat sel Excel (A1, F2).</span>
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1 text-slate-600 hover:bg-slate-200/60 rounded text-xs font-medium"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
