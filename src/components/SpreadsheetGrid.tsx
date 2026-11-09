import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Hash,
  DollarSign,
  Calendar,
  Layers,
  Star,
  Percent,
  Link2,
  Plus,
  Trash2,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  MoreVertical,
  Check,
  X,
  FileSpreadsheet,
  Calculator,
  HelpCircle,
  FunctionSquare,
  AlertTriangle,
  Undo2,
  Redo2
} from 'lucide-react';
import {
  ColumnDef,
  ColumnType,
  RowData,
  Sheet,
  SortConfig,
  ConditionalFormattingRule
} from '../types/spreadsheet';
import {
  calculateColumnStatistics,
  evaluateCellConditionalFormat,
  ColumnStatistics
} from '../utils/conditionalFormatEngine';
import {
  formatCellValue,
  getCategoryBadgeStyle
} from '../utils/formatters';
import {
  calculateColumnSummary,
  resolveRelation
} from '../utils/filterEngine';
import {
  FormulaEngine,
  isFormula,
  columnIndexToLetter,
  letterToColumnIndex,
  FORMULA_DOCS
} from '../utils/formulaEngine';
import {
  validateSheet,
  getValidationRuleLabel,
  CellValidationError
} from '../utils/validationEngine';
import { ValidationRule, ValidationRuleType } from '../types/spreadsheet';
import { ShieldCheck, AlertCircle, CheckCircle } from 'lucide-react';
import {
  extractFormulaContext,
  getFormulaSuggestions,
  applySuggestion,
  AutocompleteSuggestion,
  AutocompleteContext,
} from '../utils/formulaAutocomplete';
import { FormulaAutocompleteDropdown } from './FormulaAutocompleteDropdown';

interface SpreadsheetGridProps {
  sheet: Sheet;
  allSheets: Sheet[];
  rows: RowData[];
  selectedCategory: string;
  sortConfig: SortConfig | null;
  onSort: (columnKey: string) => void;
  onUpdateCell: (rowId: string, columnKey: string, newValue: any) => void;
  onAddRow: () => void;
  onDeleteRows: (rowIds: string[]) => void;
  onSwitchSheet: (sheetId: string) => void;
  onUpdateColumn?: (updatedCol: ColumnDef) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  conditionalRules?: ConditionalFormattingRule[];
}

