export type ColumnType =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'category'
  | 'boolean'
  | 'percentage'
  | 'rating'
  | 'relation';

export type ColumnSummary = 'none' | 'sum' | 'avg' | 'min' | 'max' | 'count' | 'unique';

export interface ColumnRelation {
  targetSheetId: string;
  targetColumnKey: string;
  displayColumnKey?: string; // which column from target sheet to show as title/label
}

export type ValidationRuleType =
  | 'none'
  | 'numeric'
  | 'positive_number'
  | 'range'
  | 'unique'
  | 'required'
  | 'email'
  | 'options'
  | 'regex';

export interface ValidationRule {
  type: ValidationRuleType;
  min?: number;
  max?: number;
  allowedOptions?: string[]; // comma-separated or list of allowed values
  pattern?: string;
  customErrorMessage?: string;
  severity?: 'error' | 'warning';
}

export interface ColumnDef {
  key: string;
  name: string;
  type: ColumnType;
  category: string; // group domain, e.g. "Financials", "Customer", "Product"
  description?: string;
  summary: ColumnSummary;
  width?: number;
  relation?: ColumnRelation;
  categoryColors?: Record<string, string>; // for select tags
  currencyCode?: string; // 'IDR' | 'USD' | 'EUR' etc.
  visible: boolean;
  isPrimaryKey?: boolean;
  validation?: ValidationRule;
}

export type RowData = Record<string, any> & {
  _id: string;
};

export interface Sheet {
  id: string;
  name: string;
  columns: ColumnDef[];
  data: RowData[];
  primaryKey?: string;
  description?: string;
}

export type FilterOperator =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'greater_equal'
  | 'less_than'
  | 'less_equal'
  | 'between'
  | 'in'
  | 'not_in'
  | 'is_empty'
  | 'is_not_empty'
  | 'date_range'
  | 'this_month'
  | 'this_year';

export interface FilterRule {
  id: string;
  columnKey: string;
  operator: FilterOperator;
  value: any;
  secondValue?: any;
}

export interface SortConfig {
  columnKey: string;
  direction: 'asc' | 'desc';
}

export type ChartType =
  | 'bar'
  | 'horizontal_bar'
  | 'stacked_bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'scatter'
  | 'kpi_cards'
  | 'pivot_matrix';

export type AggregationMethod = 'sum' | 'avg' | 'count' | 'min' | 'max';

export type ColorPalette =
  | 'slate_indigo'
  | 'emerald_teal'
  | 'warm_amber'
  | 'vibrant_corporate'
  | 'monochrome';

export interface ChartConfig {
  id: string;
  title: string;
  type: ChartType;
  xAxisColumn: string;
  yAxisColumn: string;
  aggregation: AggregationMethod;
  breakdownColumn?: string;
  colorPalette: ColorPalette;
  showDataLabels: boolean;
  showGridLines: boolean;
  goalThreshold?: number;
  sortBy: 'value_desc' | 'value_asc' | 'label_asc';
  maxCategories: number;
}

export interface RelationalJoinConfig {
  id: string;
  title: string;
  primarySheetId: string;
  foreignSheetId: string;
  primaryKeyColumn: string;
  foreignKeyColumn: string;
  joinType: 'inner' | 'left';
  tertiarySheetId?: string;
  tertiarySourceKeyColumn?: string;
  tertiaryTargetKeyColumn?: string;
  tertiaryJoinType?: 'inner' | 'left';
  includedColumns: {
    sheetId: string;
    columnKey: string;
    alias: string;
  }[];
}

export type ConditionalFormatType = 'color_scale' | 'icon_set' | 'data_bar' | 'single_color';

export type ColorScalePreset =
  | 'green_yellow_red'
  | 'red_yellow_green'
  | 'emerald_gradient'
  | 'indigo_gradient'
  | 'amber_gradient'
  | 'blue_white_red';

export type IconSetType =
  | 'traffic_lights'
  | 'trend_arrows'
  | 'shapes'
  | 'stars'
  | 'status'
  | 'flags';

export type DataBarColor = 'emerald' | 'indigo' | 'amber' | 'blue' | 'rose';

export interface ConditionalFormattingRule {
  id: string;
  name?: string;
  enabled: boolean;
  columnKey: string;
  type: ConditionalFormatType;
  colorScale?: {
    preset: ColorScalePreset;
    minColor?: string;
    midColor?: string;
    maxColor?: string;
  };
  iconSet?: {
    type: IconSetType;
    reverseOrder?: boolean;
    showValueOnly?: boolean;
    showIconOnly?: boolean;
  };
  dataBar?: {
    color: DataBarColor;
    showValue: boolean;
  };
  singleColor?: {
    operator: FilterOperator;
    value: any;
    secondValue?: any;
    bgColor: string;
    textColor: string;
    bold?: boolean;
  };
}
