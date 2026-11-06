import {
  ConditionalFormattingRule,
  ColorScalePreset,
  IconSetType,
  DataBarColor,
  RowData,
  ColumnDef,
} from '../types/spreadsheet';
import { parseNumericValue } from './filterEngine';
import { isFormula } from './formulaEngine';

export interface ColumnStatistics {
  min: number;
  max: number;
  count: number;
  numericValues: number[];
}

export interface CellFormatResult {
  backgroundColor?: string;
  textColor?: string;
  fontWeight?: 'bold' | 'normal';
  icon?: {
    symbol: string;
    label: string;
    color?: string;
  };
  dataBar?: {
    widthPercent: number;
    color: string;
    showValue: boolean;
  };
  ruleName?: string;
}

/**
 * Calculates column numerical min, max and distribution for conditional formatting
 */
export function calculateColumnStatistics(
  data: RowData[],
  columnKey: string,
  evaluatedValues?: Map<string, any>
): ColumnStatistics {
  const nums: number[] = [];

  data.forEach((row) => {
    let rawVal = row[columnKey];
    if (isFormula(rawVal) && evaluatedValues) {
      rawVal = evaluatedValues.get(`${row._id}:${columnKey}`);
    }
    const n = parseNumericValue(rawVal);
    if (!isNaN(n)) {
      nums.push(n);
    }
  });

  if (nums.length === 0) {
    return { min: 0, max: 0, count: 0, numericValues: [] };
  }

  const min = Math.min(...nums);
  const max = Math.max(...nums);

  return {
    min,
    max,
    count: nums.length,
    numericValues: nums,
  };
}

/**
 * Interpolate RGB colors given a progress t between 0 and 1
 */
