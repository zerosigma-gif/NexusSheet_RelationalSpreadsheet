import React, { useEffect, useRef, useState } from 'react';
import {
  Table,
  Hash,
  Calculator,
  CornerDownLeft,
  ChevronsUpDown,
  BookOpen,
  ArrowRight
} from 'lucide-react';
import { AutocompleteSuggestion } from '../utils/formulaAutocomplete';

interface FormulaAutocompleteDropdownProps {
  suggestions: AutocompleteSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: AutocompleteSuggestion) => void;
  onHoverIndex: (index: number) => void;
  position?: { top: number; left: number; width?: number };
  activeToken: string;
}

export const FormulaAutocompleteDropdown: React.FC<FormulaAutocompleteDropdownProps> = ({
  suggestions,
  selectedIndex,
  onSelect,
  onHoverIndex,
  position,
  activeToken,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'function' | 'column'>('all');

  // Filtered by sub-tab if user wants to narrow down
  const filteredSuggestions = suggestions.filter((s) => {
    if (filterTab === 'all') return true;
    return s.type === filterTab;
  });

  // Ensure selected item scrolls into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector('[data-selected="true"]') as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, filteredSuggestions]);

  if (suggestions.length === 0) return null;

  return (
    <div
      style={
        position
          ? {
              top: `${position.top}px`,
              left: `${position.left}px`,
              minWidth: '320px',
              maxWidth: '440px',
            }
          : undefined
      }
      className="fixed z-50 bg-white/98 backdrop-blur-md border border-slate-200/90 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 select-none text-xs"
      onMouseDown={(e) => {
        // Prevent input blur when clicking inside the dropdown
        e.preventDefault();
      }}
    >
      {/* Header Bar */}
      <div className="bg-slate-50/90 px-3 py-2 border-b border-slate-200/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-700 font-serif italic text-xs font-bold">
            fx
          </div>
          <span className="font-semibold text-slate-800 text-[11px]">
            Saran Rumus & Kolom
          </span>
          {activeToken && (
            <span className="font-mono bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded text-[10px]">
              "{activeToken}"
            </span>
          )}
        </div>

        {/* Tab Filters */}
        <div className="flex items-center bg-slate-200/70 p-0.5 rounded-md text-[10px]">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
              filterTab === 'all'
                ? 'bg-white text-slate-800 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua ({suggestions.length})
          </button>
          <button
            onClick={() => setFilterTab('function')}
            className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
              filterTab === 'function'
                ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Fungsi
          </button>
          <button
            onClick={() => setFilterTab('column')}
            className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
              filterTab === 'column'
                ? 'bg-white text-emerald-700 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Kolom
          </button>
        </div>
      </div>

      {/* Suggestion Items List */}
      <div
        ref={listRef}
        className="max-h-60 overflow-y-auto divide-y divide-slate-100 p-1 space-y-0.5"
      >
        {filteredSuggestions.map((item, idx) => {
          const isSelected = idx === selectedIndex;

          return (
            <div
              key={item.id}
              data-selected={isSelected}
              onMouseEnter={() => onHoverIndex(idx)}
              onClick={() => onSelect(item)}
              className={`flex items-start justify-between gap-3 p-2 rounded-lg cursor-pointer transition-all ${
                isSelected
                  ? 'bg-indigo-50/80 border border-indigo-200 shadow-2xs'
                  : 'hover:bg-slate-50 border border-transparent'
              }`}
            >
              <div className="flex items-start gap-2 min-w-0">
                {/* Type Icon */}
                <div className="pt-0.5">
                  {item.iconType === 'fx' ? (
                    <div className="w-5 h-5 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center font-serif italic text-[11px] font-bold">
                      fx
                    </div>
                  ) : item.iconType === 'column' ? (
                    <div className="w-5 h-5 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <Table className="w-3 h-3" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded bg-amber-100 text-amber-700 flex items-center justify-center">
                      <Hash className="w-3 h-3" />
                    </div>
                  )}
                </div>

                {/* Content info */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono font-bold text-slate-900 text-xs">
                      {item.title}
                    </span>
                    {item.badge && (
                      <span
                        className={`text-[9px] font-medium px-1.5 py-0.2 rounded border font-mono ${
                          item.badgeColor || 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                    {item.subtitle}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Enter / Action indicator */}
              {isSelected && (
                <div className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 bg-white border border-indigo-200 px-1.5 py-0.5 rounded shadow-2xs shrink-0 self-center">
                  <CornerDownLeft className="w-3 h-3" />
                  <span>Pilih</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Hints */}
      <div className="bg-slate-50 px-3 py-1.5 border-t border-slate-200/80 flex items-center justify-between text-[10px] text-slate-400">
        <div className="flex items-center gap-2">
          <span>Gunakan <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded font-mono text-[9px] text-slate-600">↑</kbd> <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded font-mono text-[9px] text-slate-600">↓</kbd> navigasi</span>
          <span>•</span>
          <span><kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded font-mono text-[9px] text-slate-600">Tab</kbd> atau <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded font-mono text-[9px] text-slate-600">Enter</kbd> untuk melengkapi</span>
        </div>
        <div className="text-slate-400 font-medium">
          <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded font-mono text-[9px] text-slate-600">Esc</kbd> tutup
        </div>
      </div>
    </div>
  );
};