export const SpreadsheetGrid: React.FC<SpreadsheetGridProps> = ({
  sheet,
  allSheets,
  rows,
  selectedCategory,
  sortConfig,
  onSort,
  onUpdateCell,
  onAddRow,
  onDeleteRows,
  onSwitchSheet,
  onUpdateColumn,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  conditionalRules = [],
}) => {
  // Formula Engine memoized instance and evaluated cells lookup
  const formulaEngine = useMemo(() => new FormulaEngine(sheet), [sheet]);
  const evaluatedMap = useMemo(() => formulaEngine.evaluateAll(), [formulaEngine]);

  // Column statistics for conditional formatting
  const columnStatsMap = useMemo(() => {
    const map = new Map<string, ColumnStatistics>();
    if (!conditionalRules || conditionalRules.length === 0) return map;

    const relevantCols = new Set(conditionalRules.filter((r) => r.enabled).map((r) => r.columnKey));
    relevantCols.forEach((colKey) => {
      map.set(colKey, calculateColumnStatistics(sheet.data, colKey, evaluatedMap));
    });
    return map;
  }, [sheet.data, conditionalRules, evaluatedMap]);

  // Data Validation layer: evaluates rules per column on all cells
  const validationErrors = useMemo(() => validateSheet(sheet), [sheet]);

  // Validation Rule Editor Modal state
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationColKey, setValidationColKey] = useState<string>('');
  const [valRuleType, setValRuleType] = useState<ValidationRuleType>('none');
  const [valMin, setValMin] = useState<string>('');
  const [valMax, setValMax] = useState<string>('');
  const [valOptions, setValOptions] = useState<string>('');
  const [valPattern, setValPattern] = useState<string>('');
  const [valCustomMsg, setValCustomMsg] = useState<string>('');

  // Active cell selection
  const [selectedCell, setSelectedCell] = useState<{
    rowId: string;
    colKey: string;
    rowIndex: number;
    colIndex: number;
  } | null>(null);

  // In-cell editing
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    colKey: string;
  } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Formula bar local input value
  const [formulaBarValue, setFormulaBarValue] = useState<string>('');

  // Formula documentation modal state
  const [showFormulaHelp, setShowFormulaHelp] = useState(false);

  // Selected rows (checkboxes)
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);

  // Relational preview hover popover
  const [relationalPreview, setRelationalPreview] = useState<{
    x: number;
    y: number;
    targetSheetName: string;
    targetSheetId: string;
    record: RowData | null;
    foreignKey: string;
  } | null>(null);

  const editInputRef = useRef<HTMLInputElement>(null);
  const formulaInputRef = useRef<HTMLInputElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);

  const handleScrollGrid = (direction: 'left' | 'right' | 'start' | 'end') => {
    if (!gridScrollRef.current) return;
    if (direction === 'start') {
      gridScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    } else if (direction === 'end') {
      gridScrollRef.current.scrollTo({ left: gridScrollRef.current.scrollWidth, behavior: 'smooth' });
    } else {
      gridScrollRef.current.scrollBy({
        left: direction === 'left' ? -380 : 380,
        behavior: 'smooth',
      });
    }
  };

  // Autocomplete dropdown state
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [autocompleteIndex, setAutocompleteIndex] = useState<number>(0);
  const [autocompleteContext, setAutocompleteContext] = useState<AutocompleteContext | null>(null);
  const [autocompletePosition, setAutocompletePosition] = useState<{ top: number; left: number } | null>(null);
  const [autocompleteSource, setAutocompleteSource] = useState<'cell' | 'formulaBar' | null>(null);

  const clearAutocomplete = () => {
    setAutocompleteSuggestions([]);
    setAutocompleteContext(null);
    setAutocompletePosition(null);
    setAutocompleteSource(null);
  };

  const updateCellAutocomplete = (text: string, inputEl: HTMLInputElement | null) => {
    if (!text.startsWith('=') || !inputEl) {
      clearAutocomplete();
      return;
    }

    const cursorPos = inputEl.selectionStart ?? text.length;
    const ctx = extractFormulaContext(text, cursorPos);
    if (!ctx) {
      clearAutocomplete();
      return;
    }

    const suggestions = getFormulaSuggestions(ctx, sheet);
    if (suggestions.length > 0) {
      const rect = inputEl.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow > 260 ? rect.bottom + 4 : Math.max(10, rect.top - 260);
      const left = Math.min(Math.max(10, rect.left), window.innerWidth - 380);

      setAutocompleteSuggestions(suggestions);
      setAutocompleteIndex(0);
      setAutocompleteContext(ctx);
      setAutocompletePosition({ top, left });
      setAutocompleteSource('cell');
    } else {
      clearAutocomplete();
    }
  };

  const updateFormulaBarAutocomplete = (text: string, inputEl: HTMLInputElement | null) => {
    if (!text.startsWith('=') || !inputEl) {
      clearAutocomplete();
      return;
    }

    const cursorPos = inputEl.selectionStart ?? text.length;
    const ctx = extractFormulaContext(text, cursorPos);
    if (!ctx) {
      clearAutocomplete();
      return;
    }

    const suggestions = getFormulaSuggestions(ctx, sheet);
    if (suggestions.length > 0) {
      const rect = inputEl.getBoundingClientRect();
      const top = rect.bottom + 6;
      const left = Math.min(Math.max(10, rect.left), window.innerWidth - 420);

      setAutocompleteSuggestions(suggestions);
      setAutocompleteIndex(0);
      setAutocompleteContext(ctx);
      setAutocompletePosition({ top, left });
      setAutocompleteSource('formulaBar');
    } else {
      clearAutocomplete();
    }
  };

  const handleSelectAutocomplete = (suggestion: AutocompleteSuggestion) => {
    if (!autocompleteContext) return;

    if (autocompleteSource === 'cell' && editInputRef.current) {
      const { newText, newCursorPos } = applySuggestion(
        editValue,
        autocompleteContext,
        suggestion
      );
      setEditValue(newText);
      setTimeout(() => {
        if (editInputRef.current) {
          editInputRef.current.focus();
          editInputRef.current.setSelectionRange(newCursorPos, newCursorPos);
          updateCellAutocomplete(newText, editInputRef.current);
        }
      }, 10);
    } else if (autocompleteSource === 'formulaBar' && formulaInputRef.current) {
      const { newText, newCursorPos } = applySuggestion(
        formulaBarValue,
        autocompleteContext,
        suggestion
      );
      setFormulaBarValue(newText);
      setTimeout(() => {
        if (formulaInputRef.current) {
          formulaInputRef.current.focus();
          formulaInputRef.current.setSelectionRange(newCursorPos, newCursorPos);
          updateFormulaBarAutocomplete(newText, formulaInputRef.current);
        }
      }, 10);
    }

    if (suggestion.type === 'column' || suggestion.type === 'range') {
      clearAutocomplete();
    }
  };

  // Filter columns by selected category
  const visibleColumns = sheet.columns.filter((c) => {
    if (!c.visible) return false;
    if (selectedCategory === 'ALL') return true;
    return c.category === selectedCategory;
  });

  // Keep formula bar in sync when selected cell changes
  useEffect(() => {
    if (selectedCell) {
      const rawVal = formulaEngine.getRawCellValue(selectedCell.rowId, selectedCell.colKey);
      setFormulaBarValue(rawVal !== undefined && rawVal !== null ? String(rawVal) : '');
    } else {
      setFormulaBarValue('');
    }
    clearAutocomplete();
  }, [selectedCell, sheet, formulaEngine]);

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  const handleStartEdit = (row: RowData, col: ColumnDef) => {
    setEditingCell({ rowId: row._id, colKey: col.key });
    const rawVal = formulaEngine.getRawCellValue(row._id, col.key);
    const textVal = rawVal !== undefined && rawVal !== null ? String(rawVal) : '';
    setEditValue(textVal);
    if (textVal.startsWith('=')) {
      setTimeout(() => {
        if (editInputRef.current) {
          updateCellAutocomplete(textVal, editInputRef.current);
        }
      }, 50);
    } else {
      clearAutocomplete();
    }
  };

  const handleSaveEdit = () => {
    if (!editingCell) return;
    clearAutocomplete();
    const col = sheet.columns.find((c) => c.key === editingCell.colKey);
    let finalVal: any = editValue;

    // If it's a formula (starts with '='), keep formula string as-is!
    if (typeof editValue === 'string' && editValue.trim().startsWith('=')) {
      finalVal = editValue.trim();
    } else if (col) {
      if (col.type === 'number' || col.type === 'currency' || col.type === 'percentage') {
        const parsed = Number(editValue.replace(/[^\d.-]/g, ''));
        finalVal = isNaN(parsed) ? 0 : parsed;
      } else if (col.type === 'boolean') {
        finalVal = editValue === 'true' || editValue === 'Ya' || editValue === '1';
      }
    }

    onUpdateCell(editingCell.rowId, editingCell.colKey, finalVal);
    setEditingCell(null);
  };

  // Active formula cell range detection for visual cell boundary highlighting in grid (e.g. A1:A5)
  const activeFormulaRange = useMemo(() => {
    if (!formulaBarValue || !formulaBarValue.trim().startsWith('=')) return null;

    // Range format: A1:A5 or $A$1:$A$5
    const matchRange = formulaBarValue.match(/(\$?)([A-Za-z]+)(\$?)(\d+)\s*:\s*(\$?)([A-Za-z]+)(\$?)(\d+)/);
    if (matchRange) {
      const col1 = letterToColumnIndex(matchRange[2]);
      const row1 = parseInt(matchRange[4], 10) - 1;
      const col2 = letterToColumnIndex(matchRange[6]);
      const row2 = parseInt(matchRange[8], 10) - 1;

      return {
        type: 'range' as const,
        minCol: Math.min(col1, col2),
        maxCol: Math.max(col1, col2),
        minRow: Math.min(row1, row2),
        maxRow: Math.max(row1, row2),
      };
    }

    // Single cell coordinate: A1 or $A$1
    const matchSingle = formulaBarValue.match(/(\$?)([A-Za-z]+)(\$?)(\d+)/);
    if (matchSingle) {
      const col = letterToColumnIndex(matchSingle[2]);
      const row = parseInt(matchSingle[4], 10) - 1;
      return {
        type: 'single' as const,
        minCol: col,
        maxCol: col,
        minRow: row,
        maxRow: row,
      };
    }

    return null;
  }, [formulaBarValue]);

  // Live dynamic calculation preview while typing in the formula bar
  const liveFormulaPreview = useMemo(() => {
    if (!formulaBarValue || !formulaBarValue.trim().startsWith('=')) return null;
    const formulaStr = formulaBarValue.trim();
    if (formulaStr.length <= 1) return null; // Just '='

    try {
      const targetRowId = selectedCell?.rowId || rows[0]?._id;
      const targetColKey = selectedCell?.colKey || visibleColumns[0]?.key;
      if (!targetRowId || !targetColKey) return null;

      const result = formulaEngine.evaluateFormulaString(formulaStr, targetRowId, targetColKey);
      if (result === undefined || result === null) return null;

      if (typeof result === 'string' && result.startsWith('#')) {
        return { value: result, isError: true };
      }

      const targetCol = sheet.columns.find((c) => c.key === targetColKey);
      const formatted = formatCellValue(result, targetCol?.type || 'number', targetCol?.currencyCode);
      return { value: formatted, raw: result, isError: false };
    } catch {
      return null;
    }
  }, [formulaBarValue, selectedCell, rows, visibleColumns, formulaEngine, sheet.columns]);

  // Commit formula to current selected cell or default target cell
  const handleCommitFormulaBar = () => {
    let target = selectedCell;
    if (!target && rows.length > 0 && visibleColumns.length > 0) {
      target = {
        rowId: rows[0]._id,
        colKey: visibleColumns[0].key,
        rowIndex: 0,
        colIndex: 0,
      };
      setSelectedCell(target);
    }
    if (!target) return;

    let finalVal: any = formulaBarValue;
    if (typeof formulaBarValue === 'string' && !formulaBarValue.trim().startsWith('=')) {
      const col = sheet.columns.find((c) => c.key === target!.colKey);
      if (col && (col.type === 'number' || col.type === 'currency' || col.type === 'percentage')) {
        const parsed = Number(formulaBarValue.replace(/[^\d.-]/g, ''));
        if (!isNaN(parsed)) finalVal = parsed;
      }
    }

    onUpdateCell(target.rowId, target.colKey, finalVal);
    clearAutocomplete();
    formulaInputRef.current?.blur();
  };

  // Cancel formula editing and revert to cell's raw value
  const handleCancelFormulaBar = () => {
    if (selectedCell) {
      const rawVal = formulaEngine.getRawCellValue(selectedCell.rowId, selectedCell.colKey);
      setFormulaBarValue(rawVal !== undefined && rawVal !== null ? String(rawVal) : '');
    } else {
      setFormulaBarValue('');
    }
    clearAutocomplete();
    formulaInputRef.current?.blur();
  };

  // Auto-target cell A1 if user focuses formula bar without prior cell selection
  const handleFormulaBarFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!selectedCell && rows.length > 0 && visibleColumns.length > 0) {
      setSelectedCell({
        rowId: rows[0]._id,
        colKey: visibleColumns[0].key,
        rowIndex: 0,
        colIndex: 0,
      });
    }
    if (e.target.value.startsWith('=')) {
      updateFormulaBarAutocomplete(e.target.value, e.target);
    }
  };

  const handleFormulaBarKeyDown = (e: React.KeyboardEvent) => {
    if (autocompleteSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAutocompleteIndex((prev) => (prev + 1) % autocompleteSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAutocompleteIndex((prev) => (prev - 1 + autocompleteSuggestions.length) % autocompleteSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = autocompleteSuggestions[autocompleteIndex];
        if (selected) {
          handleSelectAutocomplete(selected);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        clearAutocomplete();
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommitFormulaBar();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelFormulaBar();
    }
  };

  const handleInsertQuickFormula = (formulaPrefix: string) => {
    let target = selectedCell;
    if (!target && rows.length > 0 && visibleColumns.length > 0) {
      target = {
        rowId: rows[0]._id,
        colKey: visibleColumns[0].key,
        rowIndex: 0,
        colIndex: 0,
      };
      setSelectedCell(target);
    }
    if (!target) return;

    const currentColLetter = columnIndexToLetter(target.colIndex);
    const prevRowNumber = Math.max(1, target.rowIndex);

    let template = '';
    if (formulaPrefix === 'SUM') {
      template = `=SUM(${currentColLetter}1:${currentColLetter}${Math.max(5, prevRowNumber)})`;
    } else if (formulaPrefix === 'AVG') {
      template = `=AVG(${currentColLetter}1:${currentColLetter}${Math.max(5, prevRowNumber)})`;
    } else if (formulaPrefix === 'COUNT') {
      template = `=COUNT(${currentColLetter}1:${currentColLetter}${Math.max(5, prevRowNumber)})`;
    } else if (formulaPrefix === 'MIN') {
      template = `=MIN(${currentColLetter}1:${currentColLetter}${Math.max(5, prevRowNumber)})`;
    } else if (formulaPrefix === 'MAX') {
      template = `=MAX(${currentColLetter}1:${currentColLetter}${Math.max(5, prevRowNumber)})`;
    } else if (formulaPrefix === 'MULTIPLY') {
      template = `=[Quantity] * [UnitPrice]`;
    } else {
      template = `=${formulaPrefix}`;
    }

    setFormulaBarValue(template);
    onUpdateCell(target.rowId, target.colKey, template);
    formulaInputRef.current?.focus();
  };

  const openValidationModal = (colKey?: string) => {
    const targetKey = colKey || selectedCell?.colKey || visibleColumns[0]?.key || sheet.columns[0]?.key || '';
    setValidationColKey(targetKey);
    const col = sheet.columns.find((c) => c.key === targetKey);
    if (col && col.validation) {
      setValRuleType(col.validation.type);
      setValMin(col.validation.min !== undefined ? String(col.validation.min) : '');
      setValMax(col.validation.max !== undefined ? String(col.validation.max) : '');
      setValOptions(col.validation.allowedOptions?.join(', ') || '');
      setValPattern(col.validation.pattern || '');
      setValCustomMsg(col.validation.customErrorMessage || '');
    } else {
      setValRuleType('none');
      setValMin('');
      setValMax('');
      setValOptions('');
      setValPattern('');
      setValCustomMsg('');
    }
    setShowValidationModal(true);
  };

  const handleSaveValidationRule = (e: React.FormEvent) => {
    e.preventDefault();
    const col = sheet.columns.find((c) => c.key === validationColKey);
    if (!col || !onUpdateColumn) return;

    const newRule: ValidationRule = {
      type: valRuleType,
      min: valMin !== '' ? Number(valMin) : undefined,
      max: valMax !== '' ? Number(valMax) : undefined,
      allowedOptions: valOptions.trim()
        ? valOptions
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      pattern: valPattern.trim() || undefined,
      customErrorMessage: valCustomMsg.trim() || undefined,
    };

    onUpdateColumn({
      ...col,
      validation: newRule.type === 'none' ? undefined : newRule,
    });
    setShowValidationModal(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (autocompleteSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAutocompleteIndex((prev) => (prev + 1) % autocompleteSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAutocompleteIndex((prev) => (prev - 1 + autocompleteSuggestions.length) % autocompleteSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = autocompleteSuggestions[autocompleteIndex];
        if (selected) {
          handleSelectAutocomplete(selected);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        clearAutocomplete();
        return;
      }
    }

    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      clearAutocomplete();
    }
  };

  const toggleSelectAll = () => {
    if (selectedRowIds.length === rows.length) {
      setSelectedRowIds([]);
    } else {
      setSelectedRowIds(rows.map((r) => r._id));
    }
  };

  const toggleSelectRow = (id: string) => {
    if (selectedRowIds.includes(id)) {
      setSelectedRowIds(selectedRowIds.filter((r) => r !== id));
    } else {
      setSelectedRowIds([...selectedRowIds, id]);
    }
  };

  const showRelationalPopover = (
    e: React.MouseEvent,
    col: ColumnDef,
    foreignKeyValue: any
  ) => {
    if (col.type !== 'relation' || !col.relation || !foreignKeyValue) return;
    const { targetRow } = resolveRelation(allSheets, col.relation, foreignKeyValue);
    const targetSheet = allSheets.find((s) => s.id === col.relation?.targetSheetId);

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setRelationalPreview({
      x: rect.left,
      y: rect.bottom + 6,
      targetSheetName: targetSheet?.name || 'Sheet Terhubung',
      targetSheetId: col.relation.targetSheetId,
      record: targetRow,
      foreignKey: String(foreignKeyValue),
    });
  };

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden relative">
      {/* Dedicated Excel Formula Bar & Status */}
      <div className="bg-slate-50/90 border-b border-slate-200 px-4 py-2 flex flex-col gap-2">
        {/* Top Primary Row: Name Box + Actions + Dedicated Formula Input Field + Live Preview */}
        <div className="flex items-center gap-2">
          {/* Undo & Redo Toolbar */}
          {onUndo && onRedo && (
            <div className="flex items-center gap-0.5 bg-slate-200/70 p-0.5 rounded-md border border-slate-200/90 shrink-0">
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className="p-1 rounded text-slate-700 hover:bg-white hover:text-blue-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-700 transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed"
                title="Undo / Urungkan Perubahan (Ctrl+Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onRedo}
                disabled={!canRedo}
                className="p-1 rounded text-slate-700 hover:bg-white hover:text-blue-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-700 transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed"
                title="Redo / Ulangi Perubahan (Ctrl+Y atau Ctrl+Shift+Z)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Cell Coordinate Box: e.g. A1, F5 */}
          <div
            className="flex items-center gap-1.5 text-blue-950 font-mono font-bold px-2.5 py-1 bg-white border border-slate-300 rounded-md min-w-[75px] justify-center shadow-2xs text-xs shrink-0 select-none cursor-default"
            title={selectedCell ? `Sel Aktif: Kolom ${columnIndexToLetter(selectedCell.colIndex)}, Baris ${selectedCell.rowIndex + 1}` : 'Sel Aktif: A1'}
          >
            <span>
              {selectedCell
                ? `${columnIndexToLetter(selectedCell.colIndex)}${selectedCell.rowIndex + 1}`
                : 'A1'}
            </span>
          </div>

          {/* Formula Function Controls (Cancel & Accept buttons + fx badge) */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleCancelFormulaBar}
              className="p-1 rounded hover:bg-rose-50 hover:text-rose-600 text-slate-400 transition-colors cursor-pointer"
              title="Batalkan Perubahan Rumus (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleCommitFormulaBar}
              className="p-1 rounded hover:bg-emerald-50 hover:text-emerald-700 text-slate-400 transition-colors cursor-pointer"
              title="Terapkan Rumus ke Sel (Enter)"
            >
              <Check className="w-4 h-4 text-emerald-600" />
            </button>
            <div className="h-4 w-px bg-slate-300 mx-0.5" />
            <div
              className="flex items-center justify-center w-6 h-6 rounded bg-blue-50 border border-blue-200/80 text-blue-700 font-serif italic text-xs font-bold select-none"
              title="Bilah Rumus Excel NexusSheet (Dedicated Formula Field)"
            >
              fx
            </div>
          </div>

          {/* Dedicated Formula Input Field */}
          <div className="flex-1 relative flex items-center min-w-[280px]">
            <input
              ref={formulaInputRef}
              type="text"
              value={formulaBarValue}
              onChange={(e) => {
                const val = e.target.value;
                setFormulaBarValue(val);
                updateFormulaBarAutocomplete(val, formulaInputRef.current);
              }}
              onFocus={handleFormulaBarFocus}
              onClick={(e) => {
                if (formulaBarValue.startsWith('=')) {
                  updateFormulaBarAutocomplete(formulaBarValue, e.currentTarget);
                }
              }}
              onKeyDown={handleFormulaBarKeyDown}
              placeholder="Ketik nilai atau rumus Excel (contoh: =SUM(A1:A5), =AVG(F1:F10), =F2 * G2, =[Quantity]*[UnitPrice])..."
              className="w-full bg-white border border-slate-300 rounded-lg pl-3 pr-32 py-1.5 text-xs text-slate-900 font-mono outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all shadow-2xs placeholder:text-slate-400"
            />

            {/* Live Calculation Preview Badge */}
            {liveFormulaPreview && (
              <div
                className={`absolute right-2 px-2 py-0.5 rounded text-[11px] font-mono font-bold flex items-center gap-1 border shadow-2xs animate-in fade-in duration-150 ${
                  liveFormulaPreview.isError
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
                title={`Kalkulasi instan: ${liveFormulaPreview.value}`}
              >
                <span className="text-[10px] opacity-75 font-sans font-semibold">Hasil:</span>
                <span>{liveFormulaPreview.value}</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Secondary Row: Quick Excel Functions + Guide buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-semibold text-slate-500 mr-1 flex items-center gap-1">
              <span>Sisipkan Rumus Cepat:</span>
            </span>
            <div className="flex items-center gap-1 bg-slate-200/60 p-0.5 rounded-md">
              <button
                type="button"
                onClick={() => handleInsertQuickFormula('SUM')}
                className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-white text-slate-700 rounded hover:bg-blue-50 hover:text-blue-700 transition-colors shadow-2xs cursor-pointer"
                title="Sisipkan rumus penjumlahan: =SUM(range)"
              >
                =SUM(range)
              </button>
              <button
                type="button"
                onClick={() => handleInsertQuickFormula('AVG')}
                className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-white text-slate-700 rounded hover:bg-emerald-50 hover:text-emerald-700 transition-colors shadow-2xs cursor-pointer"
                title="Sisipkan rumus rata-rata: =AVG(range)"
              >
                =AVG(range)
              </button>
              <button
                type="button"
                onClick={() => handleInsertQuickFormula('COUNT')}
                className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-white text-slate-700 rounded hover:bg-amber-50 hover:text-amber-700 transition-colors shadow-2xs cursor-pointer"
                title="Sisipkan rumus total baris: =COUNT(range)"
              >
                =COUNT(range)
              </button>
              <button
                type="button"
                onClick={() => handleInsertQuickFormula('MIN')}
                className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-white text-slate-700 rounded hover:bg-sky-50 hover:text-sky-700 transition-colors shadow-2xs cursor-pointer"
                title="Sisipkan nilai terendah: =MIN(range)"
              >
                =MIN(range)
              </button>
              <button
                type="button"
                onClick={() => handleInsertQuickFormula('MAX')}
                className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-white text-slate-700 rounded hover:bg-rose-50 hover:text-rose-700 transition-colors shadow-2xs cursor-pointer"
                title="Sisipkan nilai tertinggi: =MAX(range)"
              >
                =MAX(range)
              </button>
              <button
                type="button"
                onClick={() => handleInsertQuickFormula('MULTIPLY')}
                className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-white text-slate-700 rounded hover:bg-teal-50 hover:text-teal-700 transition-colors shadow-2xs cursor-pointer"
                title="Sisipkan rumus perkalian kolom: =[Quantity] * [UnitPrice]"
              >
                =[Qty]*[Price]
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowFormulaHelp(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white hover:bg-blue-50/60 hover:text-blue-700 border border-slate-200 hover:border-blue-200 rounded-md transition-colors shadow-2xs cursor-pointer"
              title="Lihat panduan sintaks rumus spreadsheet"
            >
              <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
              <span>Panduan Rumus</span>
            </button>

            <button
              type="button"
              onClick={() => openValidationModal()}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium border rounded-md transition-colors shadow-2xs cursor-pointer ${
                validationErrors.size > 0
                  ? 'text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100'
                  : 'text-slate-700 bg-white border-slate-200 hover:bg-slate-50'
              }`}
              title="Atur aturan validasi data kolom"
            >
              <ShieldCheck className={`w-3.5 h-3.5 ${validationErrors.size > 0 ? 'text-rose-600' : 'text-slate-500'}`} />
              <span>Validasi Kolom</span>
              {validationErrors.size > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                  {validationErrors.size}
                </span>
              )}
            </button>

            {selectedRowIds.length > 0 && (
              <button
                onClick={() => {
                  onDeleteRows(selectedRowIds);
                  setSelectedRowIds([]);
                }}
                className="flex items-center gap-1 text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Hapus ({selectedRowIds.length})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid Viewport */}
      <div ref={gridScrollRef} className="flex-1 overflow-x-auto overflow-y-auto bg-slate-100/50 scroll-smooth">
        <table
          style={{ minWidth: `${Math.max(1200, visibleColumns.reduce((sum, c) => sum + (c.width || 150), 60))}px` }}
          className="border-collapse table-fixed w-full text-xs text-left bg-white"
        >
          {/* Header Row */}
          <thead className="sticky top-0 z-20 bg-slate-100 border-b border-slate-300 shadow-2xs select-none">
            <tr>
              {/* Row Selector Column */}
              <th className="w-12 px-2 py-2 text-center bg-slate-100 border-r border-slate-200 font-mono text-[11px] text-slate-500 sticky left-0 z-30 shadow-xs">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selectedRowIds.length === rows.length}
                  onChange={toggleSelectAll}
                  className="rounded text-slate-800"
                />
              </th>

              {/* Column Headers */}
              {visibleColumns.map((col, cIdx) => {
                const isSorted = sortConfig?.columnKey === col.key;
                const badgeStyle = getCategoryBadgeStyle(col.category);

                return (
                  <th
                    key={`${col.key}-${cIdx}`}
                    style={{ width: col.width ? `${col.width}px` : '150px' }}
                    className="relative group px-3 py-2 border-r border-slate-200 text-slate-700 hover:bg-slate-200/60 transition-colors"
                  >
                    <div className="flex flex-col gap-0.5">
                      {/* Top Category Badge & Validation Indicator */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="font-mono text-[10px] font-bold text-blue-700 bg-blue-100/80 border border-blue-200/90 px-1.5 py-0.2 rounded shadow-2xs select-none shrink-0"
                            title={`Kolom ${columnIndexToLetter(cIdx)} (${col.name})`}
                          >
                            {columnIndexToLetter(cIdx)}
                          </span>
                          <span
                            className="text-[9px] font-medium uppercase tracking-wider text-slate-400 truncate max-w-[80px]"
                            title={`Kategori: ${col.category}`}
                          >
                            {col.category}
                          </span>
                        </div>

                        <div className="flex items-center gap-0.5">
                          {col.validation && col.validation.type !== 'none' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openValidationModal(col.key);
                              }}
                              className="text-[9px] bg-amber-50 text-amber-900 border border-amber-200/80 font-mono font-medium px-1 rounded flex items-center gap-0.5 hover:bg-amber-100 transition-colors"
                              title={`Validasi Aktif: ${getValidationRuleLabel(col.validation.type)} (Klik untuk atur)`}
                            >
                              <ShieldCheck className="w-2.5 h-2.5 text-amber-600" />
                              <span className="truncate max-w-[45px]">{col.validation.type}</span>
                            </button>
                          )}
                          {col.isPrimaryKey && (
                            <span
                              className="text-[9px] font-mono bg-blue-50 text-blue-800 border border-blue-200/90 font-bold px-1 rounded shadow-2xs"
                              title="Primary Key Sheet"
                            >
                              PK
                            </span>
                          )}
                          {col.type === 'relation' && (
                            <span
                              className="text-[9px] font-mono bg-teal-50 text-teal-800 border border-teal-200/90 font-bold px-1 rounded shadow-2xs flex items-center gap-0.5"
                              title="Foreign Key Relational"
                            >
                              <Link2 className="w-2.5 h-2.5 text-teal-600" />
                              FK
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Column Title & Sort Button */}
                      <div
                        onClick={() => onSort(col.key)}
                        className="flex items-center justify-between cursor-pointer pt-0.5"
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-slate-800 truncate">
                          {getTypeIcon(col.type)}
                          <span className="truncate">{col.name}</span>
                        </div>

                        <div className="shrink-0 text-slate-400 group-hover:text-slate-700">
                          {isSorted ? (
                            sortConfig?.direction === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-blue-600" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-200">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + 1}
                  className="px-6 py-16 text-center text-slate-400 bg-white"
                >
                  <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-medium text-slate-600">Tidak ada data ditemukan</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Coba sesuaikan kata kunci pencarian atau bersihkan filter aktif.
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((row, rIdx) => {
                const isRowSelected = selectedRowIds.includes(row._id);

                return (
                  <tr
                    key={row._id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isRowSelected ? 'bg-blue-50/50' : rIdx % 2 === 1 ? 'bg-slate-50/25' : 'bg-white'
                    }`}
                  >
                    {/* Row Number & Checkbox */}
                    <td className="px-2 py-1.5 text-center border-r border-slate-200 font-mono text-[11px] text-slate-500 bg-slate-50/95 select-none sticky left-0 z-10 shadow-xs">
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="checkbox"
                          checked={isRowSelected}
                          onChange={() => toggleSelectRow(row._id)}
                          className="rounded text-slate-800"
                        />
                        <span className="w-4 text-right">{rIdx + 1}</span>
                      </div>
                    </td>

                    {/* Cells */}
                    {visibleColumns.map((col, cIdx) => {
                      const isCellActive =
                        selectedCell?.rowId === row._id && selectedCell?.colKey === col.key;
                      const isEditing =
                        editingCell?.rowId === row._id && editingCell?.colKey === col.key;
                      const isRangeReferenced =
                        activeFormulaRange &&
                        cIdx >= activeFormulaRange.minCol &&
                        cIdx <= activeFormulaRange.maxCol &&
                        rIdx >= activeFormulaRange.minRow &&
                        rIdx <= activeFormulaRange.maxRow;
                      const rawVal = row[col.key];
                      const evalVal = isFormula(rawVal) ? evaluatedMap.get(`${row._id}:${col.key}`) : rawVal;
                      const cellError = validationErrors.get(`${row._id}:${col.key}`);
                      const condFormat = evaluateCellConditionalFormat(
                        evalVal,
                        col.key,
                        conditionalRules,
                        columnStatsMap.get(col.key),
                        col
                      );

                      return (
                        <td
                          key={`${col.key}-${cIdx}`}
                          onClick={() =>
                            setSelectedCell({
                              rowId: row._id,
                              colKey: col.key,
                              rowIndex: rIdx,
                              colIndex: cIdx,
                            })
                          }
                          onDoubleClick={() => handleStartEdit(row, col)}
                          title={
                            cellError
                              ? `⚠️ Validasi Gagal: ${cellError.message}`
                              : isFormula(rawVal)
                              ? `Rumus: ${rawVal}`
                              : condFormat?.ruleName
                              ? `${condFormat.ruleName}`
                              : undefined
                          }
                          style={{
                            backgroundColor:
                              !isCellActive && !cellError && condFormat?.backgroundColor
                                ? condFormat.backgroundColor
                                : undefined,
                            color: !cellError && condFormat?.textColor ? condFormat.textColor : undefined,
                          }}
                          className={`relative group/cell px-3 py-1.5 border-r border-slate-200 truncate font-mono text-xs ${
                            col.type === 'number' || col.type === 'currency' || col.type === 'percentage'
                              ? 'text-right tabular-nums'
                              : 'text-left'
                          } ${
                            cellError
                              ? 'bg-rose-50/50 text-rose-950 font-medium ring-1 ring-inset ring-rose-200/80'
                              : ''
                          } ${
                            isCellActive
                              ? 'outline-2 outline-blue-600 outline-offset-[-2px] bg-blue-50/25'
                              : isRangeReferenced
                              ? 'ring-2 ring-inset ring-blue-500/80 bg-blue-50/40 font-semibold'
                              : ''
                          }`}
                        >
                          {/* Data Bar Background Fill */}
                          {condFormat?.dataBar && (
                            <div
                              className="absolute inset-y-0 left-0 pointer-events-none rounded-xs transition-all duration-300"
                              style={{
                                width: `${condFormat.dataBar.widthPercent}%`,
                                backgroundColor: condFormat.dataBar.color,
                              }}
                            />
                          )}

                          {/* Subtle red corner notch for invalid cells */}
                          {cellError && (
                            <div
                              className="absolute top-0 right-0 w-2.5 h-2.5 pointer-events-none z-10"
                              title={cellError.message}
                            >
                              <svg viewBox="0 0 10 10" className="w-full h-full text-rose-500 fill-current">
                                <polygon points="0,0 10,0 10,10" />
                              </svg>
                            </div>
                          )}
                          {isEditing ? (
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <input
                                ref={editInputRef}
                                type="text"
                                value={editValue}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setEditValue(val);
                                  updateCellAutocomplete(val, editInputRef.current);
                                }}
                                onFocus={(e) => {
                                  if (e.target.value.startsWith('=')) {
                                    updateCellAutocomplete(e.target.value, e.target);
                                  }
                                }}
                                onClick={(e) => {
                                  if (editValue.startsWith('=')) {
                                    updateCellAutocomplete(editValue, e.currentTarget);
                                  }
                                }}
                                onKeyDown={handleKeyDown}
                                onBlur={() => {
                                  setTimeout(() => {
                                    handleSaveEdit();
                                  }, 180);
                                }}
                                className="w-full px-1.5 py-0.5 border border-blue-500 rounded bg-white text-xs text-slate-900 outline-hidden font-mono shadow-xs"
                              />
                            </div>
                          ) : col.type === 'relation' ? (
                            // Relational Link Cell
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                showRelationalPopover(e, col, rawVal);
                              }}
                              className="inline-flex items-center gap-1.5 text-blue-700 hover:text-blue-900 font-semibold cursor-pointer group/link hover:underline py-0.5"
                              title="Klik untuk membuka preview relasi dari sheet lain"
                            >
                              <Link2 className="w-3 h-3 text-teal-600 group-hover/link:text-teal-700" />
                              <span>{String(rawVal || '—')}</span>
                            </div>
                          ) : isFormula(rawVal) ? (
                            // Formula Evaluated Cell
                            (() => {
                              const evalVal = evaluatedMap.get(`${row._id}:${col.key}`);
                              const isError = typeof evalVal === 'string' && evalVal.startsWith('#');

                              if (isError) {
                                return (
                                  <span
                                    className="inline-flex items-center gap-1 text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded text-[11px] font-mono font-bold"
                                    title={`Rumus: ${rawVal}\nError: ${evalVal}`}
                                  >
                                    <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                                    <span>{evalVal}</span>
                                  </span>
                                );
                              }

                              return (
                                <div
                                  className="flex items-center justify-between gap-1 group/fcell relative z-10"
                                  title={`Rumus: ${rawVal}`}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 truncate">
                                    {condFormat?.icon && (
                                      <span
                                        className="shrink-0 text-xs select-none"
                                        title={condFormat.icon.label}
                                      >
                                        {condFormat.icon.symbol}
                                      </span>
                                    )}
                                    <span
                                      className={`truncate ${
                                        condFormat?.fontWeight === 'bold' ? 'font-bold' : 'font-semibold text-slate-900'
                                      }`}
                                    >
                                      {formatCellValue(evalVal, col.type, col.currencyCode)}
                                    </span>
                                  </div>
                                  <span
                                    className="text-[9px] text-indigo-500 font-serif italic select-none font-bold opacity-60 group-hover/fcell:opacity-100 shrink-0 ml-1"
                                    title={`Kalkulasi rumus: ${rawVal}`}
                                  >
                                    fx
                                  </span>
                                </div>
                              );
                            })()
                          ) : col.type === 'category' ? (
                            // Category Tag Cell
                            col.categoryColors && rawVal && col.categoryColors[rawVal] ? (
                              <span
                                style={{
                                  backgroundColor: `${col.categoryColors[rawVal]}15`,
                                  color: col.categoryColors[rawVal],
                                  borderColor: `${col.categoryColors[rawVal]}40`,
                                }}
                                className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold border relative z-10"
                              >
                                {String(rawVal)}
                              </span>
                            ) : (
                              <span className="relative z-10">{String(rawVal || '—')}</span>
                            )
                          ) : (
                            <div
                              className={`flex items-center gap-1.5 relative z-10 min-w-0 ${
                                col.type === 'number' || col.type === 'currency' || col.type === 'percentage'
                                  ? 'justify-end'
                                  : 'justify-start'
                              }`}
                            >
                              {condFormat?.icon && (
                                <span
                                  className="shrink-0 text-xs select-none"
                                  title={condFormat.icon.label}
                                >
                                  {condFormat.icon.symbol}
                                </span>
                              )}
                              <span
                                className={`truncate ${
                                  condFormat?.fontWeight === 'bold' ? 'font-bold' : 'text-slate-800'
                                }`}
                              >
                                {formatCellValue(rawVal, col.type, col.currencyCode)}
                              </span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Footer Summary Row */}
          {rows.length > 0 && (
            <tfoot className="sticky bottom-0 z-20 bg-slate-100 border-t-2 border-slate-300 font-semibold text-slate-800">
              <tr>
                <td className="px-2 py-2 text-center text-slate-500 border-r border-slate-200 font-mono text-[10px] uppercase sticky left-0 z-30 bg-slate-100 shadow-xs">
                  Total
                </td>
                {visibleColumns.map((col, cIdx) => {
                  const summary = calculateColumnSummary(rows, col);

                  return (
                    <td
                      key={`foot-${col.key}-${cIdx}`}
                      className={`px-3 py-2 border-r border-slate-200 text-xs ${
                        col.type === 'number' || col.type === 'currency' || col.type === 'percentage'
                          ? 'text-right tabular-nums'
                          : 'text-left'
                      }`}
                    >
                      {summary ? (
                        <div>
                          <div className="text-[10px] text-slate-400 font-normal uppercase">
                            {summary.label}
                          </div>
                          <div className="font-bold text-slate-900 font-mono">{summary.value}</div>
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Relational Quick Preview Popover */}
      {relationalPreview && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setRelationalPreview(null)}
          />
          <div
            style={{
              position: 'fixed',
              left: `${Math.min(relationalPreview.x, window.innerWidth - 340)}px`,
              top: `${Math.min(relationalPreview.y, window.innerHeight - 300)}px`,
            }}
            className="w-80 bg-white border border-slate-300 rounded-xl shadow-2xl z-50 p-4 text-xs animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2.5">
              <div className="flex items-center gap-1.5 text-indigo-700 font-bold">
                <Link2 className="w-3.5 h-3.5" />
                <span>Relasi Entitas Terhubung</span>
              </div>
              <button
                onClick={() => setRelationalPreview(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1.5 mb-3">
              <div className="text-[11px] text-slate-500">
                Sheet Sumber: <span className="font-semibold text-slate-800">{relationalPreview.targetSheetName}</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Kunci Relasi: <span className="font-mono font-bold text-indigo-600">{relationalPreview.foreignKey}</span>
              </div>
            </div>

            {relationalPreview.record ? (
              <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200 space-y-1.5 max-h-48 overflow-y-auto">
                {Object.entries(relationalPreview.record)
                  .filter(([k]) => !k.startsWith('_'))
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between items-start gap-2 border-b border-slate-100/80 pb-1 last:border-0 last:pb-0">
                      <span className="text-slate-500 text-[11px] truncate">{k}:</span>
                      <span className="font-semibold text-slate-800 text-right truncate font-mono text-[11px]">
                        {String(v)}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-slate-400 italic p-3 text-center bg-slate-50 rounded">
                Tidak ada data record yang cocok dengan kunci ini di sheet tujuan.
              </div>
            )}

            <div className="mt-3 pt-2 border-t border-slate-100 flex justify-between items-center">
              <span className="text-[10px] text-slate-400">Relational Database Link</span>
              <button
                onClick={() => {
                  onSwitchSheet(relationalPreview.targetSheetId);
                  setRelationalPreview(null);
                }}
                className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
              >
                <span>Buka {relationalPreview.targetSheetName}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Formula Documentation & Help Modal */}
      {showFormulaHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Panduan Rumus & Referensi Sel (Formula Engine)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Mendukung perhitungan aritmatika, fungsi agregasi, dan referensi kolom relatif / absolut
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFormulaHelp(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {/* Reference rules explanation box */}
              <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-lg space-y-2 text-indigo-950">
                <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                  <FunctionSquare className="w-4 h-4 text-indigo-600" />
                  <span>Sistem Referensi Kolom (Relatif vs Absolut)</span>
                </div>
                <ul className="list-disc pl-4 space-y-1 text-slate-700 leading-relaxed text-[11px]">
                  <li>
                    <strong>Referensi Sel Relatif (contoh: <code className="bg-white px-1 py-0.5 rounded border border-indigo-200 font-mono text-indigo-700">F2</code>, <code className="bg-white px-1 py-0.5 rounded border border-indigo-200 font-mono text-indigo-700">A1</code>)</strong>: Menunjuk ke sel koordinat kolom dan baris.
                  </li>
                  <li>
                    <strong>Referensi Absolut dengan tanda <code className="bg-white px-1 py-0.5 rounded border border-indigo-200 font-mono text-indigo-700">$</code> (contoh: <code className="bg-white px-1 py-0.5 rounded border border-indigo-200 font-mono text-indigo-700">$F$1</code>, <code className="bg-white px-1 py-0.5 rounded border border-indigo-200 font-mono text-indigo-700">F$1</code>, <code className="bg-white px-1 py-0.5 rounded border border-indigo-200 font-mono text-indigo-700">$F1</code>)</strong>: Mengunci kolom atau baris tertentu secara konstan.
                  </li>
                  <li>
                    <strong>Rentang Sel (contoh: <code className="bg-white px-1 py-0.5 rounded border border-indigo-200 font-mono text-indigo-700">F1:F10</code> atau <code className="bg-white px-1 py-0.5 rounded border border-indigo-200 font-mono text-indigo-700">$F$1:$F$15</code>)</strong>: Mengambil kumpulan nilai dari rentang koordinat untuk fungsi seperti SUM, AVG, dan COUNT.
                  </li>
                  <li>
                    <strong>Nama Kolom Langsung (contoh: <code className="bg-white px-1 py-0.5 rounded border border-indigo-200 font-mono text-indigo-700">[Quantity] * [UnitPrice]</code>)</strong>: Mengambil nilai kolom pada baris yang sama.
                  </li>
                </ul>
              </div>

              {/* Function list */}
              <div className="space-y-2.5">
                <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  Daftar Fungsi Formula yang Tersedia
                </span>
                <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                  {FORMULA_DOCS.map((doc) => (
                    <div key={doc.name} className="p-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 font-mono">{doc.name}</span>
                        <span className="font-mono text-[11px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                          {doc.syntax}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-1 text-[11px]">{doc.desc}</p>
                      <div className="mt-1 text-[11px] text-slate-500 font-mono bg-slate-100/70 px-2 py-1 rounded inline-block">
                        Contoh: <strong className="text-slate-800">{doc.example}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowFormulaHelp(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                Tutup Panduan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data Validation Rule Configuration Modal */}
      {showValidationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Aturan Validasi Kolom (Data Validation)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tentukan syarat nilai untuk kolom. Sel yang tidak valid akan ditandai segitiga merah halus.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowValidationModal(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveValidationRule} className="p-6 space-y-4 text-xs">
              {/* Select Column */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Pilih Kolom yang Divalidasi
                </label>
                <select
                  value={validationColKey}
                  onChange={(e) => {
                    const key = e.target.value;
                    setValidationColKey(key);
                    const col = sheet.columns.find((c) => c.key === key);
                    if (col && col.validation) {
                      setValRuleType(col.validation.type);
                      setValMin(col.validation.min !== undefined ? String(col.validation.min) : '');
                      setValMax(col.validation.max !== undefined ? String(col.validation.max) : '');
                      setValOptions(col.validation.allowedOptions?.join(', ') || '');
                      setValPattern(col.validation.pattern || '');
                      setValCustomMsg(col.validation.customErrorMessage || '');
                    } else {
                      setValRuleType('none');
                      setValMin('');
                      setValMax('');
                      setValOptions('');
                      setValPattern('');
                      setValCustomMsg('');
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 text-xs font-medium"
                >
                  {sheet.columns.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name} ({c.type}) {c.validation ? `— [${c.validation.type}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Rule Type */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Jenis Aturan Validasi
                </label>
                <select
                  value={valRuleType}
                  onChange={(e) => setValRuleType(e.target.value as ValidationRuleType)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 text-xs"
                >
                  <option value="none">Tidak Ada Validasi (Bebas)</option>
                  <option value="numeric">Harus Berupa Angka Numerik</option>
                  <option value="positive_number">Harus Angka Positif Lebih dari Nol (&gt; 0)</option>
                  <option value="range">Rentang Nilai Spesifik (Min s/d Max)</option>
                  <option value="unique">Harus Nilai Unik (Tidak Boleh Duplikat)</option>
                  <option value="required">Wajib Diisi (Tidak Boleh Kosong)</option>
                  <option value="email">Format Email Valid (nama@domain.com)</option>
                  <option value="options">Pilihan Terbatas dari Daftar (Whitelist)</option>
                  <option value="regex">Pola Kustom (Regular Expression)</option>
                </select>
              </div>

              {/* Dynamic Range Inputs */}
              {valRuleType === 'range' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Batas Minimal (Min)</label>
                    <input
                      type="number"
                      value={valMin}
                      onChange={(e) => setValMin(e.target.value)}
                      placeholder="e.g. 1"
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded bg-white text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Batas Maksimal (Max)</label>
                    <input
                      type="number"
                      value={valMax}
                      onChange={(e) => setValMax(e.target.value)}
                      placeholder="e.g. 100"
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded bg-white text-xs text-slate-800"
                    />
                  </div>
                </div>
              )}

              {/* Dynamic Options Input */}
              {valRuleType === 'options' && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <label className="block text-slate-600 mb-1 font-medium">
                    Daftar Opsi yang Diperbolehkan (pisahkan dengan koma)
                  </label>
                  <input
                    type="text"
                    value={valOptions}
                    onChange={(e) => setValOptions(e.target.value)}
                    placeholder="e.g. Lunas, Menunggu, Cicilan, Batal"
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded bg-white text-xs text-slate-800"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Hanya nilai yang persis terdaftar yang akan dianggap valid.
                  </p>
                </div>
              )}

              {/* Dynamic Regex Pattern */}
              {valRuleType === 'regex' && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <label className="block text-slate-600 mb-1 font-medium">Pola Regex</label>
                  <input
                    type="text"
                    value={valPattern}
                    onChange={(e) => setValPattern(e.target.value)}
                    placeholder="e.g. ^ORD-\d{4}-\d{3}$"
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded bg-white text-xs text-slate-800 font-mono"
                  />
                </div>
              )}

              {/* Custom Error Message */}
              {valRuleType !== 'none' && (
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Pesan Kesalahan Kustom (Opsional)
                  </label>
                  <input
                    type="text"
                    value={valCustomMsg}
                    onChange={(e) => setValCustomMsg(e.target.value)}
                    placeholder="Pesan yang muncul saat sel ini tidak valid..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 text-xs"
                  />
                </div>
              )}

              {/* Footer buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                {valRuleType !== 'none' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setValRuleType('none');
                      setValMin('');
                      setValMax('');
                      setValOptions('');
                      setValCustomMsg('');
                    }}
                    className="text-red-600 hover:text-red-700 font-medium text-xs"
                  >
                    Hapus Aturan
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowValidationModal(false)}
                    className="px-3 py-2 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 transition-colors shadow-xs"
                  >
                    Simpan Aturan Validasi
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grid Bottom Bar: Add Row, Stats & Horizontal Column Scroll Navigator */}
      <div className="bg-white border-t border-slate-200 px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onAddRow}
            className="flex items-center gap-1 px-3 py-1 bg-blue-50/80 hover:bg-blue-100/90 text-blue-900 border border-blue-200/90 rounded-md font-semibold transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-blue-600" />
            <span>Tambah Baris Baru</span>
          </button>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500 tabular-nums">
            {rows.length} Baris data aktif · {visibleColumns.length} Kolom terlihat
          </span>

          {validationErrors.size > 0 && (
            <button
              onClick={() => openValidationModal()}
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-[11px] font-semibold transition-colors"
              title="Klik untuk membuka pengelola validasi"
            >
              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>{validationErrors.size} sel terdeteksi tidak valid</span>
            </button>
          )}
        </div>

        {/* Horizontal Scroll Controls for wide / multi-sheet joined tables */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-[11px] text-slate-500 font-medium">Geser Kolom:</span>
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => handleScrollGrid('start')}
              className="px-2 py-0.5 text-[11px] font-semibold bg-white hover:bg-slate-50 text-slate-700 rounded shadow-2xs border border-slate-200 transition-colors cursor-pointer"
              title="Geser langsung ke kolom pertama (paling kiri)"
            >
              ⏮ Awal
            </button>
            <button
              type="button"
              onClick={() => handleScrollGrid('left')}
              className="px-2.5 py-0.5 text-[11px] font-semibold bg-white hover:bg-slate-50 text-slate-700 rounded shadow-2xs border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
              title="Geser tampilan kolom ke arah kiri"
            >
              <ChevronLeft className="w-3 h-3" />
              <span>Kiri</span>
            </button>
            <button
              type="button"
              onClick={() => handleScrollGrid('right')}
              className="px-2.5 py-0.5 text-[11px] font-semibold bg-white hover:bg-slate-50 text-slate-700 rounded shadow-2xs border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
              title="Geser tampilan kolom ke arah kanan untuk melihat seluruh data sel"
            >
              <span>Kanan</span>
              <ChevronRight className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => handleScrollGrid('end')}
              className="px-2 py-0.5 text-[11px] font-semibold bg-white hover:bg-slate-50 text-slate-700 rounded shadow-2xs border border-slate-200 transition-colors cursor-pointer"
              title="Geser langsung ke kolom terakhir (paling kanan)"
            >
              Ujung ⏭
            </button>
          </div>
        </div>
      </div>

      {/* Formula Autocomplete Dropdown Popover */}
      {autocompleteSuggestions.length > 0 && autocompletePosition && (
        <FormulaAutocompleteDropdown
          suggestions={autocompleteSuggestions}
          selectedIndex={autocompleteIndex}
          onSelect={handleSelectAutocomplete}
          onHoverIndex={setAutocompleteIndex}
          position={autocompletePosition}
          activeToken={autocompleteContext?.activeToken || ''}
        />
      )}
    </div>
  );
};

function getTypeIcon(type: ColumnType) {
  switch (type) {
    case 'number':
      return <Hash className="w-3 h-3 text-slate-400" />;
    case 'currency':
      return <DollarSign className="w-3 h-3 text-slate-400" />;
    case 'date':
      return <Calendar className="w-3 h-3 text-slate-400" />;
    case 'category':
      return <Layers className="w-3 h-3 text-slate-400" />;
    case 'rating':
      return <Star className="w-3 h-3 text-slate-400" />;
    case 'percentage':
      return <Percent className="w-3 h-3 text-slate-400" />;
    case 'relation':
      return <Link2 className="w-3 h-3 text-slate-400" />;
    default:
      return null;
  }
}
