import React, { useState, useMemo, useRef } from 'react';
import {
  BarChart3,
  LineChart,
  PieChart,
  TrendingUp,
  Download,
  FileImage,
  Sliders,
  LayoutGrid,
  Layers,
  ArrowUpDown,
  Maximize2,
  TableProperties,
  ScatterChart,
  HelpCircle
} from 'lucide-react';
import {
  AggregationMethod,
  ChartConfig,
  ChartType,
  ColorPalette,
  ColumnDef,
  RowData,
  Sheet
} from '../types/spreadsheet';
import { parseNumericValue } from '../utils/filterEngine';

interface VisualAnalyticsProps {
  sheet: Sheet;
  filteredRows: RowData[];
  totalRowCount: number;
}

const COLOR_PALETTES: Record<ColorPalette, { name: string; colors: string[] }> = {
  slate_indigo: {
    name: 'Executive Slate & Indigo',
    colors: ['#4f46e5', '#6366f1', '#818cf8', '#0284c7', '#0ea5e9', '#38bdf8', '#475569', '#64748b'],
  },
  emerald_teal: {
    name: 'Growth Emerald & Teal',
    colors: ['#059669', '#10b981', '#34d399', '#0d9488', '#14b8a6', '#2dd4bf', '#047857', '#065f46'],
  },
  warm_amber: {
    name: 'Dynamic Amber & Orange',
    colors: ['#d97706', '#f59e0b', '#fbbf24', '#ea580c', '#f97316', '#fb923c', '#b45309', '#78350f'],
  },
  vibrant_corporate: {
    name: 'Vibrant Corporate Multi',
    colors: ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444', '#14b8a6'],
  },
  monochrome: {
    name: 'Monochrome Slate Minimal',
    colors: ['#0f172a', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0'],
  },
};

export const VisualAnalytics: React.FC<VisualAnalyticsProps> = ({
  sheet,
  filteredRows,
  totalRowCount,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Available dimension columns (categories, text, dates)
  const dimensionCols = useMemo(
    () =>
      sheet.columns.filter(
        (c) => c.type === 'category' || c.type === 'text' || c.type === 'date' || c.type === 'relation'
      ),
    [sheet.columns]
  );

  // Available metric columns (numbers, currencies, percentages, ratings)
  const metricCols = useMemo(
    () =>
      sheet.columns.filter(
        (c) => c.type === 'number' || c.type === 'currency' || c.type === 'percentage' || c.type === 'rating'
      ),
    [sheet.columns]
  );

  // Default configuration
  const [config, setConfig] = useState<ChartConfig>({
    id: 'chart-main',
    title: 'Analisis Distribusi Metrik',
    type: 'bar',
    xAxisColumn: dimensionCols[0]?.key || sheet.columns[0]?.key || '',
    yAxisColumn: metricCols[0]?.key || sheet.columns[1]?.key || '',
    aggregation: 'sum',
    breakdownColumn: '',
    colorPalette: 'slate_indigo',
    showDataLabels: true,
    showGridLines: true,
    goalThreshold: undefined,
    sortBy: 'value_desc',
    maxCategories: 10,
  });

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<'chart' | 'config'>('chart');

  // Grouped and aggregated chart data
  const aggregatedData = useMemo(() => {
    if (!config.xAxisColumn || filteredRows.length === 0) return [];

    const xCol = sheet.columns.find((c) => c.key === config.xAxisColumn);
    const yCol = sheet.columns.find((c) => c.key === config.yAxisColumn);

    const groupMap = new Map<string, number[]>();

    filteredRows.forEach((row) => {
      let xVal = row[config.xAxisColumn];
      if (xVal === null || xVal === undefined || xVal === '') xVal = '(Kosong)';
      const keyStr = String(xVal);

      const yRaw = row[config.yAxisColumn];
      const parsed = parseNumericValue(yRaw);
      const yVal = !isNaN(parsed) ? parsed : config.aggregation === 'count' ? 1 : 0;

      if (!groupMap.has(keyStr)) {
        groupMap.set(keyStr, []);
      }
      groupMap.get(keyStr)!.push(yVal);
    });

    let result = Array.from(groupMap.entries()).map(([label, numbers]) => {
      let value = 0;
      switch (config.aggregation) {
        case 'sum':
          value = numbers.reduce((a, b) => a + b, 0);
          break;
        case 'avg':
          value = numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0;
          break;
        case 'count':
          value = numbers.length;
          break;
        case 'min':
          value = numbers.length > 0 ? Math.min(...numbers) : 0;
          break;
        case 'max':
          value = numbers.length > 0 ? Math.max(...numbers) : 0;
          break;
      }
      return { label, value, count: numbers.length };
    });

    // Sorting
    if (config.sortBy === 'value_desc') {
      result.sort((a, b) => b.value - a.value);
    } else if (config.sortBy === 'value_asc') {
      result.sort((a, b) => a.value - b.value);
    } else if (config.sortBy === 'label_asc') {
      result.sort((a, b) => a.label.localeCompare(b.label));
    }

    // Limit top categories
    if (config.maxCategories > 0 && result.length > config.maxCategories) {
      const topItems = result.slice(0, config.maxCategories);
      const otherItems = result.slice(config.maxCategories);
      const otherSum = otherItems.reduce((acc, curr) => acc + curr.value, 0);
      const otherCount = otherItems.reduce((acc, curr) => acc + curr.count, 0);
      result = [...topItems, { label: 'Lainnya (Others)', value: otherSum, count: otherCount }];
    }

    return result;
  }, [filteredRows, config, sheet.columns]);

  // Overall KPIs calculation for KPI scorecards
  const kpis = useMemo(() => {
    if (filteredRows.length === 0) return null;
    const yCol = sheet.columns.find((c) => c.key === config.yAxisColumn);
    const nums = filteredRows
      .map((r) => parseNumericValue(r[config.yAxisColumn]))
      .filter((n) => !isNaN(n));

    const total = nums.reduce((a, b) => a + b, 0);
    const avg = nums.length ? total / nums.length : 0;
    const max = nums.length ? Math.max(...nums) : 0;
    const min = nums.length ? Math.min(...nums) : 0;

    return {
      total,
      avg,
      max,
      min,
      count: filteredRows.length,
      colName: yCol?.name || config.yAxisColumn,
      type: yCol?.type || 'number',
      currencyCode: yCol?.currencyCode || 'IDR',
    };
  }, [filteredRows, config.yAxisColumn, sheet.columns]);

  // Max value for scaling
  const maxValue = useMemo(() => {
    if (aggregatedData.length === 0) return 1;
    const maxVal = Math.max(...aggregatedData.map((d) => d.value));
    return maxVal > 0 ? maxVal : 1;
  }, [aggregatedData]);

  const paletteColors = COLOR_PALETTES[config.colorPalette].colors;

  // Format metric value helper
  const formatMetric = (val: number) => {
    if (isNaN(val) || val === null || val === undefined) {
      return '0';
    }
    const yCol = sheet.columns.find((c) => c.key === config.yAxisColumn);
    if (config.aggregation === 'count') {
      return `${val.toLocaleString('id-ID')} baris`;
    }
    if (yCol?.type === 'currency') {
      if (val >= 1_000_000_000) {
        return `Rp ${(val / 1_000_000_000).toFixed(2)} M`;
      }
      if (val >= 1_000_000) {
        return `Rp ${(val / 1_000_000).toFixed(1)} Jt`;
      }
      return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
    }
    if (yCol?.type === 'percentage') {
      return `${val.toFixed(1)}%`;
    }
    return val.toLocaleString('id-ID', { maximumFractionDigits: 1 });
  };

  const handleExportChartSvg = () => {
    if (!chartContainerRef.current) return;
    const svgEl = chartContainerRef.current.querySelector('svg');
    if (!svgEl) return;

    const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
    const rect = svgEl.getBoundingClientRect();
    const width = Math.max(800, Math.round(rect.width || 800));
    const height = Math.max(340, Math.round(rect.height || 340));

    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgClone.setAttribute('width', String(width));
    svgClone.setAttribute('height', String(height));

    // Ensure white background so vector export is not transparent
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('width', '100%');
    bgRect.setAttribute('height', '100%');
    bgRect.setAttribute('fill', '#ffffff');
    svgClone.insertBefore(bgRect, svgClone.firstChild);

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `NexusSheet_Chart_${config.type}_${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExportChartPng = () => {
    if (!chartContainerRef.current) return;
    const container = chartContainerRef.current;
    const svgEl = container.querySelector('svg');

    if (svgEl) {
      const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
      const rect = svgEl.getBoundingClientRect();
      const width = Math.max(800, Math.round(rect.width || 800));
      const height = Math.max(340, Math.round(rect.height || 340));

      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svgClone.setAttribute('width', String(width));
      svgClone.setAttribute('height', String(height));

      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('width', '100%');
      bgRect.setAttribute('height', '100%');
      bgRect.setAttribute('fill', '#ffffff');
      svgClone.insertBefore(bgRect, svgClone.firstChild);

      const svgString = new XMLSerializer().serializeToString(svgClone);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = 2; // High-resolution 2x Retina PNG
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);

        canvas.toBlob((blob) => {
          if (!blob) return;
          const pngUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = `NexusSheet_${sheet.name}_${config.type}_${Date.now()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
        }, 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } else {
      // High-resolution Canvas fallback for HTML views (KPI Cards & Pivot Matrix)
      const canvas = document.createElement('canvas');
      const scale = 2;
      const width = 900;
      const height = 480;
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Header
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 18px Inter, system-ui, sans-serif';
      ctx.fillText(`${sheet.name} — ${config.title || 'Ringkasan Eksekutif Visual'}`, 32, 42);

      ctx.fillStyle = '#64748b';
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.fillText(`NexusSheet Analytics · ${filteredRows.length} baris terfilter · ${new Date().toLocaleDateString('id-ID')}`, 32, 64);

      if (config.type === 'kpi_cards') {
        const cards = [
          { label: `Total Akumulasi (${config.yAxisColumn})`, value: formatMetric(kpis?.total || 0), sub: `${kpis?.count} transaksi terfilter`, color: '#0f172a' },
          { label: 'Nilai Rata-rata (AVG)', value: formatMetric(kpis?.avg || 0), sub: 'Rerata per baris data', color: '#4f46e5' },
          { label: 'Nilai Maksimum Puncak', value: formatMetric(kpis?.max || 0), sub: 'Record transaksi tertinggi', color: '#d97706' },
          { label: 'Nilai Minimum', value: formatMetric(kpis?.min || 0), sub: 'Record nilai terendah', color: '#334155' },
        ];

        cards.forEach((card, idx) => {
          const cardX = 32 + (idx % 2) * 424;
          const cardY = 96 + Math.floor(idx / 2) * 155;

          ctx.fillStyle = '#f8fafc';
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(cardX, cardY, 404, 130, 12);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#64748b';
          ctx.font = '500 13px Inter, system-ui, sans-serif';
          ctx.fillText(card.label, cardX + 20, cardY + 34);

          ctx.fillStyle = card.color;
          ctx.font = 'bold 24px ui-monospace, monospace';
          ctx.fillText(card.value, cardX + 20, cardY + 76);

          ctx.fillStyle = '#10b981';
          ctx.font = '11px Inter, system-ui, sans-serif';
          ctx.fillText(card.sub, cardX + 20, cardY + 104);
        });
      } else {
        // Pivot matrix
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(32, 90, 836, 36);
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 12px Inter, system-ui, sans-serif';
        ctx.fillText(`Kategori / Entitas (${config.xAxisColumn})`, 48, 112);
        ctx.fillText('Frekuensi', 360, 112);
        ctx.fillText(`Nilai (${config.aggregation})`, 540, 112);
        ctx.fillText('Pangsa', 740, 112);

        aggregatedData.slice(0, 8).forEach((d, i) => {
          const rowY = 146 + i * 36;
          ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#f8fafc';
          ctx.fillRect(32, rowY - 18, 836, 36);
          ctx.fillStyle = '#0f172a';
          ctx.font = '12px Inter, system-ui, sans-serif';
          ctx.fillText(d.label, 48, rowY);
          ctx.font = '12px ui-monospace, monospace';
          ctx.fillText(String(d.count), 360, rowY);
          ctx.fillText(formatMetric(d.value), 540, rowY);
          const total = aggregatedData.reduce((a, b) => a + b.value, 0) || 1;
          ctx.fillText(`${((d.value / total) * 100).toFixed(1)}%`, 740, rowY);
        });
      }

      canvas.toBlob((blob) => {
        if (!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `NexusSheet_${sheet.name}_${config.type}_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
      }, 'image/png');
    }
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row bg-slate-50 overflow-hidden">
      {/* Mobile Top Segmented Switcher (Visible on < lg screens) */}
      <div className="lg:hidden flex items-center justify-between px-3 py-2 bg-white border-b border-slate-200 shrink-0 sticky top-0 z-20 shadow-2xs">
        <div className="flex bg-slate-100 p-1 rounded-xl w-full max-w-sm mx-auto">
          <button
            onClick={() => setMobileTab('chart')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
              mobileTab === 'chart'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
            <span>Bagan Grafik</span>
          </button>
          <button
            onClick={() => setMobileTab('config')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
              mobileTab === 'config'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-slate-600" />
            <span>Atur Grafik ({config.type})</span>
          </button>
        </div>
      </div>

      {/* Left / Top Controls Sidebar: Chart Customizer */}
      <div
        className={`${
          mobileTab === 'config' ? 'flex' : 'hidden'
        } lg:flex w-full lg:w-80 bg-white border-r border-slate-200 p-4 sm:p-5 flex-col gap-5 overflow-y-auto shrink-0 shadow-2xs`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Sliders className="w-4 h-4 text-indigo-600" />
              <span>Studio Konfigurasi Grafik</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Data grafik tersinkronisasi otomatis dengan filter aktif ({filteredRows.length} baris)
            </p>
          </div>
          <button
            onClick={() => setMobileTab('chart')}
            className="lg:hidden text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg"
          >
            Lihat Grafik →
          </button>
        </div>

        {/* 1. Variation / Chart Type Selector */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700">
            Tipe Visualisasi Grafik
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: 'bar', label: 'Bar Vertikal', icon: BarChart3 },
              { id: 'horizontal_bar', label: 'Bar Horizontal', icon: Layers },
              { id: 'stacked_bar', label: 'Stacked Bar', icon: Layers },
              { id: 'line', label: 'Garis Tren', icon: LineChart },
              { id: 'area', label: 'Area Luas', icon: TrendingUp },
              { id: 'donut', label: 'Donut Chart', icon: PieChart },
              { id: 'pie', label: 'Pie Chart', icon: PieChart },
              { id: 'kpi_cards', label: 'KPI Metrik', icon: LayoutGrid },
              { id: 'scatter', label: 'Korelasi Sebar', icon: ScatterChart },
              { id: 'pivot_matrix', label: 'Matriks Pivot', icon: TableProperties },
            ].map((t) => {
              const Icon = t.icon;
              const isSelected = config.type === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setConfig({ ...config, type: t.id as ChartType })}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium border text-left transition-all ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Dimension (X-Axis) */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-700">
            Sumbu Dimensi (X-Axis / Kategori)
          </label>
          <select
            value={config.xAxisColumn}
            onChange={(e) => setConfig({ ...config, xAxisColumn: e.target.value })}
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-slate-800 text-xs focus:ring-1 focus:ring-slate-400"
          >
            {sheet.columns.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
        </div>

        {/* 3. Metric (Y-Axis) */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-700">
            Sumbu Metrik (Y-Axis / Nilai)
          </label>
          <select
            value={config.yAxisColumn}
            onChange={(e) => setConfig({ ...config, yAxisColumn: e.target.value })}
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-slate-800 text-xs focus:ring-1 focus:ring-slate-400"
          >
            {sheet.columns.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
        </div>

        {/* 4. Aggregation Method */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-700">
            Metode Agregasi Nilai
          </label>
          <select
            value={config.aggregation}
            onChange={(e) => setConfig({ ...config, aggregation: e.target.value as AggregationMethod })}
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-slate-800 text-xs"
          >
            <option value="sum">Sum (Total Penjumlahan)</option>
            <option value="avg">Average (Rata-rata)</option>
            <option value="count">Count (Frekuensi / Baris)</option>
            <option value="min">Min (Nilai Terendah)</option>
            <option value="max">Max (Nilai Tertinggi)</option>
          </select>
        </div>

        {/* 5. Color Palette */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700">
            Skema Palet Warna Profesional
          </label>
          <div className="space-y-1.5">
            {Object.entries(COLOR_PALETTES).map(([key, pal]) => {
              const isSelected = config.colorPalette === key;
              return (
                <button
                  key={key}
                  onClick={() => setConfig({ ...config, colorPalette: key as ColorPalette })}
                  className={`w-full flex items-center justify-between p-2 rounded-lg border text-xs transition-all ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-500'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <span className="text-[11px] font-medium text-slate-800 truncate mr-2">
                    {pal.name}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {pal.colors.slice(0, 4).map((c, i) => (
                      <div
                        key={i}
                        style={{ backgroundColor: c }}
                        className="w-3.5 h-3.5 rounded-full border border-black/10"
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 6. Sorting & Toggles */}
        <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Pengurutan Data</label>
            <select
              value={config.sortBy}
              onChange={(e) => setConfig({ ...config, sortBy: e.target.value as any })}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-slate-800 text-xs"
            >
              <option value="value_desc">Nilai Terbesar (Desc)</option>
              <option value="value_asc">Nilai Terkecil (Asc)</option>
              <option value="label_asc">Label Abjad (A-Z)</option>
            </select>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-slate-600">Tampilkan Label Nilai</span>
            <input
              type="checkbox"
              checked={config.showDataLabels}
              onChange={(e) => setConfig({ ...config, showDataLabels: e.target.checked })}
              className="rounded text-indigo-600"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-600">Garis Kisi (Grid Lines)</span>
            <input
              type="checkbox"
              checked={config.showGridLines}
              onChange={(e) => setConfig({ ...config, showGridLines: e.target.checked })}
              className="rounded text-indigo-600"
            />
          </div>

          <div>
            <label className="block text-slate-600 mb-1">Batas Kategori Ditampilkan</label>
            <select
              value={config.maxCategories}
              onChange={(e) => setConfig({ ...config, maxCategories: Number(e.target.value) })}
              className="w-full px-2 py-1 border border-slate-200 rounded bg-white text-xs"
            >
              <option value={5}>Top 5 Kategori</option>
              <option value={10}>Top 10 Kategori</option>
              <option value={15}>Top 15 Kategori</option>
              <option value={0}>Semua Kategori</option>
            </select>
          </div>

          {/* Mobile quick apply button */}
          <div className="lg:hidden pt-2 pb-6">
            <button
              onClick={() => setMobileTab('chart')}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Tampilkan Bagan Grafik</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right: Main Canvas Area */}
      <div
        className={`${
          mobileTab === 'chart' ? 'flex' : 'hidden'
        } lg:flex flex-1 flex-col p-3.5 sm:p-6 overflow-y-auto`}
      >
        {/* Top Header of Chart View */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-slate-200 mb-4 sm:mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span>{sheet.columns.find((c) => c.key === config.yAxisColumn)?.name || config.yAxisColumn}</span>
                <span className="text-slate-400 font-normal text-xs sm:text-sm">berdasarkan</span>
                <span className="text-indigo-600">{sheet.columns.find((c) => c.key === config.xAxisColumn)?.name || config.xAxisColumn}</span>
              </h2>
              <button
                onClick={() => setMobileTab('config')}
                className="lg:hidden px-2 py-0.5 rounded text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200"
              >
                Ubah ⚙️
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] sm:text-xs text-slate-500 mt-1">
              <span>Sheet: <strong className="text-slate-800">{sheet.name}</strong></span>
              <span>·</span>
              <span>Agregasi: <strong className="text-slate-800 uppercase">{config.aggregation}</strong></span>
              <span>·</span>
              <span>Sampel: <strong className="text-slate-800">{filteredRows.length} dari {totalRowCount} data</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleExportChartPng}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold shadow-2xs transition-colors"
              title="Download grafik dalam format gambar PNG resolusi tinggi (HD)"
            >
              <FileImage className="w-3.5 h-3.5 text-indigo-600" />
              <span>Download PNG</span>
            </button>
            <button
              onClick={handleExportChartSvg}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-2xs transition-colors"
              title="Download grafik dalam format vektor SVG"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Download SVG</span>
            </button>
          </div>
        </div>

        {/* Chart Render Area */}
        <div
          ref={chartContainerRef}
          className="flex-1 bg-white border border-slate-200 rounded-xl p-3.5 sm:p-6 shadow-xs flex flex-col justify-start min-h-[380px] sm:min-h-[440px]"
        >
          {/* Metric & Scale Boundaries Bar (Mempertegas Batas Ukuran Angka) */}
          {filteredRows.length > 0 && config.type !== 'kpi_cards' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6 p-2.5 sm:p-3 bg-slate-50/90 border border-slate-200 rounded-xl shrink-0">
              <div className="flex flex-col">
                <span className="text-[9px] sm:text-[10px] uppercase font-semibold tracking-wider text-slate-400">Batas Bawah (Min)</span>
                <span className="text-xs sm:text-sm font-bold font-mono text-slate-700 tabular-nums truncate">
                  {formatMetric(Math.min(...aggregatedData.map((d) => d.value), 0))}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] sm:text-[10px] uppercase font-semibold tracking-wider text-slate-400">Batas Atas (Maksimum)</span>
                <span className="text-xs sm:text-sm font-bold font-mono text-amber-700 tabular-nums truncate">
                  {formatMetric(maxValue)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] sm:text-[10px] uppercase font-semibold tracking-wider text-slate-400">Rerata Nilai (AVG)</span>
                <span className="text-xs sm:text-sm font-bold font-mono text-indigo-700 tabular-nums truncate">
                  {formatMetric(aggregatedData.length > 0 ? aggregatedData.reduce((a, b) => a + b.value, 0) / aggregatedData.length : 0)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] sm:text-[10px] uppercase font-semibold tracking-wider text-slate-400">Total Akumulasi</span>
                <span className="text-xs sm:text-sm font-bold font-mono text-emerald-700 tabular-nums truncate">
                  {formatMetric(aggregatedData.reduce((a, b) => a + b.value, 0))}
                </span>
              </div>
            </div>
          )}

          {filteredRows.length === 0 ? (
            <div className="text-center py-16 text-slate-400 my-auto">
              <BarChart3 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="font-semibold text-slate-700">Tidak Ada Data untuk Ditampilkan</p>
              <p className="text-xs text-slate-400 mt-1">Sesuaikan filter aktif di spreadsheet Anda.</p>
            </div>
          ) : config.type === 'kpi_cards' ? (
            // 1. KPI Cards View
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="p-5 rounded-xl border border-slate-200 bg-slate-50">
                <div className="text-xs text-slate-500 font-medium">Total Akumulasi ({config.yAxisColumn})</div>
                <div className="text-2xl font-bold text-slate-900 font-mono mt-1 tabular-nums">
                  {formatMetric(kpis?.total || 0)}
                </div>
                <div className="text-[11px] text-emerald-600 mt-1">Total {kpis?.count} transaksi terfilter</div>
              </div>

              <div className="p-5 rounded-xl border border-slate-200 bg-slate-50">
                <div className="text-xs text-slate-500 font-medium">Nilai Rata-rata (Average)</div>
                <div className="text-2xl font-bold text-indigo-600 font-mono mt-1 tabular-nums">
                  {formatMetric(kpis?.avg || 0)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Rerata per baris data</div>
              </div>

              <div className="p-5 rounded-xl border border-slate-200 bg-slate-50">
                <div className="text-xs text-slate-500 font-medium">Nilai Maksimum Puncak</div>
                <div className="text-2xl font-bold text-amber-600 font-mono mt-1 tabular-nums">
                  {formatMetric(kpis?.max || 0)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Record transaksi terbesar</div>
              </div>

              <div className="p-5 rounded-xl border border-slate-200 bg-slate-50">
                <div className="text-xs text-slate-500 font-medium">Nilai Minimum</div>
                <div className="text-2xl font-bold text-slate-700 font-mono mt-1 tabular-nums">
                  {formatMetric(kpis?.min || 0)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Record nilai terkecil</div>
              </div>
            </div>
          ) : config.type === 'horizontal_bar' ? (
            // 2. Horizontal Bar Chart (Pure SVG)
            <div className="w-full h-80 flex flex-col justify-center">
              <div className="w-full overflow-x-auto pb-2 scrollbar-thin">
                <div className="min-w-[520px] sm:min-w-full">
                  <svg
                    viewBox={`0 0 800 ${Math.max(260, aggregatedData.length * 36 + 40)}`}
                    className="w-full h-full overflow-visible"
                  >
                    {aggregatedData.map((d, idx) => {
                      const percent = Math.min(100, Math.max(3, (d.value / maxValue) * 100));
                      const barWidth = (percent / 100) * 520;
                      const y = 20 + idx * 36;
                      const color = paletteColors[idx % paletteColors.length];
                      const isHovered = hoveredIndex === idx;

                      return (
                        <g
                          key={`${d.label}-${idx}`}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredIndex(idx)}
                          onMouseLeave={() => setHoveredIndex(null)}
                        >
                          {/* Label on left */}
                          <text
                            x="150"
                            y={y + 15}
                            textAnchor="end"
                            className={`text-xs font-semibold ${isHovered ? 'fill-indigo-600' : 'fill-slate-800'}`}
                          >
                            {d.label.length > 18 ? `${d.label.slice(0, 16)}..` : d.label}
                          </text>

                          {/* Track */}
                          <rect x="165" y={y + 1} width="520" height="20" rx="4" fill="#f1f5f9" />

                          {/* Value Bar */}
                          <rect
                            x="165"
                            y={y + 1}
                            width={barWidth}
                            height="20"
                            rx="4"
                            fill={color}
                            fillOpacity={isHovered ? 1 : 0.88}
                          >
                            <title>{`${d.label}: ${formatMetric(d.value)}`}</title>
                          </rect>

                          {/* Value label on right */}
                          <text
                            x={Math.max(165 + barWidth + 10, 175)}
                            y={y + 15}
                            textAnchor="start"
                            className="text-[11px] font-mono font-bold fill-slate-800"
                          >
                            {formatMetric(d.value)}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
              <div className="sm:hidden flex items-center justify-center text-[10px] text-slate-400 pt-1">
                <span>← Geser horizontal untuk melihat grafik lengkap →</span>
              </div>
            </div>
          ) : config.type === 'stacked_bar' ? (
            // Dedicated Stacked Bar Chart with clear boundaries and segment breakdown
            <div className="w-full flex flex-col justify-center py-4 space-y-6">
              <div className="flex justify-between items-center text-xs text-slate-500 font-mono px-1">
                <span>0 (Batas Awal Skala)</span>
                <span>
                  Total Akumulasi:{' '}
                  <strong className="text-slate-900 font-bold">
                    {formatMetric(aggregatedData.reduce((a, b) => a + b.value, 0))}
                  </strong>{' '}
                  (100%)
                </span>
              </div>

              {/* 100% Stacked Horizontal Macro Bar */}
              <div className="w-full h-14 bg-slate-100 rounded-xl overflow-hidden flex shadow-inner border border-slate-200">
                {(() => {
                  const totalSum = aggregatedData.reduce((a, b) => a + b.value, 0) || 1;
                  return aggregatedData.map((d, idx) => {
                    const percent = (d.value / totalSum) * 100;
                    const color = paletteColors[idx % paletteColors.length];
                    const isHovered = hoveredIndex === idx;

                    return (
                      <div
                        key={`${d.label}-${idx}`}
                        style={{ width: `${percent}%`, backgroundColor: color }}
                        className={`h-full border-r-2 border-white last:border-r-0 transition-all duration-200 relative group flex items-center justify-center cursor-pointer ${
                          isHovered ? 'brightness-110 z-10 scale-y-105 shadow-md' : ''
                        }`}
                        onMouseEnter={() => setHoveredIndex(idx)}
                        onMouseLeave={() => setHoveredIndex(null)}
                        title={`${d.label}: ${formatMetric(d.value)} (${percent.toFixed(1)}%)`}
                      >
                        {percent > 8 && (
                          <span className="text-[11px] font-mono font-bold text-white drop-shadow-sm px-1 truncate">
                            {percent.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Segmented breakdown cards with explicit boundary bars */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(() => {
                  const totalSum = aggregatedData.reduce((a, b) => a + b.value, 0) || 1;
                  return aggregatedData.map((d, idx) => {
                    const percent = (d.value / totalSum) * 100;
                    const color = paletteColors[idx % paletteColors.length];
                    const isHovered = hoveredIndex === idx;

                    return (
                      <div
                        key={`stacked-${d.label}-${idx}`}
                        className={`p-3 rounded-lg border transition-all cursor-pointer ${
                          isHovered ? 'border-indigo-500 bg-indigo-50/50 shadow-xs' : 'border-slate-200 bg-slate-50/60 hover:bg-slate-50'
                        }`}
                        onMouseEnter={() => setHoveredIndex(idx)}
                        onMouseLeave={() => setHoveredIndex(null)}
                      >
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <div className="flex items-center gap-2 truncate">
                            <span style={{ backgroundColor: color }} className="w-2.5 h-2.5 rounded-full shrink-0 border border-white" />
                            <span className="font-semibold text-slate-800 truncate">{d.label}</span>
                          </div>
                          <span className="font-mono font-bold text-slate-900">{formatMetric(d.value)}</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden flex">
                          <div style={{ width: `${percent}%`, backgroundColor: color }} className="h-full rounded-full" />
                        </div>
                        <div className="flex justify-between items-center mt-1 text-[10px] text-slate-400 font-mono">
                          <span>Porsi: {percent.toFixed(1)}%</span>
                          <span>Mewakili {d.count} baris</span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ) : config.type === 'donut' || config.type === 'pie' ? (
            // 3. Donut & Pie Chart (Pure Geometric SVG with Crisp Boundaries)
            <div className="flex flex-col lg:flex-row items-center justify-center gap-6 sm:gap-10 py-2 sm:py-4">
              <div className="relative w-56 h-56 sm:w-72 sm:h-72 shrink-0">
                <svg viewBox="0 0 300 300" className="w-full h-full overflow-visible">
                  {(() => {
                    const totalSum = aggregatedData.reduce((acc, curr) => acc + curr.value, 0) || 1;
                    const cx = 150;
                    const cy = 150;
                    const r = 135;
                    const r_in = config.type === 'donut' ? 78 : 0;

                    // If only 1 category takes 100%
                    if (aggregatedData.length === 1) {
                      const d = aggregatedData[0];
                      const color = paletteColors[0];

                      if (config.type === 'donut') {
                        return (
                          <g
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredIndex(0)}
                            onMouseLeave={() => setHoveredIndex(null)}
                          >
                            <circle
                              cx={cx}
                              cy={cy}
                              r={(r + r_in) / 2}
                              fill="none"
                              stroke={color}
                              strokeWidth={r - r_in}
                              className="transition-all"
                            />
                            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ffffff" strokeWidth="2.5" />
                            <circle cx={cx} cy={cy} r={r_in} fill="none" stroke="#ffffff" strokeWidth="2.5" />
                          </g>
                        );
                      }
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r}
                          fill={color}
                          stroke="#ffffff"
                          strokeWidth="2.5"
                          className="cursor-pointer transition-all"
                          onMouseEnter={() => setHoveredIndex(0)}
                          onMouseLeave={() => setHoveredIndex(null)}
                        >
                          <title>{`${d.label}: ${formatMetric(d.value)} (100%)`}</title>
                        </circle>
                      );
                    }

                    let currentAngle = -Math.PI / 2; // Start at 12 o'clock

                    return aggregatedData.map((d, idx) => {
                      const slicePercent = d.value / totalSum;
                      const sliceAngle = slicePercent * (2 * Math.PI);
                      const startAngle = currentAngle;
                      const endAngle = currentAngle + sliceAngle;
                      currentAngle = endAngle;

                      const midAngle = (startAngle + endAngle) / 2;
                      const isLargeArc = sliceAngle > Math.PI ? 1 : 0;
                      const color = paletteColors[idx % paletteColors.length];
                      const isHovered = hoveredIndex === idx;

                      // Outer points
                      const x1_out = cx + r * Math.cos(startAngle);
                      const y1_out = cy + r * Math.sin(startAngle);
                      const x2_out = cx + r * Math.cos(endAngle);
                      const y2_out = cy + r * Math.sin(endAngle);

                      let pathD = '';
                      if (config.type === 'donut') {
                        const x1_in = cx + r_in * Math.cos(endAngle);
                        const y1_in = cy + r_in * Math.sin(endAngle);
                        const x2_in = cx + r_in * Math.cos(startAngle);
                        const y2_in = cy + r_in * Math.sin(startAngle);

                        pathD = `M ${x1_out} ${y1_out} A ${r} ${r} 0 ${isLargeArc} 1 ${x2_out} ${y2_out} L ${x1_in} ${y1_in} A ${r_in} ${r_in} 0 ${isLargeArc} 0 ${x2_in} ${y2_in} Z`;
                      } else {
                        pathD = `M ${cx} ${cy} L ${x1_out} ${y1_out} A ${r} ${r} 0 ${isLargeArc} 1 ${x2_out} ${y2_out} Z`;
                      }

                      // Label position at center of slice
                      const labelRadius = config.type === 'donut' ? (r + r_in) / 2 : r * 0.65;
                      const labelX = cx + labelRadius * Math.cos(midAngle);
                      const labelY = cy + labelRadius * Math.sin(midAngle);

                      // Pop out distance on hover
                      const hoverOffsetX = isHovered ? Math.cos(midAngle) * 7 : 0;
                      const hoverOffsetY = isHovered ? Math.sin(midAngle) * 7 : 0;

                      return (
                        <g
                          key={`${d.label}-${idx}`}
                          className="cursor-pointer transition-transform duration-200"
                          style={{
                            transform: `translate(${hoverOffsetX}px, ${hoverOffsetY}px)`,
                          }}
                          onMouseEnter={() => setHoveredIndex(idx)}
                          onMouseLeave={() => setHoveredIndex(null)}
                        >
                          <path
                            d={pathD}
                            fill={color}
                            stroke="#ffffff"
                            strokeWidth={isHovered ? 3.5 : 2}
                            strokeLinejoin="round"
                            className="transition-all"
                          >
                            <title>{`${d.label}: ${formatMetric(d.value)} (${(slicePercent * 100).toFixed(1)}%)`}</title>
                          </path>

                          {/* Data label directly on slice */}
                          {config.showDataLabels && slicePercent >= 0.05 && (
                            <text
                              x={labelX}
                              y={labelY}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill="#ffffff"
                              className="text-[10px] font-bold font-mono drop-shadow-md select-none pointer-events-none"
                            >
                              {(slicePercent * 100).toFixed(1)}%
                            </text>
                          )}
                        </g>
                      );
                    });
                  })()}

                  {/* Center circle for Pie (Clean pivot dot) */}
                  {config.type === 'pie' && (
                    <circle cx="150" cy="150" r="3.5" fill="#ffffff" stroke="#94a3b8" strokeWidth="1" />
                  )}
                </svg>

                {/* Donut Center Metric Hole */}
                {config.type === 'donut' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 pointer-events-none">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                      Total Akumulasi
                    </span>
                    <span className="text-base font-bold text-slate-900 font-mono">
                      {formatMetric(aggregatedData.reduce((a, b) => a + b.value, 0))}
                    </span>
                    <span className="text-[10px] text-indigo-600 font-medium mt-0.5">
                      100% Terhitung
                    </span>
                  </div>
                )}
              </div>

              {/* Legend with crisp boundaries and metrics */}
              <div className="space-y-2 max-h-80 overflow-y-auto pr-3 min-w-[240px]">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-100 flex justify-between">
                  <span>Kategori</span>
                  <span>Pangsa · Nilai</span>
                </div>
                {aggregatedData.map((d, idx) => {
                  const color = paletteColors[idx % paletteColors.length];
                  const total = aggregatedData.reduce((a, b) => a + b.value, 0) || 1;
                  const share = ((d.value / total) * 100).toFixed(1);

                  return (
                    <div
                      key={`${d.label}-${idx}`}
                      onMouseEnter={() => setHoveredIndex(idx)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      className={`flex items-center justify-between gap-4 p-2 rounded-lg text-xs transition-colors cursor-pointer border ${
                        hoveredIndex === idx
                          ? 'bg-indigo-50/80 border-indigo-200 font-bold shadow-2xs'
                          : 'border-transparent hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          style={{ backgroundColor: color }}
                          className="w-3.5 h-3.5 rounded-full shrink-0 border border-white shadow-xs"
                        />
                        <span className="text-slate-800 truncate max-w-[150px]">{d.label}</span>
                      </div>
                      <div className="flex items-center gap-3 font-mono">
                        <span className="text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.2 rounded text-[11px] font-bold tabular-nums">
                          {share}%
                        </span>
                        <span className="font-semibold text-slate-900 tabular-nums">{formatMetric(d.value)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : config.type === 'line' || config.type === 'area' ? (
            // 4. Line & Area Chart (SVG Curves)
            <div className="w-full h-80 flex flex-col justify-center">
              <div className="w-full overflow-x-auto pb-2 scrollbar-thin">
                <div className="min-w-[550px] sm:min-w-full">
                  <svg viewBox="0 0 800 300" className="w-full h-full overflow-visible">
                {/* Horizontal Grid lines with Boundary Scale Labels */}
                {config.showGridLines && (
                  <>
                    <line x1="60" y1="20" x2="780" y2="20" stroke="#f1f5f9" strokeWidth="1" />
                    <line x1="60" y1="80" x2="780" y2="80" stroke="#f1f5f9" strokeWidth="1" />
                    <line x1="60" y1="140" x2="780" y2="140" stroke="#f1f5f9" strokeWidth="1" />
                    <line x1="60" y1="200" x2="780" y2="200" stroke="#f1f5f9" strokeWidth="1" />
                    <line x1="60" y1="260" x2="780" y2="260" stroke="#cbd5e1" strokeWidth="1.5" />
                    {/* Y-Axis Scale Boundary Labels */}
                    <text x="52" y="24" textAnchor="end" className="text-[10px] fill-slate-400 font-mono font-semibold">{formatMetric(maxValue)}</text>
                    <text x="52" y="84" textAnchor="end" className="text-[10px] fill-slate-400 font-mono">{formatMetric(maxValue * 0.75)}</text>
                    <text x="52" y="144" textAnchor="end" className="text-[10px] fill-slate-400 font-mono">{formatMetric(maxValue * 0.5)}</text>
                    <text x="52" y="204" textAnchor="end" className="text-[10px] fill-slate-400 font-mono">{formatMetric(maxValue * 0.25)}</text>
                    <text x="52" y="264" textAnchor="end" className="text-[10px] fill-slate-400 font-mono">0</text>
                  </>
                )}

                {/* Plot Points Calculation */}
                {(() => {
                  if (aggregatedData.length === 0) return null;
                  const stepX = (720 / Math.max(1, aggregatedData.length - 1));
                  const points = aggregatedData.map((d, idx) => {
                    const x = 60 + idx * stepX;
                    const y = 260 - (d.value / maxValue) * 230;
                    return { x, y, data: d };
                  });

                  const pathD = points.reduce(
                    (acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
                    ''
                  );

                  const areaD = `${pathD} L ${points[points.length - 1].x} 260 L ${points[0].x} 260 Z`;
                  const mainColor = paletteColors[0];

                  return (
                    <>
                      {config.type === 'area' && (
                        <path d={areaD} fill={mainColor} fillOpacity="0.18" />
                      )}
                      <path
                        d={pathD}
                        fill="none"
                        stroke={mainColor}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {points.map((pt, i) => (
                        <g key={i}>
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={hoveredIndex === i ? 6 : 4}
                            fill="#ffffff"
                            stroke={mainColor}
                            strokeWidth="2.5"
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredIndex(i)}
                            onMouseLeave={() => setHoveredIndex(null)}
                          />
                          {config.showDataLabels && (
                            <text
                              x={pt.x}
                              y={pt.y - 10}
                              textAnchor="middle"
                              className="text-[10px] fill-slate-700 font-mono font-semibold"
                            >
                              {formatMetric(pt.data.value)}
                            </text>
                          )}
                          {/* X-axis label */}
                          <text
                            x={pt.x}
                            y="280"
                            textAnchor="middle"
                            className="text-[10px] fill-slate-500 font-medium truncate"
                          >
                            {pt.data.label.length > 10
                              ? `${pt.data.label.slice(0, 8)}..`
                              : pt.data.label}
                          </text>
                        </g>
                      ))}
                    </>
                  );
                })()}
                  </svg>
                </div>
              </div>
              <div className="sm:hidden flex items-center justify-center text-[10px] text-slate-400 pt-1">
                <span>← Geser horizontal untuk melihat tren lengkap →</span>
              </div>
            </div>
          ) : config.type === 'scatter' ? (
            // 5. Scatter Correlation Plot
            <div className="w-full h-80 flex flex-col relative justify-center">
              <div className="text-xs text-slate-500 mb-2 font-medium">
                Pola Korelasi Titik Data Individual: {config.xAxisColumn} vs {config.yAxisColumn}
              </div>
              <div className="w-full overflow-x-auto pb-2 scrollbar-thin">
                <div className="min-w-[550px] sm:min-w-full">
                  <svg viewBox="0 0 800 300" className="w-full h-full border border-slate-100 rounded-lg">
                <line x1="50" y1="20" x2="50" y2="260" stroke="#cbd5e1" strokeWidth="1" />
                <line x1="50" y1="260" x2="780" y2="260" stroke="#cbd5e1" strokeWidth="1" />
                {filteredRows.slice(0, 50).map((row, idx) => {
                  const xParsed = parseNumericValue(row[config.xAxisColumn]);
                  const yParsed = parseNumericValue(row[config.yAxisColumn]);
                  const yVal = !isNaN(yParsed) ? yParsed : 0;
                  const cx = 60 + (idx % 25) * 28;
                  const cy = 250 - Math.min(220, (yVal / maxValue) * 220);
                  const color = paletteColors[idx % paletteColors.length];

                  return (
                    <circle
                      key={row._id}
                      cx={cx}
                      cy={cy}
                      r="5.5"
                      fill={color}
                      fillOpacity="0.8"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                      className="cursor-pointer hover:r-7 transition-all"
                    >
                      <title>{`${row[sheet.primaryKey || config.xAxisColumn] || 'Row'}: ${formatMetric(yVal)}`}</title>
                    </circle>
                  );
                })}
              </svg>
                </div>
              </div>
              <div className="sm:hidden flex items-center justify-center text-[10px] text-slate-400 pt-1">
                <span>← Geser horizontal untuk melihat sebaran lengkap →</span>
              </div>
            </div>
          ) : config.type === 'pivot_matrix' ? (
            // 6. Pivot Table Cross-Tabulation Matrix
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border border-slate-200 rounded-lg">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5">Kategori / Entitas ({config.xAxisColumn})</th>
                    <th className="px-4 py-2.5 text-right">Frekuensi Transaksi</th>
                    <th className="px-4 py-2.5 text-right">Nilai Agregasi ({config.aggregation})</th>
                    <th className="px-4 py-2.5 text-right">Kontribusi Pangsa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {aggregatedData.map((d, i) => {
                    const totalSum = aggregatedData.reduce((a, b) => a + b.value, 0) || 1;
                    const percent = ((d.value / totalSum) * 100).toFixed(1);
                    return (
                      <tr key={`${d.label}-${i}`} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2 font-sans font-medium text-slate-900">{d.label}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600">{d.count} item</td>
                        <td className="px-4 py-2 text-right tabular-nums font-bold text-slate-900">
                          {formatMetric(d.value)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-indigo-600 font-semibold">
                          {percent}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            // Default: Vertical Column Bar Chart (Pure SVG)
            <div className="w-full h-80 flex flex-col justify-end pt-2">
              <div className="w-full overflow-x-auto pb-2 scrollbar-thin">
                <div className="min-w-[550px] sm:min-w-full">
                  <svg viewBox="0 0 800 320" className="w-full h-full overflow-visible">
                    {/* Horizontal Grid lines with Boundary Scale Numbers */}
                    {config.showGridLines && (
                      <>
                        <line x1="50" y1="30" x2="780" y2="30" stroke="#f1f5f9" strokeWidth="1" />
                        <line x1="50" y1="85" x2="780" y2="85" stroke="#f1f5f9" strokeWidth="1" />
                        <line x1="50" y1="140" x2="780" y2="140" stroke="#f1f5f9" strokeWidth="1" />
                        <line x1="50" y1="195" x2="780" y2="195" stroke="#f1f5f9" strokeWidth="1" />
                        <line x1="50" y1="250" x2="780" y2="250" stroke="#cbd5e1" strokeWidth="1.5" />
                        {/* Y-Axis Scale Boundary Numbers */}
                        <text x="44" y="34" textAnchor="end" className="text-[10px] fill-slate-400 font-mono font-semibold">{formatMetric(maxValue)}</text>
                        <text x="44" y="89" textAnchor="end" className="text-[10px] fill-slate-400 font-mono">{formatMetric(maxValue * 0.75)}</text>
                        <text x="44" y="144" textAnchor="end" className="text-[10px] fill-slate-400 font-mono">{formatMetric(maxValue * 0.5)}</text>
                        <text x="44" y="199" textAnchor="end" className="text-[10px] fill-slate-400 font-mono">{formatMetric(maxValue * 0.25)}</text>
                        <text x="44" y="254" textAnchor="end" className="text-[10px] fill-slate-400 font-mono">0</text>
                      </>
                    )}

                    {(() => {
                      if (aggregatedData.length === 0) return null;
                      const totalWidth = 720;
                      const colStep = totalWidth / aggregatedData.length;
                      const barWidth = Math.min(52, Math.max(16, colStep * 0.65));

                      return aggregatedData.map((d, idx) => {
                        const heightPercent = Math.min(100, Math.max(4, (d.value / maxValue) * 100));
                        const barHeight = (heightPercent / 100) * 210;
                        const x = 50 + idx * colStep + (colStep - barWidth) / 2;
                        const y = 250 - barHeight;
                        const color = paletteColors[idx % paletteColors.length];
                        const isHovered = hoveredIndex === idx;

                        return (
                          <g
                            key={`${d.label}-${idx}`}
                            className="cursor-pointer transition-all duration-150"
                            onMouseEnter={() => setHoveredIndex(idx)}
                            onMouseLeave={() => setHoveredIndex(null)}
                          >
                            {/* Bar */}
                            <rect
                              x={x}
                              y={y}
                              width={barWidth}
                              height={barHeight}
                              rx="4"
                              ry="4"
                              fill={color}
                              fillOpacity={isHovered ? 1 : 0.88}
                              stroke={isHovered ? '#0f172a' : 'transparent'}
                              strokeWidth={isHovered ? 1.5 : 0}
                              className="transition-all"
                            >
                              <title>{`${d.label}: ${formatMetric(d.value)}`}</title>
                            </rect>

                            {/* Top Label */}
                            {config.showDataLabels && (
                              <text
                                x={x + barWidth / 2}
                                y={y - 8}
                                textAnchor="middle"
                                className="text-[10px] fill-slate-700 font-mono font-semibold"
                              >
                                {formatMetric(d.value)}
                              </text>
                            )}

                            {/* X-axis label */}
                            <text
                              x={x + barWidth / 2}
                              y="272"
                              textAnchor="middle"
                              className={`text-[11px] font-medium transition-colors ${
                                isHovered ? 'fill-indigo-600 font-bold' : 'fill-slate-600'
                              }`}
                            >
                              {d.label.length > 12 ? `${d.label.slice(0, 10)}..` : d.label}
                            </text>
                          </g>
                        );
                      });
                    })()}
                  </svg>
                </div>
              </div>
              <div className="sm:hidden flex items-center justify-center text-[10px] text-slate-400 pt-1">
                <span>← Geser horizontal untuk melihat semua kolom →</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Insight Box */}
        <div className="mt-4 p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-500" />
            <span>
              Menampilkan <strong className="text-slate-800">{aggregatedData.length} grup</strong> dari dataset terfilter.
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            Analisis Agregasi Data Spreadsheet
          </div>
        </div>
      </div>
    </div>
  );
};
