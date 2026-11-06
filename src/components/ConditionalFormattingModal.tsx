import React, { useState } from 'react';
import {
  X,
  Palette,
  Check,
  Plus,
  Trash2,
  Sliders,
  Sparkles,
  Layers,
  ArrowUpDown,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import {
  Sheet,
  ColumnDef,
  ConditionalFormattingRule,
  ConditionalFormatType,
  ColorScalePreset,
  IconSetType,
  DataBarColor,
  FilterOperator,
} from '../types/spreadsheet';
import { getDefaultConditionalRules } from '../utils/conditionalFormatEngine';

interface ConditionalFormattingModalProps {
  sheet: Sheet;
  isOpen: boolean;
  onClose: () => void;
  rules: ConditionalFormattingRule[];
  onAddRule: (rule: ConditionalFormattingRule) => void;
  onUpdateRule: (rule: ConditionalFormattingRule) => void;
  onDeleteRule: (ruleId: string) => void;
  onResetRules: () => void;
}

export const ConditionalFormattingModal: React.FC<ConditionalFormattingModalProps> = ({
  sheet,
  isOpen,
  onClose,
  rules,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
  onResetRules,
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'add' | 'presets'>('list');

  // Form State for Adding New Rule
  const [targetColumnKey, setTargetColumnKey] = useState<string>(
    sheet.columns.find((c) => c.type === 'currency' || c.type === 'number')?.key || sheet.columns[0]?.key || ''
  );
  const [ruleType, setRuleType] = useState<ConditionalFormatType>('color_scale');
  const [ruleName, setRuleName] = useState<string>('');

  // Color Scale State
  const [colorScalePreset, setColorScalePreset] = useState<ColorScalePreset>('emerald_gradient');

  // Icon Set State
  const [iconSetType, setIconSetType] = useState<IconSetType>('trend_arrows');
  const [iconReverse, setIconReverse] = useState<boolean>(false);

  // Data Bar State
  const [dataBarColor, setDataBarColor] = useState<DataBarColor>('indigo');

  // Single Color State
  const [singleOperator, setSingleOperator] = useState<FilterOperator>('greater_than');
  const [singleValue, setSingleValue] = useState<string>('20000000');
  const [singleSecondValue, setSingleSecondValue] = useState<string>('');
  const [singleStylePreset, setSingleStylePreset] = useState<'green' | 'red' | 'amber' | 'blue'>('green');

  if (!isOpen) return null;

  const currentTargetCol = sheet.columns.find((c) => c.key === targetColumnKey) || sheet.columns[0];

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetColumnKey) return;

    const newId = `cf-${Date.now()}`;
    const generatedName =
      ruleName.trim() ||
      `${
        ruleType === 'color_scale'
          ? 'Heatmap Skala Warna'
          : ruleType === 'icon_set'
          ? 'Kumpulan Ikon'
          : ruleType === 'data_bar'
          ? 'Bilah Data (Data Bar)'
          : 'Format Ambang Batas'
      } (${currentTargetCol?.name || targetColumnKey})`;

    const newRule: ConditionalFormattingRule = {
      id: newId,
      name: generatedName,
      enabled: true,
      columnKey: targetColumnKey,
      type: ruleType,
    };

    if (ruleType === 'color_scale') {
      newRule.colorScale = { preset: colorScalePreset };
    } else if (ruleType === 'icon_set') {
      newRule.iconSet = { type: iconSetType, reverseOrder: iconReverse };
    } else if (ruleType === 'data_bar') {
      newRule.dataBar = { color: dataBarColor, showValue: true };
    } else if (ruleType === 'single_color') {
      const styles = {
        green: { bgColor: '#dcfce7', textColor: '#15803d' },
        red: { bgColor: '#ffe4e6', textColor: '#be123c' },
        amber: { bgColor: '#fef3c7', textColor: '#b45309' },
        blue: { bgColor: '#e0e7ff', textColor: '#3730a3' },
      }[singleStylePreset];

      newRule.singleColor = {
        operator: singleOperator,
        value: singleValue,
        secondValue: singleOperator === 'between' ? singleSecondValue : undefined,
        bgColor: styles.bgColor,
        textColor: styles.textColor,
        bold: true,
      };
    }

    onAddRule(newRule);
    setActiveTab('list');
    setRuleName('');
  };

  const applyPreset = (preset: ConditionalFormattingRule) => {
    // Check if rule for same column & type exists, replace or add
    const existing = rules.find((r) => r.columnKey === preset.columnKey && r.type === preset.type);
    if (existing) {
      onUpdateRule({ ...preset, id: existing.id });
    } else {
      onAddRule({ ...preset, id: `cf-${Date.now()}` });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Format Bersyarat</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                  {sheet.name}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Otomatisasi pewarnaan sel, heatmap gradien, dan kumpulan ikon berdasarkan nilai data.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs Bar */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-200 bg-white shrink-0">
          <button
            onClick={() => setActiveTab('list')}
            className={`pb-2.5 px-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-all ${
              activeTab === 'list'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Daftar Aturan Aktif</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                rules.length > 0
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {rules.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('add')}
            className={`pb-2.5 px-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-all ${
              activeTab === 'add'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Tambah Aturan Baru</span>
          </button>

          <button
            onClick={() => setActiveTab('presets')}
            className={`pb-2.5 px-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-all ${
              activeTab === 'presets'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Preset Cepat 1-Klik</span>
          </button>
        </div>

        {/* Tab 1: List of Active Rules */}
        {activeTab === 'list' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {rules.length === 0 ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 rounded-xl space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                  <Palette className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">Belum Ada Aturan Format Bersyarat</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Buat skala warna heatmap, indikator panah/lampu, atau sorot sel bernilai tinggi secara otomatis.
                  </p>
                </div>
                <div className="pt-2 flex justify-center gap-3">
                  <button
                    onClick={() => setActiveTab('add')}
                    className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-2xs"
                  >
                    + Buat Aturan Sekarang
                  </button>
                  <button
                    onClick={() => setActiveTab('presets')}
                    className="px-3.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-colors"
                  >
                    Gunakan Preset Cepat
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {rules.map((r) => {
                  const targetCol = sheet.columns.find((c) => c.key === r.columnKey);
                  return (
                    <div
                      key={r.id}
                      className={`p-3.5 border rounded-xl flex items-center justify-between gap-4 transition-all ${
                        r.enabled
                          ? 'bg-white border-slate-200 shadow-2xs'
                          : 'bg-slate-50/60 border-slate-200/60 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Enable/Disable Toggle */}
                        <button
                          onClick={() => onUpdateRule({ ...r, enabled: !r.enabled })}
                          className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                            r.enabled ? 'bg-indigo-600' : 'bg-slate-300'
                          }`}
                          title={r.enabled ? 'Nonaktifkan aturan' : 'Aktifkan aturan'}
                        >
                          <div
                            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                              r.enabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900 truncate">
                              {r.name || 'Aturan Format'}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                              Kolom: {targetCol?.name || r.columnKey}
                            </span>
                          </div>

                          {/* Rule Type Details & Preview */}
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                            {r.type === 'color_scale' && r.colorScale && (
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-slate-700">Skala Warna:</span>
                                <div className="w-20 h-3 rounded-full bg-gradient-to-r from-emerald-100 via-amber-200 to-emerald-400 border border-slate-300/60" />
                                <span className="font-mono text-[10px] text-slate-400">
                                  {r.colorScale.preset}
                                </span>
                              </div>
                            )}

                            {r.type === 'icon_set' && r.iconSet && (
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-slate-700">Kumpulan Ikon:</span>
                                <span className="font-mono">
                                  {r.iconSet.type === 'traffic_lights' && '🟢 🟡 🔴'}
                                  {r.iconSet.type === 'trend_arrows' && '▲ ▶ ▼'}
                                  {r.iconSet.type === 'shapes' && '🟩 🟨 🟥'}
                                  {r.iconSet.type === 'stars' && '★★★ ★★☆ ★☆☆'}
                                  {r.iconSet.type === 'status' && '✔ ⚠ ✖'}
                                  {r.iconSet.type === 'flags' && '🚩 🏳 🏁'}
                                </span>
                              </div>
                            )}

                            {r.type === 'data_bar' && r.dataBar && (
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-slate-700">Data Bar:</span>
                                <div className="w-16 h-2.5 bg-slate-100 rounded overflow-hidden border border-slate-200">
                                  <div className="w-2/3 h-full bg-indigo-500 rounded-xs" />
                                </div>
                                <span className="capitalize font-mono text-[10px]">{r.dataBar.color}</span>
                              </div>
                            )}

                            {r.type === 'single_color' && r.singleColor && (
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-slate-700">Sorot:</span>
                                <span
                                  style={{
                                    backgroundColor: r.singleColor.bgColor,
                                    color: r.singleColor.textColor,
                                  }}
                                  className="px-1.5 py-0.2 rounded text-[10px] font-bold border border-black/10"
                                >
                                  {r.singleColor.operator} {r.singleColor.value}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => onDeleteRule(r.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                        title="Hapus aturan ini"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Create New Rule Form */}
        {activeTab === 'add' && (
          <form onSubmit={handleCreateRule} className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Step 1: Target Column */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                1. Pilih Kolom Target
              </label>
              <select
                value={targetColumnKey}
                onChange={(e) => setTargetColumnKey(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 bg-white focus:ring-1 focus:ring-indigo-500"
              >
                {sheet.columns.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name} ({c.type}) {c.isPrimaryKey ? '· [PK]' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Step 2: Format Style Type */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                2. Pilih Model Format Bersyarat
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => setRuleType('color_scale')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    ruleType === 'color_scale'
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="w-full h-3 rounded-md bg-gradient-to-r from-emerald-200 via-amber-200 to-rose-300 mb-2 border border-slate-300/40" />
                  <div className="text-xs font-bold text-slate-900">Skala Warna</div>
                  <div className="text-[10px] text-slate-500">Heatmap nilai tinggi & rendah</div>
                </button>

                <button
                  type="button"
                  onClick={() => setRuleType('icon_set')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    ruleType === 'icon_set'
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-sm tracking-widest mb-1.5">🟢 🟡 🔴</div>
                  <div className="text-xs font-bold text-slate-900">Kumpulan Ikon</div>
                  <div className="text-[10px] text-slate-500">Lampu & panah indikator</div>
                </button>

                <button
                  type="button"
                  onClick={() => setRuleType('data_bar')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    ruleType === 'data_bar'
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="w-full h-3 rounded-md bg-slate-100 mb-2 border border-slate-200 overflow-hidden">
                    <div className="w-3/4 h-full bg-indigo-500" />
                  </div>
                  <div className="text-xs font-bold text-slate-900">Data Bar</div>
                  <div className="text-[10px] text-slate-500">Bilah progress horizontal</div>
                </button>

                <button
                  type="button"
                  onClick={() => setRuleType('single_color')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    ruleType === 'single_color'
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 mb-2">
                    &gt; 20.000.000
                  </div>
                  <div className="text-xs font-bold text-slate-900">Ambang Batas</div>
                  <div className="text-[10px] text-slate-500">Sorot sel spesifik</div>
                </button>
              </div>
            </div>

            {/* Step 3: Specific Configuration based on ruleType */}
            {ruleType === 'color_scale' && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <span className="text-xs font-bold text-slate-800 block">Pilihan Palet Gradien Heatmap</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'emerald_gradient', name: 'Gradien Zamrud (Emerald Heatmap)', grad: 'from-emerald-50 to-emerald-400', desc: 'Nilai tinggi = Hijau pekat' },
                    { id: 'indigo_gradient', name: 'Gradien Indigo Modern', grad: 'from-indigo-50 to-indigo-400', desc: 'Nilai tinggi = Indigo pekat' },
                    { id: 'amber_gradient', name: 'Gradien Amber / Sunset', grad: 'from-amber-50 to-amber-400', desc: 'Nilai tinggi = Jingga pekat' },
                    { id: 'green_yellow_red', name: 'Hijau - Kuning - Merah', grad: 'from-rose-200 via-amber-200 to-emerald-300', desc: 'Tinggi = Hijau, Rendah = Merah' },
                    { id: 'red_yellow_green', name: 'Merah - Kuning - Hijau', grad: 'from-emerald-200 via-amber-200 to-rose-300', desc: 'Tinggi = Merah, Rendah = Hijau' },
                    { id: 'blue_white_red', name: 'Biru - Putih - Merah (Diverging)', grad: 'from-blue-200 via-white to-rose-200', desc: 'Skala divergen dua arah' },
                  ].map((p) => (
                    <label
                      key={p.id}
                      className={`p-2.5 rounded-lg border flex items-center gap-3 cursor-pointer transition-all ${
                        colorScalePreset === p.id
                          ? 'border-indigo-600 bg-white ring-1 ring-indigo-500'
                          : 'border-slate-200 bg-white/70 hover:bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="colorScalePreset"
                        checked={colorScalePreset === p.id}
                        onChange={() => setColorScalePreset(p.id as ColorScalePreset)}
                        className="accent-indigo-600 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-800 text-[11px] truncate">{p.name}</div>
                        <div className={`w-full h-2 rounded bg-gradient-to-r ${p.grad} mt-1 border border-slate-200`} />
                        <span className="text-[10px] text-slate-400 block mt-0.5">{p.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {ruleType === 'icon_set' && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <span className="text-xs font-bold text-slate-800 block">Pilihan Simbol Kumpulan Ikon</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'trend_arrows', name: 'Panah Tren (Naik/Stabil/Turun)', preview: '▲  ▶  ▼' },
                    { id: 'traffic_lights', name: 'Lampu Lalu Lintas', preview: '🟢  🟡  🔴' },
                    { id: 'shapes', name: 'Bentuk Geometris Kotak', preview: '🟩  🟨  🟥' },
                    { id: 'stars', name: 'Bintang Rating (3 Level)', preview: '★★★  ★★☆  ★☆☆' },
                    { id: 'status', name: 'Simbol Status Kinerja', preview: '✔  ⚠  ✖' },
                    { id: 'flags', name: 'Bendera Prioritas', preview: '🚩  🏳  🏁' },
                  ].map((ic) => (
                    <label
                      key={ic.id}
                      className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${
                        iconSetType === ic.id
                          ? 'border-indigo-600 bg-white ring-1 ring-indigo-500'
                          : 'border-slate-200 bg-white/70 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="iconSetType"
                          checked={iconSetType === ic.id}
                          onChange={() => setIconSetType(ic.id as IconSetType)}
                          className="accent-indigo-600"
                        />
                        <span className="font-semibold text-slate-800 text-[11px]">{ic.name}</span>
                      </div>
                      <span className="font-mono text-sm tracking-wider">{ic.preview}</span>
                    </label>
                  ))}
                </div>

                <div className="pt-1 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="iconReverse"
                    checked={iconReverse}
                    onChange={(e) => setIconReverse(e.target.checked)}
                    className="accent-indigo-600 rounded"
                  />
                  <label htmlFor="iconReverse" className="text-xs text-slate-700 cursor-pointer">
                    Balik Urutan Ikon (Nilai Terendah Mendapat Ikon Teratas)
                  </label>
                </div>
              </div>
            )}

            {ruleType === 'data_bar' && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <span className="text-xs font-bold text-slate-800 block">Pilihan Warna Bilah (Data Bar)</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'indigo', name: 'Indigo', bg: 'bg-indigo-500' },
                    { id: 'emerald', name: 'Emerald', bg: 'bg-emerald-500' },
                    { id: 'amber', name: 'Amber', bg: 'bg-amber-500' },
                    { id: 'blue', name: 'Blue', bg: 'bg-blue-500' },
                    { id: 'rose', name: 'Rose', bg: 'bg-rose-500' },
                  ].map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => setDataBarColor(c.id as DataBarColor)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 transition-all ${
                        dataBarColor === c.id
                          ? 'border-indigo-600 bg-white ring-1 ring-indigo-500 font-bold'
                          : 'border-slate-200 bg-white/80'
                      }`}
                    >
                      <span className={`w-3 h-3 rounded-full ${c.bg}`} />
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {ruleType === 'single_color' && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                <span className="text-xs font-bold text-slate-800 block">Kondisi & Warna Sorotan</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Operator Logika:</label>
                    <select
                      value={singleOperator}
                      onChange={(e) => setSingleOperator(e.target.value as FilterOperator)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-800 text-xs"
                    >
                      <option value="greater_than">&gt; Lebih besar dari</option>
                      <option value="greater_equal">&ge; Lebih besar atau sama</option>
                      <option value="less_than">&lt; Lebih kecil dari</option>
                      <option value="less_equal">&le; Lebih kecil atau sama</option>
                      <option value="equals">= Sama dengan</option>
                      <option value="between">Antara (Range)</option>
                      <option value="contains">Mengandung Teks</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Nilai Acuan:</label>
                    <input
                      type="text"
                      value={singleValue}
                      onChange={(e) => setSingleValue(e.target.value)}
                      placeholder="Contoh: 20000000 atau Lunas"
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-800 text-xs"
                    />
                  </div>
                </div>

                {singleOperator === 'between' && (
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Nilai Batas Atas:</label>
                    <input
                      type="text"
                      value={singleSecondValue}
                      onChange={(e) => setSingleSecondValue(e.target.value)}
                      placeholder="Nilai kedua..."
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-800 text-xs"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-slate-600 font-medium mb-1">Preset Gaya Sorotan:</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'green', label: 'Soft Green', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
                      { id: 'red', label: 'Soft Red', bg: 'bg-rose-100 text-rose-800 border-rose-300' },
                      { id: 'amber', label: 'Soft Amber', bg: 'bg-amber-100 text-amber-800 border-amber-300' },
                      { id: 'blue', label: 'Soft Blue', bg: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
                    ].map((st) => (
                      <button
                        type="button"
                        key={st.id}
                        onClick={() => setSingleStylePreset(st.id as any)}
                        className={`p-2 rounded-lg border text-center font-bold text-xs ${st.bg} ${
                          singleStylePreset === st.id ? 'ring-2 ring-indigo-600 ring-offset-1' : ''
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
              >
                + Simpan Aturan Format
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Quick 1-Click Presets */}
        {activeTab === 'presets' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Klik salah satu preset di bawah untuk langsung menerapkan aturan format bersyarat ke sheet aktif.</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-400 hover:shadow-xs transition-all flex flex-col justify-between">
                <div>
                  <div className="w-full h-3 rounded bg-gradient-to-r from-emerald-50 to-emerald-400 border border-slate-200 mb-2" />
                  <h4 className="font-bold text-xs text-slate-900">🔥 Heatmap Sel Nilai Tinggi (Harga Satuan)</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Mewarnai sel kolom UnitPrice dengan gradien Zamrud, semakin tinggi harga semakin kontras warnanya.
                  </p>
                </div>
                <button
                  onClick={() =>
                    applyPreset({
                      id: 'cf-preset-unitprice',
                      name: '🔥 Heatmap Harga Satuan (Emerald)',
                      enabled: true,
                      columnKey: 'UnitPrice',
                      type: 'color_scale',
                      colorScale: { preset: 'emerald_gradient' },
                    })
                  }
                  className="mt-3 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold rounded-lg text-xs border border-emerald-200 transition-colors w-full text-center"
                >
                  Terapkan Heatmap Harga
                </button>
              </div>

              <div className="p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-400 hover:shadow-xs transition-all flex flex-col justify-between">
                <div>
                  <div className="text-base tracking-widest mb-1.5">▲  ▶  ▼</div>
                  <h4 className="font-bold text-xs text-slate-900">🚦 Indikator Panah Tren (Volume Jumlah)</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Memberikan ikon panah hijau untuk volume tinggi, kuning untuk menengah, dan merah untuk volume rendah.
                  </p>
                </div>
                <button
                  onClick={() =>
                    applyPreset({
                      id: 'cf-preset-quantity',
                      name: '🚦 Indikator Volume Jumlah',
                      enabled: true,
                      columnKey: 'Quantity',
                      type: 'icon_set',
                      iconSet: { type: 'trend_arrows', reverseOrder: false },
                    })
                  }
                  className="mt-3 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-semibold rounded-lg text-xs border border-indigo-200 transition-colors w-full text-center"
                >
                  Terapkan Ikon Volume
                </button>
              </div>

              <div className="p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-400 hover:shadow-xs transition-all flex flex-col justify-between">
                <div>
                  <div className="w-full h-3 bg-slate-100 rounded border border-slate-200 mb-2 overflow-hidden">
                    <div className="w-3/5 h-full bg-indigo-500" />
                  </div>
                  <h4 className="font-bold text-xs text-slate-900">📊 Bilah Data Bar (TotalAmount)</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Menampilkan data bar horizontal di latar belakang sel Total Penjualan proporsional terhadap nilai transaksi.
                  </p>
                </div>
                <button
                  onClick={() =>
                    applyPreset({
                      id: 'cf-preset-total',
                      name: '📊 Data Bar Total Penjualan',
                      enabled: true,
                      columnKey: 'TotalAmount',
                      type: 'data_bar',
                      dataBar: { color: 'indigo', showValue: true },
                    })
                  }
                  className="mt-3 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-semibold rounded-lg text-xs border border-indigo-200 transition-colors w-full text-center"
                >
                  Terapkan Data Bar
                </button>
              </div>

              <div className="p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-400 hover:shadow-xs transition-all flex flex-col justify-between">
                <div>
                  <div className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 mb-2">
                    Lunas
                  </div>
                  <h4 className="font-bold text-xs text-slate-900">✨ Sorot Status Lunas</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Memberikan latar belakang hijau lembut dan teks tebal untuk transaksi pesanan yang telah lunas.
                  </p>
                </div>
                <button
                  onClick={() =>
                    applyPreset({
                      id: 'cf-preset-lunas',
                      name: '✨ Highlight Status Lunas',
                      enabled: true,
                      columnKey: 'PaymentStatus',
                      type: 'single_color',
                      singleColor: {
                        operator: 'equals',
                        value: 'Lunas',
                        bgColor: '#dcfce7',
                        textColor: '#15803d',
                        bold: true,
                      },
                    })
                  }
                  className="mt-3 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold rounded-lg text-xs border border-emerald-200 transition-colors w-full text-center"
                >
                  Terapkan Sorot Lunas
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-between items-center text-xs">
              <span className="text-slate-500">Kembalikan ke susunan format rekomendasi bawaan sheet:</span>
              <button
                onClick={() => {
                  onResetRules();
                  setActiveTab('list');
                }}
                className="px-3.5 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg transition-colors"
              >
                Reset ke Format Bawaan
              </button>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>{rules.filter((r) => r.enabled).length} dari {rules.length} aturan aktif</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold transition-colors shadow-2xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
