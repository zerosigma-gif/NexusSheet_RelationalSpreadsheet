import React, { useState } from 'react';
import {
  Tag,
  Hash,
  DollarSign,
  Calendar,
  Layers,
  Star,
  Percent,
  Link2,
  SlidersHorizontal,
  X,
  Check,
  Plus,
  Eye,
  EyeOff
} from 'lucide-react';
import { ColumnDef, ColumnType, ColumnSummary, Sheet } from '../types/spreadsheet';
import { getCategoryBadgeStyle } from '../utils/formatters';

interface ColumnCategoryManagerProps {
  sheet: Sheet;
  allSheets: Sheet[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  onUpdateColumn: (updatedCol: ColumnDef) => void;
  onAddColumn: (newCol: ColumnDef) => void;
}

const PRESET_CATEGORIES = [
  'Identifikasi',
  'Relasi Entitas',
  'Finansial & Volume',
  'Logistik & Waktu',
  'Status & Operasional',
  'Profil & Identitas',
  'Spesifikasi & Nama',
  'Klasifikasi Pasar',
  'Gudang & Inventaris',
  'Komersial & Biaya',
  'Mutu & Supplier',
  'Kustom',
];

export const ColumnCategoryManager: React.FC<ColumnCategoryManagerProps> = ({
  sheet,
  allSheets,
  selectedCategory,
  onSelectCategory,
  onUpdateColumn,
  onAddColumn,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeEditingCol, setActiveEditingCol] = useState<ColumnDef | null>(null);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [isAddingColumn, setIsAddingColumn] = useState(false);

  // New column form state
  const [newColKey, setNewColKey] = useState('');
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<ColumnType>('text');
  const [newColCategory, setNewColCategory] = useState('Finansial & Volume');

  // Extract distinct categories currently present in this sheet
  const distinctCategories = Array.from(
    new Set(sheet.columns.map((c) => c.category || 'General Data'))
  );

  const startEditColumn = (col: ColumnDef) => {
    setActiveEditingCol({ ...col });
  };

  const handleSaveColumnEdit = () => {
    if (activeEditingCol) {
      onUpdateColumn(activeEditingCol);
      setActiveEditingCol(null);
    }
  };

  const handleCreateNewColumn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;

    const key = newColKey.trim() || newColName.trim().replace(/\s+/g, '_');
    const newCol: ColumnDef = {
      key,
      name: newColName.trim(),
      type: newColType,
      category: newCategoryInput.trim() || newColCategory,
      summary: newColType === 'currency' || newColType === 'number' ? 'sum' : 'none',
      width: 140,
      visible: true,
      currencyCode: 'IDR',
    };

    onAddColumn(newCol);
    setIsAddingColumn(false);
    setNewColName('');
    setNewColKey('');
    setNewCategoryInput('');
  };

