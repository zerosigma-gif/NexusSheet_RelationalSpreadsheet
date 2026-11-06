import React, { useState } from 'react';
import {
  Search,
  Filter,
  X,
  RotateCcw,
  ChevronDown,
  Palette,
  Sparkles
} from 'lucide-react';
import { ColumnDef, FilterOperator, FilterRule, Sheet, ConditionalFormattingRule } from '../types/spreadsheet';

interface FilterBarProps {
  sheet: Sheet;
  globalQuery: string;
  onSetGlobalQuery: (q: string) => void;
  filters: FilterRule[];
  onAddFilter: (rule: FilterRule) => void;
  onRemoveFilter: (id: string) => void;
  onClearAllFilters: () => void;
  totalRowCount: number;
  filteredRowCount: number;
  conditionalRules?: ConditionalFormattingRule[];
  onOpenConditionalFormatting?: () => void;
  onToggleConditionalRule?: (ruleId: string) => void;
  onRemoveConditionalRule?: (ruleId: string) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  sheet,
  globalQuery,
  onSetGlobalQuery,
  filters,
  onAddFilter,
  onRemoveFilter,
  onClearAllFilters,
  totalRowCount,
  filteredRowCount,
  conditionalRules = [],
  onOpenConditionalFormatting,
  onToggleConditionalRule,
  onRemoveConditionalRule,
}) => {
  const activeRulesCount = conditionalRules.filter((r) => r.enabled).length;
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [selectedColumnKey, setSelectedColumnKey] = useState<string>(
    sheet.columns[0]?.key || ''
  );
  const [selectedOperator, setSelectedOperator] = useState<FilterOperator>('contains');
  const [filterValue, setFilterValue] = useState('');
  const [secondValue, setSecondValue] = useState('');

  // Synchronize selectedColumnKey when active sheet or its columns change
  React.useEffect(() => {
    if (!sheet.columns.some((c) => c.key === selectedColumnKey)) {
      const defaultCol = sheet.columns[0];
      setSelectedColumnKey(defaultCol?.key || '');
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

  // When column changes, set appropriate default operator
  const handleColumnChange = (key: string) => {
    setSelectedColumnKey(key);
    const col = sheet.columns.find((c) => c.key === key);
    if (!col) return;

    if (col.type === 'number' || col.type === 'currency' || col.type === 'percentage') {
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

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedColumnKey) return;

    const requiresValue = !['is_empty', 'is_not_empty', 'this_month', 'this_year'].includes(
      selectedOperator
    );
    if (requiresValue && String(filterValue).trim() === '') {
      return;
    }

    const newRule: FilterRule = {
      id: `filter-${Date.now()}`,
      columnKey: selectedColumnKey,
      operator: selectedOperator,
      value: filterValue,
      secondValue:
        selectedOperator === 'between' || selectedOperator === 'date_range' ? secondValue : undefined,
    };

    onAddFilter(newRule);
    setFilterPopoverOpen(false);
    setFilterValue('');
    setSecondValue('');
  };



  const getOperatorLabel = (op: FilterOperator): string => {
    switch (op) {
      case 'contains':
        return 'mengandung';
      case 'not_contains':
        return 'tidak mengandung';
      case 'equals':
        return '=';
      case 'not_equals':
        return '≠';
      case 'greater_than':
        return '>';
      case 'greater_equal':
        return '≥';
      case 'less_than':
        return '<';
      case 'less_equal':
        return '≤';
      case 'between':
        return 'antara';
      case 'starts_with':
        return 'diawali';
      case 'ends_with':
        return 'diakhiri';
      case 'is_empty':
        return 'kosong';
      case 'is_not_empty':
        return 'tidak kosong';
      case 'date_range':
        return 'rentang tanggal';
      case 'this_month':
        return 'bulan ini';
      case 'this_year':
        return 'tahun ini';
      default:
        return op;
    }
  };

  return (
    <div className="bg-white border-b border-slate-200 px-4 py-2.5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Global Search & Add Filter Button */}
        <div className="flex items-center gap-2 flex-1 max-w-2xl">
          {/* Quick Search */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari cepat di semua kolom aktif..."
              value={globalQuery}
              onChange={(e) => onSetGlobalQuery(e.target.value)}
              className="w-full pl-8.5 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-slate-400 focus:bg-white transition-all"
            />
            {globalQuery && (
              <button
                onClick={() => onSetGlobalQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Add Filter Button + Popover Trigger */}
          <div className="relative">
            <button
              onClick={() => setFilterPopoverOpen(!filterPopoverOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 text-slate-800 text-xs font-semibold rounded-lg transition-colors shadow-2xs whitespace-nowrap"
            >
              <Filter className="w-3.5 h-3.5 text-slate-600" />
              <span>+ Filter Kolom</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* Filter Popover Form */}
            {filterPopoverOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setFilterPopoverOpen(false)}
                />
                <div className="absolute left-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-40 p-4 text-xs animate-in fade-in zoom-in-95">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Filter className="w-3.5 h-3.5 text-slate-600" />
                      <span>Buat Filter Kolom</span>
                    </span>
                    <button
                      onClick={() => setFilterPopoverOpen(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <form onSubmit={handleApplyFilter} className="space-y-3">
                    {/* Column Select */}
                    <div>
                      <label className="block text-slate-600 font-medium mb-1">Pilih Kolom</label>
                      <select
                        value={selectedColumnKey}
                        onChange={(e) => handleColumnChange(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-slate-800 text-xs focus:ring-1 focus:ring-slate-400"
                      >
                        {sheet.columns.map((col) => (
                          <option key={col.key} value={col.key}>
                            {col.name} ({col.type})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Operator Select */}
                    <div>
                      <label className="block text-slate-600 font-medium mb-1">Kondisi / Operator</label>
                      <select
                        value={selectedOperator}
                        onChange={(e) => setSelectedOperator(e.target.value as FilterOperator)}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-slate-800 text-xs"
                      >
                        {getOperatorsForType(currentColumn?.type || 'text').map((op) => (
                          <option key={op} value={op}>
                            {getOperatorLabel(op)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Value Input */}
                    {!['is_empty', 'is_not_empty', 'this_month', 'this_year'].includes(
                      selectedOperator
                    ) && (
                      <div>
                        <label className="block text-slate-600 font-medium mb-1">
                          {selectedOperator === 'between' ? 'Nilai Minimum' : selectedOperator === 'date_range' ? 'Dari Tanggal' : 'Nilai Filter'}
                        </label>
                        {currentColumn?.type === 'category' && currentColumn.categoryColors ? (
                          <select
                            value={filterValue}
                            onChange={(e) => setFilterValue(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-slate-800 text-xs"
                          >
                            <option value="">Pilih opsi...</option>
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
                                : currentColumn?.type === 'number' || currentColumn?.type === 'currency' || currentColumn?.type === 'percentage'
                                ? 'number'
                                : 'text'
                            }
                            value={filterValue}
                            onChange={(e) => setFilterValue(e.target.value)}
                            placeholder="Ketik nilai..."
                            required
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-slate-800 text-xs"
                          />
                        )}
                      </div>
                    )}

                    {/* Second Value for Between or Date Range */}
                    {(selectedOperator === 'between' || selectedOperator === 'date_range') && (
                      <div>
                        <label className="block text-slate-600 font-medium mb-1">
                          {selectedOperator === 'date_range' ? 'Sampai Tanggal' : 'Nilai Maksimum'}
                        </label>
                        <input
                          type={selectedOperator === 'date_range' ? 'date' : 'number'}
                          value={secondValue}
                          onChange={(e) => setSecondValue(e.target.value)}
                          placeholder="Nilai batas akhir..."
                          required
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-slate-800 text-xs"
                        />
                      </div>
                    )}

                    <div className="pt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setFilterPopoverOpen(false)}
                        className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md text-xs font-medium"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-slate-900 text-white rounded-md text-xs font-semibold hover:bg-slate-800 transition-colors"
                      >
                        Terapkan Filter
                      </button>
                    </div>
                  </form>
                </div>
              </>
            )}
          </div>

          {/* Conditional Formatting Trigger Button */}
          {onOpenConditionalFormatting && (
            <button
              onClick={onOpenConditionalFormatting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 text-slate-800 text-xs font-semibold rounded-lg transition-colors shadow-2xs whitespace-nowrap"
              title="Kelola Aturan Format Bersyarat (Heatmap, Skala Warna, Kumpulan Ikon)"
            >
              <Palette className="w-3.5 h-3.5 text-indigo-600" />
              <span>Format Bersyarat</span>
              {activeRulesCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold">
                  {activeRulesCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Right: Counter badge & Clear All */}
        <div className="flex items-center gap-3 text-xs">
          <div className="text-slate-500 tabular-nums">
            Menampilkan <span className="font-semibold text-slate-900">{filteredRowCount}</span> dari{' '}
            <span className="font-semibold text-slate-900">{totalRowCount}</span> baris
          </div>

          {(filters.length > 0 || globalQuery) && (
            <button
              onClick={() => {
                onClearAllFilters();
                onSetGlobalQuery('');
              }}
              className="flex items-center gap-1 text-red-600 hover:text-red-700 font-medium text-[11px] hover:underline"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Filter</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Filter & Conditional Format Chips */}
      {(filters.length > 0 || (conditionalRules && conditionalRules.some((r) => r.enabled))) && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {filters.length > 0 && (
            <>
              <span className="text-[11px] font-medium text-slate-400">Filter:</span>
              {filters.map((f) => {
                const col = sheet.columns.find((c) => c.key === f.columnKey);
                return (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-800 border border-slate-200 shadow-2xs font-medium"
                  >
                    <span className="text-slate-500">{col?.name || f.columnKey}</span>
                    <span className="text-slate-400 font-mono text-[10px]">{getOperatorLabel(f.operator)}</span>
                    <span className="font-semibold text-slate-900">
                      {f.secondValue ? `${f.value} s/d ${f.secondValue}` : String(f.value || '')}
                    </span>
                    <button
                      onClick={() => onRemoveFilter(f.id)}
                      className="p-0.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </>
          )}

          {conditionalRules && conditionalRules.filter((r) => r.enabled).length > 0 && (
            <>
              <span className="text-[11px] font-medium text-indigo-500 ml-1">Format Bersyarat:</span>
              {conditionalRules
                .filter((r) => r.enabled)
                .map((r) => {
                  const col = sheet.columns.find((c) => c.key === r.columnKey);
                  return (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] bg-indigo-50/80 text-indigo-900 border border-indigo-200 shadow-2xs font-medium"
                    >
                      <Palette className="w-3 h-3 text-indigo-600" />
                      <span className="text-indigo-700">{col?.name || r.columnKey}</span>
                      <span className="text-indigo-500 font-mono text-[10px]">
                        {r.type === 'color_scale'
                          ? '🔥 Heatmap'
                          : r.type === 'icon_set'
                          ? '🚦 Ikon'
                          : r.type === 'data_bar'
                          ? '📊 DataBar'
                          : '✨ Sorot'}
                      </span>
                      {onRemoveConditionalRule && (
                        <button
                          onClick={() => onRemoveConditionalRule(r.id)}
                          className="p-0.5 hover:bg-indigo-200 rounded-full text-indigo-400 hover:text-indigo-700 transition-colors"
                          title="Hapus format bersyarat ini"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  );
                })}
            </>
          )}
        </div>
      )}
    </div>
  );
};

function getOperatorsForType(type: string): FilterOperator[] {
  switch (type) {
    case 'number':
    case 'currency':
    case 'percentage':
    case 'rating':
      return [
        'greater_than',
        'greater_equal',
        'less_than',
        'less_equal',
        'equals',
        'not_equals',
        'between',
        'is_empty',
        'is_not_empty',
      ];
    case 'date':
      return ['date_range', 'this_month', 'this_year', 'equals', 'is_empty', 'is_not_empty'];
    case 'category':
      return ['equals', 'not_equals', 'is_empty', 'is_not_empty'];
    default:
      return [
        'contains',
        'not_contains',
        'equals',
        'starts_with',
        'ends_with',
        'is_empty',
        'is_not_empty',
      ];
  }
}
