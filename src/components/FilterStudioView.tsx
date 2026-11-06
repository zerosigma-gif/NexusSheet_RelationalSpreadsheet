import React, { useState, useEffect } from 'react';
import {
  Filter,
  Plus,
  Trash2,
  CheckCircle,
  RotateCcw,
  AlertTriangle,
  Info
} from 'lucide-react';
import { FilterOperator, FilterRule, Sheet } from '../types/spreadsheet';

interface FilterStudioViewProps {
  sheet: Sheet;
  filters: FilterRule[];
  onAddFilter: (rule: FilterRule) => void;
  onRemoveFilter: (id: string) => void;
  onClearAll: () => void;
  totalRows: number;
  filteredRows: number;
}

export const FilterStudioView: React.FC<FilterStudioViewProps> = ({
  sheet,
  filters,
  onAddFilter,
  onRemoveFilter,
  onClearAll,
  totalRows,
  filteredRows,
}) => {
  const [selectedColumnKey, setSelectedColumnKey] = useState<string>(
    sheet.columns[0]?.key || ''
  );
  const [selectedOperator, setSelectedOperator] = useState<FilterOperator>('contains');
  const [filterValue, setFilterValue] = useState('');
  const [secondValue, setSecondValue] = useState('');

  // Synchronize selected column whenever active sheet changes or columns list changes
  useEffect(() => {
    if (!sheet.columns.some((c) => c.key === selectedColumnKey)) {
      const defaultCol = sheet.columns[0];
      const defaultKey = defaultCol?.key || '';
      setSelectedColumnKey(defaultKey);
      if (defaultCol) {
        if (
          defaultCol.type === 'number' ||
          defaultCol.type === 'currency' ||
          defaultCol.type === 'percentage'
        ) {
          setSelectedOperator('greater_than');
        } else if (defaultCol.type === 'category') {
          setSelectedOperator('equals');
        } else if (defaultCol.type === 'date') {
          setSelectedOperator('date_range');
        } else {
          setSelectedOperator('contains');
        }
      }
      setFilterValue('');
      setSecondValue('');
    }
  }, [sheet.id, sheet.columns, selectedColumnKey]);

  const currentColumn =
    sheet.columns.find((c) => c.key === selectedColumnKey) || sheet.columns[0];

  const handleColumnChange = (key: string) => {
    setSelectedColumnKey(key);
    const col = sheet.columns.find((c) => c.key === key);
    if (!col) return;

    if (
      col.type === 'number' ||
      col.type === 'currency' ||
      col.type === 'percentage' ||
      col.type === 'rating'
    ) {
      setSelectedOperator('greater_than');
    } else if (col.type === 'category') {
      setSelectedOperator('equals');
    } else if (col.type === 'date') {
      setSelectedOperator('date_range');
    } else {
      setSelectedOperator('contains');
    }
    setFilterValue('');
    setSecondValue('');
  };

  const handleAddFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedColumnKey) return;

    // Value validation for operators that need a value
    const requiresValue = !['is_empty', 'is_not_empty', 'this_month', 'this_year'].includes(
      selectedOperator
    );
    if (requiresValue && String(filterValue).trim() === '') {
      return;
    }

    onAddFilter({
      id: `filter-${Date.now()}`,
      columnKey: selectedColumnKey,
      operator: selectedOperator,
      value: filterValue,
      secondValue:
        selectedOperator === 'between' || selectedOperator === 'date_range'
          ? secondValue
          : undefined,
    });

    setFilterValue('');
    setSecondValue('');
  };

  const reductionPercent =
    totalRows > 0 ? (((totalRows - filteredRows) / totalRows) * 100).toFixed(0) : '0';

  return (
    <div className="flex-1 bg-slate-50 p-6 overflow-y-auto space-y-6">
      {/* Studio Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-50 text-amber-700 rounded-lg">
              <Filter className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Filter Studio & Presisi Query ({sheet.name})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Kelola filter multi-kondisi berantai dengan eksekusi instan ke seluruh visualisasi dan grid spreadsheet
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-lg text-xs">
            <span className="text-slate-500">Hasil Saringan: </span>
            <strong className="text-slate-900 font-bold">{filteredRows}</strong> dari{' '}
            <strong className="text-slate-900">{totalRows}</strong> baris ({reductionPercent}% tereliminasi)
          </div>

          {filters.length > 0 && (
            <button
              onClick={onClearAll}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-xs font-semibold transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Bersihkan Semua</span>
            </button>
          )}
        </div>
      </div>



      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Create New Condition Form */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 pb-2 border-b border-slate-100">
            <Plus className="w-4 h-4 text-emerald-600" />
            <span>Tambah Kondisi Filter Baru</span>
          </h3>

          <form onSubmit={handleAddFilterSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Target Kolom</label>
              <select
                value={selectedColumnKey}
                onChange={(e) => handleColumnChange(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 text-xs focus:ring-1 focus:ring-slate-400"
              >
                {sheet.columns.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name} ({c.type} · {c.category})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Kondisi / Operator</label>
              <select
                value={selectedOperator}
                onChange={(e) => setSelectedOperator(e.target.value as FilterOperator)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 text-xs focus:ring-1 focus:ring-slate-400"
              >
                <option value="contains">Mengandung teks (Contains)</option>
                <option value="not_contains">Tidak mengandung (Does not contain)</option>
                <option value="equals">Sama dengan (=)</option>
                <option value="not_equals">Tidak sama dengan (≠)</option>
                <option value="greater_than">Lebih besar dari (&gt;)</option>
                <option value="greater_equal">Lebih besar atau sama (≥)</option>
                <option value="less_than">Lebih kecil dari (&lt;)</option>
                <option value="less_equal">Lebih kecil atau sama (≤)</option>
                <option value="between">Di antara rentang (Between)</option>
                <option value="starts_with">Diawali teks (Starts with)</option>
                <option value="ends_with">Diakhiri teks (Ends with)</option>
                <option value="is_empty">Kosong (Is Empty)</option>
                <option value="is_not_empty">Tidak Kosong (Is Not Empty)</option>
                <option value="date_range">Rentang Tanggal (Date Range)</option>
                <option value="this_month">Bulan Ini (Current Month)</option>
                <option value="this_year">Tahun Ini (Current Year)</option>
              </select>
            </div>

            {!['is_empty', 'is_not_empty', 'this_month', 'this_year'].includes(selectedOperator) && (
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {selectedOperator === 'between' ? 'Nilai Minimal' : 'Nilai Saringan'}
                </label>
                {currentColumn?.type === 'category' && currentColumn.categoryColors ? (
                  <select
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 text-xs"
                  >
                    <option value="">Pilih opsi label...</option>
                    {Object.keys(currentColumn.categoryColors).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={
                      selectedOperator === 'date_range'
                        ? 'date'
                        : currentColumn?.type === 'number' ||
                          currentColumn?.type === 'currency' ||
                          currentColumn?.type === 'percentage'
                        ? 'text'
                        : 'text'
                    }
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                    placeholder={
                      currentColumn?.type === 'currency'
                        ? 'Contoh: 40000000 atau 40.000.000'
                        : selectedOperator === 'date_range'
                        ? 'YYYY-MM-DD'
                        : 'Masukkan nilai filter...'
                    }
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 text-xs"
                  />
                )}
                {currentColumn?.type === 'currency' && (
                  <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                    <Info className="w-3 h-3 text-slate-400" />
                    <span>Dukungan otomatis format angka desimal dan titik ribuan rupiah (IDR).</span>
                  </p>
                )}
              </div>
            )}

            {(selectedOperator === 'between' || selectedOperator === 'date_range') && (
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {selectedOperator === 'date_range' ? 'Sampai Tanggal' : 'Nilai Maksimal'}
                </label>
                <input
                  type={selectedOperator === 'date_range' ? 'date' : 'text'}
                  value={secondValue}
                  onChange={(e) => setSecondValue(e.target.value)}
                  placeholder={
                    selectedOperator === 'date_range'
                      ? 'YYYY-MM-DD'
                      : 'Batas maksimal (contoh: 80000000)...'
                  }
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 text-xs"
                />
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 transition-colors shadow-xs"
            >
              Tambahkan ke Rantai Filter
            </button>
          </form>
        </div>

        {/* Right 2 Columns: Active Filter Chains */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 pb-2 border-b border-slate-100 flex items-center justify-between">
              <span>Rantai Aturan Filter Aktif ({filters.length})</span>
              <span className="text-[11px] text-slate-400 font-normal">
                Logika Evaluasi: AND (Semua kriteria terpenuhi)
              </span>
            </h3>

            {filters.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Filter className="w-10 h-10 mx-auto text-slate-200 mb-2" />
                <p className="font-semibold text-slate-600 text-xs">Belum Ada Filter Diterapkan</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Gunakan formulir di sisi kiri atau tombol preset demo di atas untuk memfilter data.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filters.map((f, idx) => {
                  const col = sheet.columns.find((c) => c.key === f.columnKey);
                  const isOrphaned = !col;

                  return (
                    <div
                      key={f.id}
                      className={`p-3 border rounded-lg flex items-center justify-between gap-4 text-xs transition-colors ${
                        isOrphaned
                          ? 'bg-amber-50/50 border-amber-200 text-amber-900'
                          : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-mono text-[11px] flex items-center justify-center font-bold shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{col?.name || f.columnKey}</span>
                            {col?.category ? (
                              <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.2 rounded font-normal font-mono">
                                {col.category}
                              </span>
                            ) : (
                              <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-normal flex items-center gap-1">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                <span>Kolom di luar sheet ini</span>
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                            operator: <strong className="text-slate-800">{f.operator}</strong> · target:{' '}
                            <strong className="text-slate-900">
                              {f.secondValue ? `${f.value} s/d ${f.secondValue}` : String(f.value || '(kosong)')}
                            </strong>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => onRemoveFilter(f.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                        title="Hapus kondisi filter ini"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Semua filter diterapkan secara instan ke Spreadsheet & Visual Analytics</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