  return (
    <>
      {/* Category Filter Chips Bar */}
      <div className="bg-slate-50/70 border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1 mr-1">
            <Tag className="w-3 h-3 text-slate-500" />
            <span>Kategori Kolom:</span>
          </span>

          <button
            onClick={() => onSelectCategory('ALL')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors shrink-0 ${
              selectedCategory === 'ALL'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            Semua ({sheet.columns.length})
          </button>

          {distinctCategories.map((cat) => {
            const count = sheet.columns.filter((c) => c.category === cat).length;
            const style = getCategoryBadgeStyle(cat);
            const isSelected = selectedCategory === cat;

            return (
              <button
                key={cat}
                onClick={() => onSelectCategory(cat)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors shrink-0 flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-slate-800 text-white shadow-2xs'
                    : `${style.bg} ${style.text} border ${style.border} hover:opacity-85`
                }`}
              >
                <span>{cat}</span>
                <span className="opacity-70 text-[10px]">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Action Button to Open Categorization Studio */}
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-md text-[11px] font-medium transition-colors shrink-0 shadow-2xs"
        >
          <SlidersHorizontal className="w-3 h-3 text-slate-500" />
          <span>Kelola Tipe & Kategori</span>
        </button>
      </div>

      {/* Column Categorization & Schema Drawer Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
                  <span>Kategorisasi & Konfigurasi Kolom ({sheet.name})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Atur domain kategori, relasi antar sheet, tipe data presisi, dan kalkulasi agregasi
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between pb-2">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Daftar Kolom Aktif ({sheet.columns.length})
                </span>
                <button
                  onClick={() => setIsAddingColumn(!isAddingColumn)}
                  className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Kolom Baru</span>
                </button>
              </div>

              {/* Add New Column Mini Form */}
              {isAddingColumn && (
                <form
                  onSubmit={handleCreateNewColumn}
                  className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-lg text-xs space-y-3 mb-4"
                >
                  <div className="font-semibold text-emerald-900">Buat Kolom Baru di Sheet Ini</div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">Nama Kolom</label>
                      <input
                        type="text"
                        placeholder="e.g. Target Penjualan"
                        value={newColName}
                        onChange={(e) => setNewColName(e.target.value)}
                        required
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded bg-white text-slate-900 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">Tipe Data</label>
                      <select
                        value={newColType}
                        onChange={(e) => setNewColType(e.target.value as ColumnType)}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-slate-900 text-xs"
                      >
                        <option value="text">Teks Biasa</option>
                        <option value="number">Angka / Numerik</option>
                        <option value="currency">Mata Uang (IDR)</option>
                        <option value="date">Tanggal (Date)</option>
                        <option value="category">Kategori / Label Tag</option>
                        <option value="percentage">Persentase (%)</option>
                        <option value="rating">Rating (Bintang)</option>
                        <option value="boolean">Boolean (Ya/Tidak)</option>
                        <option value="relation">Relasi ke Sheet Lain</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">Kategori Domain</label>
                      <select
                        value={newColCategory}
                        onChange={(e) => setNewColCategory(e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-slate-900 text-xs"
                      >
                        {PRESET_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end gap-2">
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded font-medium hover:bg-emerald-700 transition-colors w-full"
                      >
                        Simpan Kolom
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddingColumn(false)}
                        className="px-2 py-1.5 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-colors"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Table of Columns */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100/75 border-b border-slate-200 font-semibold text-slate-700">
                    <tr>
                      <th className="px-3 py-2 w-10">Tampil</th>
                      <th className="px-3 py-2">Nama & Key</th>
                      <th className="px-3 py-2">Kategori Domain</th>
                      <th className="px-3 py-2">Tipe Data</th>
                      <th className="px-3 py-2">Agregasi Ringkasan</th>
                      <th className="px-3 py-2">Validasi Data</th>
                      <th className="px-3 py-2">Relasi Target</th>
                      <th className="px-3 py-2 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sheet.columns.map((col) => {
                      const isEditing = activeEditingCol?.key === col.key;
                      const badgeStyle = getCategoryBadgeStyle(col.category);

                      if (isEditing && activeEditingCol) {
                        return (
                          <tr key={col.key} className="bg-blue-50/40">
                            <td className="px-3 py-2.5">
                              <input
                                type="checkbox"
                                checked={activeEditingCol.visible}
                                onChange={(e) =>
                                  setActiveEditingCol({
                                    ...activeEditingCol,
                                    visible: e.target.checked,
                                  })
                                }
                                className="rounded text-blue-600"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="text"
                                value={activeEditingCol.name}
                                onChange={(e) =>
                                  setActiveEditingCol({
                                    ...activeEditingCol,
                                    name: e.target.value,
                                  })
                                }
                                className="px-2 py-1 border border-slate-300 rounded bg-white text-xs w-full"
                              />
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-[10px] text-slate-400 font-mono">key: {activeEditingCol.key}</span>
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={!!activeEditingCol.isPrimaryKey}
                                    onChange={(e) =>
                                      setActiveEditingCol({
                                        ...activeEditingCol,
                                        isPrimaryKey: e.target.checked,
                                      })
                                    }
                                    className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500 border-slate-300"
                                  />
                                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-1 py-0.5 rounded shadow-2xs">
                                    PK
                                  </span>
                                </label>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <select
                                value={activeEditingCol.category}
                                onChange={(e) =>
                                  setActiveEditingCol({
                                    ...activeEditingCol,
                                    category: e.target.value,
                                  })
                                }
                                className="px-2 py-1 border border-slate-300 rounded bg-white text-xs w-full"
                              >
                                {PRESET_CATEGORIES.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2.5">
                              <select
                                value={activeEditingCol.type}
                                onChange={(e) =>
                                  setActiveEditingCol({
                                    ...activeEditingCol,
                                    type: e.target.value as ColumnType,
                                  })
                                }
                                className="px-2 py-1 border border-slate-300 rounded bg-white text-xs w-full"
                              >
                                <option value="text">Teks Biasa</option>
                                <option value="number">Angka / Numerik</option>
                                <option value="currency">Mata Uang (Currency)</option>
                                <option value="date">Tanggal</option>
                                <option value="category">Kategori / Tag</option>
                                <option value="percentage">Persentase (%)</option>
                                <option value="rating">Rating</option>
                                <option value="boolean">Boolean</option>
                                <option value="relation">Relasi (Foreign Key)</option>
                              </select>
                            </td>
                            <td className="px-3 py-2.5">
                              <select
                                value={activeEditingCol.summary}
                                onChange={(e) =>
                                  setActiveEditingCol({
                                    ...activeEditingCol,
                                    summary: e.target.value as ColumnSummary,
                                  })
                                }
                                className="px-2 py-1 border border-slate-300 rounded bg-white text-xs w-full"
                              >
                                <option value="none">Tidak Ada</option>
                                <option value="sum">Sum (Jumlah)</option>
                                <option value="avg">Avg (Rata-rata)</option>
                                <option value="min">Min (Terendah)</option>
                                <option value="max">Max (Tertinggi)</option>
                                <option value="count">Count (Total Baris)</option>
                                <option value="unique">Unique (Nilai Unik)</option>
                              </select>
                            </td>
                            <td className="px-3 py-2.5">
                              <select
                                value={activeEditingCol.validation?.type || 'none'}
                                onChange={(e) => {
                                  const t = e.target.value;
                                  setActiveEditingCol({
                                    ...activeEditingCol,
                                    validation: t === 'none' ? undefined : { type: t as any },
                                  });
                                }}
                                className="px-2 py-1 border border-slate-300 rounded bg-white text-xs w-full"
                              >
                                <option value="none">Bebas (Tanpa Validasi)</option>
                                <option value="numeric">Angka Numerik</option>
                                <option value="positive_number">Angka Positif (&gt; 0)</option>
                                <option value="range">Rentang Nilai</option>
                                <option value="unique">Nilai Unik</option>
                                <option value="required">Wajib Diisi</option>
                                <option value="email">Email Valid</option>
                              </select>
                            </td>
                            <td className="px-3 py-2.5">
                              {activeEditingCol.type === 'relation' ? (
                                <div className="space-y-1">
                                  <select
                                    value={activeEditingCol.relation?.targetSheetId || ''}
                                    onChange={(e) => {
                                      const targetSheet = allSheets.find(
                                        (s) => s.id === e.target.value
                                      );
                                      setActiveEditingCol({
                                        ...activeEditingCol,
                                        relation: {
                                          targetSheetId: e.target.value,
                                          targetColumnKey:
                                            targetSheet?.primaryKey ||
                                            targetSheet?.columns[0]?.key ||
                                            '',
                                          displayColumnKey: targetSheet?.columns[1]?.key,
                                        },
                                      });
                                    }}
                                    className="px-1.5 py-1 border border-slate-300 rounded bg-white text-xs w-full"
                                  >
                                    <option value="">Pilih Sheet Tujuan...</option>
                                    {allSheets
                                      .filter((s) => s.id !== sheet.id)
                                      .map((s) => (
                                        <option key={s.id} value={s.id}>
                                          {s.name}
                                        </option>
                                      ))}
                                  </select>
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right space-x-1">
                              <button
                                onClick={handleSaveColumnEdit}
                                className="px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors"
                              >
                                Simpan
                              </button>
                              <button
                                onClick={() => setActiveEditingCol(null)}
                                className="px-2 py-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-colors"
                              >
                                Batal
                              </button>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={col.key} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => onUpdateColumn({ ...col, visible: !col.visible })}
                              className="text-slate-400 hover:text-slate-700"
                              title={col.visible ? 'Sembunyikan Kolom' : 'Tampilkan Kolom'}
                            >
                              {col.visible ? (
                                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">
                            <div className="flex items-center gap-1.5">
                              <span>{col.name}</span>
                              {col.isPrimaryKey && (
                                <span className="text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-1 py-0.2 rounded shadow-2xs">
                                  PK
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">{col.key}</div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-medium border ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
                            >
                              {col.category}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 capitalize text-slate-600 flex items-center gap-1.5">
                            {getTypeIcon(col.type)}
                            <span>{col.type}</span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600 uppercase text-[11px]">
                            {col.summary !== 'none' ? col.summary : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">
                            {col.validation && col.validation.type !== 'none' ? (
                              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-mono text-[10px]">
                                {col.validation.type}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">
                            {col.type === 'relation' && col.relation ? (
                              <div className="flex items-center gap-1 text-indigo-600 text-[11px]">
                                <Link2 className="w-3 h-3" />
                                <span>
                                  {allSheets.find((s) => s.id === col.relation?.targetSheetId)?.name || 'Sheet'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              onClick={() => startEditColumn(col)}
                              className="text-indigo-600 hover:text-indigo-800 font-medium text-xs"
                            >
                              Ubah
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

function getTypeIcon(type: ColumnType) {
  switch (type) {
    case 'number':
      return <Hash className="w-3.5 h-3.5 text-blue-500" />;
    case 'currency':
      return <DollarSign className="w-3.5 h-3.5 text-emerald-500" />;
    case 'date':
      return <Calendar className="w-3.5 h-3.5 text-amber-500" />;
    case 'category':
      return <Layers className="w-3.5 h-3.5 text-purple-500" />;
    case 'rating':
      return <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />;
    case 'percentage':
      return <Percent className="w-3.5 h-3.5 text-teal-500" />;
    case 'relation':
      return <Link2 className="w-3.5 h-3.5 text-indigo-500" />;
    default:
      return <Tag className="w-3.5 h-3.5 text-slate-400" />;
  }
}