function interpolateColor(
  rgb1: [number, number, number],
  rgb2: [number, number, number],
  t: number
): string {
  const r = Math.round(rgb1[0] + (rgb2[0] - rgb1[0]) * t);
  const g = Math.round(rgb1[1] + (rgb2[1] - rgb1[1]) * t);
  const b = Math.round(rgb1[2] + (rgb2[2] - rgb1[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Resolve RGB color scale according to preset and normalized value t (0..1)
 */
export function getColorScaleStyle(
  t: number,
  preset: ColorScalePreset
): { backgroundColor: string; textColor: string } {
  const clampedT = Math.max(0, Math.min(1, t));

  switch (preset) {
    case 'green_yellow_red': {
      // 0 = Soft Red, 0.5 = Soft Yellow, 1 = Soft Green
      const red: [number, number, number] = [254, 205, 211]; // soft rose
      const yellow: [number, number, number] = [254, 240, 138]; // soft amber
      const green: [number, number, number] = [187, 247, 208]; // soft emerald

      if (clampedT < 0.5) {
        return {
          backgroundColor: interpolateColor(red, yellow, clampedT * 2),
          textColor: '#881337',
        };
      } else {
        return {
          backgroundColor: interpolateColor(yellow, green, (clampedT - 0.5) * 2),
          textColor: '#064e3b',
        };
      }
    }

    case 'red_yellow_green': {
      // 0 = Soft Green, 0.5 = Soft Yellow, 1 = Soft Red (e.g. costs or delays)
      const green: [number, number, number] = [187, 247, 208];
      const yellow: [number, number, number] = [254, 240, 138];
      const red: [number, number, number] = [254, 205, 211];

      if (clampedT < 0.5) {
        return {
          backgroundColor: interpolateColor(green, yellow, clampedT * 2),
          textColor: '#064e3b',
        };
      } else {
        return {
          backgroundColor: interpolateColor(yellow, red, (clampedT - 0.5) * 2),
          textColor: '#881337',
        };
      }
    }

    case 'emerald_gradient': {
      // White to vibrant Emerald
      const white: [number, number, number] = [240, 253, 244]; // emerald-50
      const emerald: [number, number, number] = [110, 231, 183]; // emerald-300
      return {
        backgroundColor: interpolateColor(white, emerald, clampedT),
        textColor: clampedT > 0.65 ? '#064e3b' : '#0f172a',
      };
    }

    case 'indigo_gradient': {
      // White to vibrant Indigo
      const white: [number, number, number] = [238, 242, 255]; // indigo-50
      const indigo: [number, number, number] = [165, 180, 252]; // indigo-300
      return {
        backgroundColor: interpolateColor(white, indigo, clampedT),
        textColor: clampedT > 0.65 ? '#1e1b4b' : '#0f172a',
      };
    }

    case 'amber_gradient': {
      // White to warm Amber/Orange
      const white: [number, number, number] = [254, 243, 199]; // amber-100
      const amber: [number, number, number] = [252, 211, 77]; // amber-300
      return {
        backgroundColor: interpolateColor(white, amber, clampedT),
        textColor: clampedT > 0.65 ? '#78350f' : '#0f172a',
      };
    }

    case 'blue_white_red': {
      // Cool Blue to Pure White to Warm Red (Diverging)
      const blue: [number, number, number] = [191, 219, 254]; // blue-200
      const white: [number, number, number] = [255, 255, 255];
      const red: [number, number, number] = [254, 205, 211]; // rose-200

      if (clampedT < 0.5) {
        return {
          backgroundColor: interpolateColor(blue, white, clampedT * 2),
          textColor: '#1e3a8a',
        };
      } else {
        return {
          backgroundColor: interpolateColor(white, red, (clampedT - 0.5) * 2),
          textColor: '#881337',
        };
      }
    }

    default:
      return { backgroundColor: '#f1f5f9', textColor: '#0f172a' };
  }
}

/**
 * Resolve Icon Set for cell value
 */
export function getIconSetResult(
  t: number,
  iconType: IconSetType,
  reverseOrder: boolean = false
): { symbol: string; label: string; color: string } {
  let effectiveT = Math.max(0, Math.min(1, t));
  if (reverseOrder) {
    effectiveT = 1 - effectiveT;
  }

  // 3-tier distribution: Low (<0.33), Mid (0.33..0.66), High (>=0.66)
  if (effectiveT >= 0.66) {
    // High tier
    switch (iconType) {
      case 'traffic_lights':
        return { symbol: '🟢', label: 'Tinggi', color: '#10b981' };
      case 'trend_arrows':
        return { symbol: '▲', label: 'Naik', color: '#10b981' };
      case 'shapes':
        return { symbol: '🟩', label: 'Level Tinggi', color: '#10b981' };
      case 'stars':
        return { symbol: '★★★', label: 'Bintang 3', color: '#f59e0b' };
      case 'status':
        return { symbol: '✔', label: 'Optimal', color: '#10b981' };
      case 'flags':
        return { symbol: '🚩', label: 'Prioritas Tinggi', color: '#ef4444' };
    }
  } else if (effectiveT >= 0.33) {
    // Mid tier
    switch (iconType) {
      case 'traffic_lights':
        return { symbol: '🟡', label: 'Sedang', color: '#f59e0b' };
      case 'trend_arrows':
        return { symbol: '▶', label: 'Stabil', color: '#f59e0b' };
      case 'shapes':
        return { symbol: '🟨', label: 'Level Sedang', color: '#f59e0b' };
      case 'stars':
        return { symbol: '★★☆', label: 'Bintang 2', color: '#f59e0b' };
      case 'status':
        return { symbol: '⚠', label: 'Cukup', color: '#f59e0b' };
      case 'flags':
        return { symbol: '🏳', label: 'Normal', color: '#94a3b8' };
    }
  } else {
    // Low tier
    switch (iconType) {
      case 'traffic_lights':
        return { symbol: '🔴', label: 'Rendah', color: '#ef4444' };
      case 'trend_arrows':
        return { symbol: '▼', label: 'Turun', color: '#ef4444' };
      case 'shapes':
        return { symbol: '🟥', label: 'Level Rendah', color: '#ef4444' };
      case 'stars':
        return { symbol: '★☆☆', label: 'Bintang 1', color: '#f59e0b' };
      case 'status':
        return { symbol: '✖', label: 'Perlu Perhatian', color: '#ef4444' };
      case 'flags':
        return { symbol: '🏁', label: 'Bawah', color: '#64748b' };
    }
  }
}

/**
 * Resolve Data Bar color class/hex
 */
export function getDataBarColorCode(color: DataBarColor): string {
  switch (color) {
    case 'emerald':
      return 'rgba(16, 185, 129, 0.28)';
    case 'indigo':
      return 'rgba(99, 102, 241, 0.28)';
    case 'amber':
      return 'rgba(245, 158, 11, 0.28)';
    case 'blue':
      return 'rgba(59, 130, 246, 0.28)';
    case 'rose':
      return 'rgba(244, 63, 94, 0.28)';
    default:
      return 'rgba(16, 185, 129, 0.28)';
  }
}

/**
 * Evaluate single cell formatting against active conditional rules
 */
export function evaluateCellConditionalFormat(
  rawVal: any,
  columnKey: string,
  rules: ConditionalFormattingRule[],
  stats?: ColumnStatistics,
  colDef?: ColumnDef
): CellFormatResult | null {
  const activeColRules = rules.filter((r) => r.enabled && r.columnKey === columnKey);
  if (activeColRules.length === 0) return null;

  const result: CellFormatResult = {};

  const num = parseNumericValue(rawVal);
  const hasValidNum = !isNaN(num) && stats && stats.max > stats.min;

  // Normalized position between 0 and 1
  const t = hasValidNum && stats
    ? Math.max(0, Math.min(1, (num - stats.min) / (stats.max - stats.min)))
    : 0.5;

  for (const rule of activeColRules) {
    if (rule.type === 'color_scale' && rule.colorScale && hasValidNum) {
      const scaleStyle = getColorScaleStyle(t, rule.colorScale.preset);
      result.backgroundColor = scaleStyle.backgroundColor;
      result.textColor = scaleStyle.textColor;
      result.ruleName = rule.name || 'Skala Warna';
    }

    if (rule.type === 'icon_set' && rule.iconSet && hasValidNum) {
      const iconRes = getIconSetResult(
        t,
        rule.iconSet.type,
        rule.iconSet.reverseOrder || false
      );
      result.icon = {
        symbol: iconRes.symbol,
        label: iconRes.label,
        color: iconRes.color,
      };
    }

    if (rule.type === 'data_bar' && rule.dataBar && hasValidNum) {
      const width = Math.max(4, Math.min(100, Math.round(t * 100)));
      result.dataBar = {
        widthPercent: width,
        color: getDataBarColorCode(rule.dataBar.color),
        showValue: rule.dataBar.showValue,
      };
    }

    if (rule.type === 'single_color' && rule.singleColor) {
      const { operator, value, secondValue, bgColor, textColor, bold } = rule.singleColor;
      let matched = false;

      const ruleValNum = parseNumericValue(value);
      const isNumComparison = !isNaN(num) && !isNaN(ruleValNum);

      switch (operator) {
        case 'greater_than':
          matched = isNumComparison ? num > ruleValNum : String(rawVal) > String(value);
          break;
        case 'greater_equal':
          matched = isNumComparison ? num >= ruleValNum : String(rawVal) >= String(value);
          break;
        case 'less_than':
          matched = isNumComparison ? num < ruleValNum : String(rawVal) < String(value);
          break;
        case 'less_equal':
          matched = isNumComparison ? num <= ruleValNum : String(rawVal) <= String(value);
          break;
        case 'equals':
          matched = isNumComparison
            ? num === ruleValNum
            : String(rawVal).trim().toLowerCase() === String(value).trim().toLowerCase();
          break;
        case 'not_equals':
          matched = isNumComparison
            ? num !== ruleValNum
            : String(rawVal).trim().toLowerCase() !== String(value).trim().toLowerCase();
          break;
        case 'between': {
          const secondNum = parseNumericValue(secondValue);
          if (isNumComparison && !isNaN(secondNum)) {
            matched = num >= Math.min(ruleValNum, secondNum) && num <= Math.max(ruleValNum, secondNum);
          }
          break;
        }
        case 'contains':
          matched = String(rawVal).toLowerCase().includes(String(value).toLowerCase());
          break;
        case 'not_contains':
          matched = !String(rawVal).toLowerCase().includes(String(value).toLowerCase());
          break;
        default:
          matched = false;
      }

      if (matched) {
        result.backgroundColor = bgColor;
        result.textColor = textColor;
        if (bold) result.fontWeight = 'bold';
        result.ruleName = rule.name || 'Format Ambang Batas';
      }
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Generate sensible default conditional formatting rules for demo data
 */
export function getDefaultConditionalRules(sheetId: string): ConditionalFormattingRule[] {
  if (sheetId === 'sheet-orders') {
    return [
      {
        id: 'cf-heatmap-unitprice',
        name: '🔥 Heatmap Harga Satuan (Emerald)',
        enabled: true,
        columnKey: 'UnitPrice',
        type: 'color_scale',
        colorScale: {
          preset: 'emerald_gradient',
        },
      },
      {
        id: 'cf-icons-quantity',
        name: '🚦 Indikator Volume Jumlah',
        enabled: true,
        columnKey: 'Quantity',
        type: 'icon_set',
        iconSet: {
          type: 'trend_arrows',
          reverseOrder: false,
        },
      },
      {
        id: 'cf-databar-total',
        name: '📊 Data Bar Total Penjualan',
        enabled: true,
        columnKey: 'TotalAmount',
        type: 'data_bar',
        dataBar: {
          color: 'indigo',
          showValue: true,
        },
      },
      {
        id: 'cf-lunas-highlight',
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
      },
    ];
  }
  return [];
}
