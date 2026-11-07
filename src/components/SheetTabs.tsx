import React, { useState } from 'react';
import {
  Plus,
  Table,
  Link2,
  MoreVertical,
  Edit2,
  Copy,
  Trash2,
  Check,
  X,
  XCircle,
  RotateCcw,
  Eraser,
  Layers,
  ChevronDown,
  FileSpreadsheet
} from 'lucide-react';
import { Sheet } from '../types/spreadsheet';

interface SheetTabsProps {
  sheets: Sheet[];
  activeSheetId: string;
  onSelectSheet: (id: string) => void;
  onAddSheet: () => void;
  onRenameSheet: (id: string, newName: string) => void;
  onDuplicateSheet: (id: string) => void;
  onDeleteSheet: (id: string) => void;
  onCloseOtherSheets?: (id: string) => void;
  onClearSheetData?: (id: string) => void;
  onResetDemo?: () => void;
}

export const SheetTabs: React.FC<SheetTabsProps> = ({
  sheets,
  activeSheetId,
  onSelectSheet,
  onAddSheet,
  onRenameSheet,
  onDuplicateSheet,
  onDeleteSheet,
  onCloseOtherSheets,
  onClearSheetData,
  onResetDemo,
}) => {
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [showSheetListDropdown, setShowSheetListDropdown] = useState(false);

  const startRename = (sheet: Sheet) => {
    setEditingSheetId(sheet.id);
    setEditName(sheet.name);
    setActiveMenuId(null);
  };

  const saveRename = (id: string) => {
    if (editName.trim()) {
      onRenameSheet(id, editName.trim());
    }
    setEditingSheetId(null);
  };

  return (
    <div className="bg-white border-b border-slate-200 px-4 flex items-center justify-between overflow-x-auto select-none gap-3">
      {/* Left side: Sheet Tabs List */}
      <div className="flex items-center gap-1.5 py-1.5 min-w-max">
        {sheets.map((sheet) => {
          const isActive = sheet.id === activeSheetId;
          const isEditing = editingSheetId === sheet.id;
          const relationCount = sheet.columns.filter((c) => c.type === 'relation').length;

          return (
            <div
              key={sheet.id}
              className={`group relative flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border transition-all cursor-pointer ${
                isActive
                  ? 'bg-slate-50 border-slate-300 text-slate-900 shadow-2xs font-semibold ring-1 ring-slate-200/50'
                  : 'bg-white border-slate-200/60 text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300'
              }`}
              onClick={() => !isEditing && onSelectSheet(sheet.id)}
            >
              <Table className={`w-3.5 h-3.5 ${isActive ? 'text-slate-800' : 'text-slate-400'}`} />

              {isEditing ? (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename(sheet.id);
                      if (e.key === 'Escape') setEditingSheetId(null);
                    }}
                    autoFocus
                    className="px-1.5 py-0.5 text-xs border border-slate-400 rounded bg-white text-slate-900 outline-hidden w-28 font-medium"
                  />
                  <button
                    onClick={() => saveRename(sheet.id)}
                    className="p-0.5 text-slate-700 hover:text-slate-900"
                    title="Simpan nama"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setEditingSheetId(null)}
                    className="p-0.5 text-slate-400 hover:text-slate-600"
                    title="Batal"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <span
                  onDoubleClick={() => startRename(sheet)}
                  className="truncate max-w-[150px]"
                  title={`${sheet.name} (Klik dua kali untuk ganti nama)`}
                >
                  {sheet.name}
                </span>
              )}

              {/* Records count & Relational indicator */}
              <div className="flex items-center gap-1 text-[10px] text-slate-400 tabular-nums">
                <span>({sheet.data.length})</span>
                {relationCount > 0 && (
                  <span
                    className="text-slate-500 flex items-center"
                    title={`${relationCount} kolom berelasi dengan sheet lain`}
                  >
                    <Link2 className="w-3 h-3" />
                  </span>
                )}
              </div>

              {/* Quick Force Close "X" Button on tab */}
              {!isEditing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSheet(sheet.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-rose-100 hover:text-rose-700 rounded text-slate-400 transition-all"
                  title="Force Close / Tutup sheet ini"
                >
                  <X className="w-3 h-3" />
                </button>
              )}

              {/* Sheet Context Menu Trigger (Titik Tiga) */}
              {!isEditing && (
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuId(activeMenuId === sheet.id ? null : sheet.id);
                    }}
                    className={`p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-200/70 transition-colors ${
                      isActive ? 'opacity-80 hover:opacity-100' : 'opacity-40 group-hover:opacity-100'
                    }`}
                    title="Menu Opsi Sheet (Titik Tiga)"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>

                  {/* Context Menu Dropdown */}
                  {activeMenuId === sheet.id && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(null);
                        }}
                      />
                      <div
                        className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5 text-xs animate-in fade-in zoom-in-95 duration-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Header preview */}
                        <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50/70 text-[11px] text-slate-500 flex items-center justify-between">
                          <span className="font-semibold text-slate-700 truncate max-w-[130px]">
                            {sheet.name}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {sheet.data.length} baris
                          </span>
                        </div>

                        {/* Force Close / Tutup Sheet Action */}
                        <button
                          onClick={() => {
                            onDeleteSheet(sheet.id);
                            setActiveMenuId(null);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-rose-50 text-rose-600 flex items-center gap-2 font-medium transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5 text-rose-500" />
                          <div className="flex flex-col">
                            <span>Force Close / Tutup Sheet</span>
                            <span className="text-[10px] text-rose-400 font-normal">
                              Tutup dan lepaskan sheet ini
                            </span>
                          </div>
                        </button>

                        {/* Close Other Sheets */}
                        {sheets.length > 1 && onCloseOtherSheets && (
                          <button
                            onClick={() => {
                              onCloseOtherSheets(sheet.id);
                              setActiveMenuId(null);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-colors"
                          >
                            <Layers className="w-3.5 h-3.5 text-slate-400" />
                            <span>Tutup Sheet Lain</span>
                          </button>
                        )}

                        {/* Clear Sheet Records */}
                        {onClearSheetData && sheet.data.length > 0 && (
                          <button
                            onClick={() => {
                              onClearSheetData(sheet.id);
                              setActiveMenuId(null);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-amber-50 text-amber-700 flex items-center gap-2 transition-colors"
                          >
                            <Eraser className="w-3.5 h-3.5 text-amber-500" />
                            <div className="flex flex-col">
                              <span>Kosongkan Semua Baris Data</span>
                              <span className="text-[10px] text-amber-500 font-normal">
                                Hapus {sheet.data.length} baris (struktur kolom tetap aman)
                              </span>
                            </div>
                          </button>
                        )}

                        <div className="border-t border-slate-100 my-1" />

                        {/* Rename */}
                        <button
                          onClick={() => startRename(sheet)}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>Ganti Nama Sheet</span>
                        </button>

                        {/* Duplicate */}
                        <button
                          onClick={() => {
                            onDuplicateSheet(sheet.id);
                            setActiveMenuId(null);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                          <span>Duplikasi Sheet</span>
                        </button>

                        {/* Restore Demo Data */}
                        {onResetDemo && (
                          <>
                            <div className="border-t border-slate-100 my-1" />
                            <button
                              onClick={() => {
                                onResetDemo();
                                setActiveMenuId(null);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-emerald-700 flex items-center gap-2 transition-colors"
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                              <div className="flex flex-col">
                                <span className="font-medium">Tampilkan Data Demo</span>
                                <span className="text-[10px] text-emerald-600/80 font-normal">
                                  Muat ulang 3 sheet relasional contoh
                                </span>
                              </div>
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Add New Blank Sheet */}
        <button
          onClick={onAddSheet}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 rounded-md transition-colors font-medium shadow-2xs"
          title="Tambah sheet kosong baru"
        >
          <Plus className="w-3.5 h-3.5 text-slate-700" />
          <span>Sheet Baru</span>
        </button>
      </div>

      {/* Right side: Quick "Tampilkan Sheet" Dropdown & Reset Demo button */}
      <div className="flex items-center gap-2 py-1.5 shrink-0">
        {/* All Sheets Quick Switcher */}
        <div className="relative">
          <button
            onClick={() => setShowSheetListDropdown(!showSheetListDropdown)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md font-medium transition-colors shadow-2xs"
            title="Daftar semua sheet aktif"
          >
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            <span>Tampilkan Sheet ({sheets.length})</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showSheetListDropdown && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowSheetListDropdown(false)}
              />
              <div className="absolute right-0 top-full mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-1.5 text-xs space-y-1">
                <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Daftar Lembar Kerja
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {sheets.map((s) => {
                    const isCur = s.id === activeSheetId;
                    return (
                      <div
                        key={s.id}
                        onClick={() => {
                          onSelectSheet(s.id);
                          setShowSheetListDropdown(false);
                        }}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                          isCur
                            ? 'bg-slate-100 font-bold text-slate-900 border border-slate-300'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Table className={`w-3.5 h-3.5 shrink-0 ${isCur ? 'text-slate-800' : 'text-slate-400'}`} />
                          <span className="truncate">{s.name}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                          {s.data.length} data
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="pt-1 border-t border-slate-100 flex items-center justify-between px-1">
                  <button
                    onClick={() => {
                      onAddSheet();
                      setShowSheetListDropdown(false);
                    }}
                    className="flex items-center gap-1 text-[11px] text-slate-700 hover:text-slate-900 font-medium py-1"
                  >
                    <Plus className="w-3 h-3 text-slate-600" />
                    <span>Tambah Sheet Baru</span>
                  </button>
                  {onResetDemo && (
                    <button
                      onClick={() => {
                        onResetDemo();
                        setShowSheetListDropdown(false);
                      }}
                      className="text-[11px] text-slate-600 hover:text-slate-900 font-medium py-1"
                    >
                      Reset Demo
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Quick Restore Demo Sheets button */}
        {onResetDemo && (
          <button
            onClick={onResetDemo}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-md font-medium transition-colors shadow-2xs"
            title="Muat ulang dataset demo jika sheet demo telah di-force close"
          >
            <RotateCcw className="w-3 h-3 text-slate-500" />
            <span className="hidden sm:inline">Data Demo</span>
          </button>
        )}
      </div>
    </div>
  );
};
