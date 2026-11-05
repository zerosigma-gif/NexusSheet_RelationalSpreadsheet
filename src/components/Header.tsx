import React, { useRef, useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Download,
  RotateCcw,
  Layers,
  BarChart3,
  GitFork,
  Filter,
  FileText,
  ChevronDown,
  Undo2,
  Redo2
} from 'lucide-react';
import { Sheet } from '../types/spreadsheet';

interface HeaderProps {
  activeTab: 'spreadsheet' | 'charts' | 'relations' | 'filters';
  setActiveTab: (tab: 'spreadsheet' | 'charts' | 'relations' | 'filters') => void;
  sheets: Sheet[];
  activeSheet: Sheet;
  onImportExcelOrCsv: (file: File) => void;
  onExportExcel: (workbook: boolean) => void;
  onExportCsv: () => void;
  onResetDemo: () => void;
  filterCount: number;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  sheets,
  activeSheet,
  onImportExcelOrCsv,
  onExportExcel,
  onExportCsv,
  onResetDemo,
  filterCount,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportExcelOrCsv(file);
      e.target.value = '';
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-slate-900">
                  NexusSheet
                </span>
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                  Relational Studio
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-none mt-0.5">
                {sheets.length} Sheet Aktif · {activeSheet?.data?.length || 0} Baris Terbaca
              </p>
            </div>
          </div>

          {/* Zone 2: Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('spreadsheet')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'spreadsheet'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Spreadsheet Grid</span>
            </button>

            <button
              onClick={() => setActiveTab('charts')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'charts'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Visual Analytics</span>
            </button>

            <button
              onClick={() => setActiveTab('relations')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'relations'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GitFork className="w-3.5 h-3.5 text-emerald-600" />
              <span>Relational & Join</span>
            </button>

            <button
              onClick={() => setActiveTab('filters')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'filters'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Filter className="w-3.5 h-3.5 text-amber-600" />
              <span>Filter Studio</span>
              {filterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {filterCount}
                </span>
              )}
            </button>
          </nav>

          {/* Zone 3: Primary Action Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Undo & Redo Global Buttons */}
            {onUndo && onRedo && (
              <div className="flex items-center gap-0.5 bg-slate-100 p-1 rounded-lg border border-slate-200/80">
                <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="p-1 rounded text-slate-700 hover:bg-white hover:text-indigo-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-700 transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed"
                  title="Undo / Urungkan (Ctrl+Z)"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="p-1 rounded text-slate-700 hover:bg-white hover:text-indigo-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-700 transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed"
                  title="Redo / Ulangi (Ctrl+Y atau Ctrl+Shift+Z)"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs whitespace-nowrap"
              title="Import file Excel (.xlsx, .xls) atau CSV"
            >
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>Import Excel/CSV</span>
            </button>

            {/* Export Dropdown */}
            <div className="relative">
              <button
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors shadow-xs whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Data</span>
                <ChevronDown className="w-3 h-3 ml-0.5 opacity-80" />
              </button>

              {exportMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setExportMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-40 py-1 text-xs">
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Format Excel (.xlsx)
                    </div>
                    <button
                      onClick={() => {
                        onExportExcel(true);
                        setExportMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                        <span>Semua Sheet (Workbook)</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">.XLSX</span>
                    </button>

                    <button
                      onClick={() => {
                        onExportExcel(false);
                        setExportMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                        <span>Sheet Aktif (Filtered)</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">.XLSX</span>
                    </button>

                    <div className="border-t border-slate-100 my-1"></div>
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Format CSV
                    </div>
                    <button
                      onClick={() => {
                        onExportCsv();
                        setExportMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span>Sheet Aktif (.csv)</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">.CSV</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={onResetDemo}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              title="Reset ke Contoh Data Relasional Default"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
