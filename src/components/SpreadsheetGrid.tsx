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
  MoreVertical,
  Check,
  X,
  FileSpreadsheet,
  Calculator,
  HelpCircle,
  FunctionSquare,
  AlertTriangle,
  Undo2,
  Redo2,
  CheckSquare,
  Edit3,
  FolderInput,
  Loader2,
  RefreshCw,
  Copy,
  FileSearch
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
  isAIFormula,
  columnIndexToLetter,
  letterToColumnIndex,
  FORMULA_DOCS,
  AIFormulaCache
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
  onBulkUpdateColumn?: (rowIds: string[], columnKey: string, newValue: any) => void;
  onMoveRowsToSheet?: (
    rowIds: string[],
    targetSheetId: string,
    options?: { newSheetName?: string; includeUnmatchedColumns?: boolean }
  ) => void;
  onSwitchSheet: (sheetId: string) => void;
  onUpdateColumn?: (updatedCol: ColumnDef) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  conditionalRules?: ConditionalFormattingRule[];
  aiResultsCache?: AIFormulaCache;
  onRefreshAICell?: (cacheKey: string) => void;
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
  onBulkUpdateColumn,
  onMoveRowsToSheet,
  onSwitchSheet,
  onUpdateColumn,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  conditionalRules = [],
  aiResultsCache = {},
  onRefreshAICell,
}) => {
  // Formula Engine memoized instance and evaluated cells lookup
  const formulaEngine = useMemo(
    () => new FormulaEngine(sheet, aiResultsCache),
    [sheet, aiResultsCache]
  );
  const evaluatedMap = useMemo(() => formulaEngine.evaluateAll(), [formulaEngine]);
  const [copiedAICellKey, setCopiedAICellKey] = useState<string | null>(null);

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

  // Selection Mode & Bulk Actions state
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [lastSelectedRowIndex, setLastSelectedRowIndex] = useState<number | null>(null);
  const [bulkActionModal, setBulkActionModal] = useState<
    'update_column' | 'move_sheet' | 'confirm_delete' | null
  >(null);
  const [bulkTargetColKey, setBulkTargetColKey] = useState<string>('');
  const [bulkNewValue, setBulkNewValue] = useState<string>('');
  const [bulkTargetSheetId, setBulkTargetSheetId] = useState<string>('');
  const [bulkNewSheetName, setBulkNewSheetName] = useState<string>('');
  const [bulkIncludeUnmatchedCols, setBulkIncludeUnmatchedCols] = useState<boolean>(false);

  // Reset row selection cleanly when active sheet changes
  useEffect(() => {
    setSelectedRowIds([]);
    setLastSelectedRowIndex(null);
    setBulkActionModal(null);
    setIsSelectionMode(false);
  }, [sheet.id]);

  // Prune selectedRowIds if rows are deleted or undone
  useEffect(() => {
    const validIds = new Set(sheet.data.map((r) => r._id));
    setSelectedRowIds((prev) => {
      const filtered = prev.filter((id) => validIds.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [sheet.data]);

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
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const blurSaveTimerRef = useRef<number | null>(null);
  const editingCellRef = useRef<{ rowId: string; colKey: string } | null>(null);
  const selectAllOnEditRef = useRef<boolean>(true);

  useEffect(() => {
    editingCellRef.current = editingCell;
  }, [editingCell]);

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
      if (selectAllOnEditRef.current) {
        editInputRef.current.select();
      } else {
        const len = editInputRef.current.value.length;
        editInputRef.current.setSelectionRange(len, len);
      }
    }
  }, [editingCell]);

  const moveCellSelection = (
    deltaRow: number,
    deltaCol: number,
    wrapHorizontally = false
  ) => {
    if (rows.length === 0 || visibleColumns.length === 0) return;

    if (!selectedCell) {
      const firstRow = rows[0];
      const firstCol = visibleColumns[0];
      setSelectedCell({
        rowId: firstRow._id,
        colKey: firstCol.key,
        rowIndex: 0,
        colIndex: 0,
      });
      return;
    }

    const foundRowIdx = rows.findIndex((r) => r._id === selectedCell.rowId);
    const foundColIdx = visibleColumns.findIndex((c) => c.key === selectedCell.colKey);
    const curRow =
      foundRowIdx >= 0
        ? foundRowIdx
        : Math.max(0, Math.min(rows.length - 1, selectedCell.rowIndex));
    const curCol =
      foundColIdx >= 0
        ? foundColIdx
        : Math.max(0, Math.min(visibleColumns.length - 1, selectedCell.colIndex));

    let nextRow = curRow;
    let nextCol = curCol;

    if (wrapHorizontally) {
      nextCol = curCol + deltaCol;
      if (nextCol >= visibleColumns.length) {
        if (curRow + 1 < rows.length) {
          nextRow = curRow + 1;
          nextCol = 0;
        } else {
          nextCol = visibleColumns.length - 1;
        }
      } else if (nextCol < 0) {
        if (curRow - 1 >= 0) {
          nextRow = curRow - 1;
          nextCol = visibleColumns.length - 1;
        } else {
          nextCol = 0;
        }
      }
    } else {
      nextRow = Math.max(0, Math.min(rows.length - 1, curRow + deltaRow));
      nextCol = Math.max(0, Math.min(visibleColumns.length - 1, curCol + deltaCol));
    }

    const nextRowObj = rows[nextRow];
    const nextColObj = visibleColumns[nextCol];
    setSelectedCell({
      rowId: nextRowObj._id,
      colKey: nextColObj.key,
      rowIndex: nextRow,
      colIndex: nextCol,
    });

    requestAnimationFrame(() => {
      const cellEl = gridContainerRef.current?.querySelector(
        `td[data-cell-key="${nextRowObj._id}:${nextColObj.key}"]`
      ) as HTMLElement | null;
      cellEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };

  const handleStartEdit = (row: RowData, col: ColumnDef, initialTypedChar?: string) => {
    if (blurSaveTimerRef.current !== null) {
      window.clearTimeout(blurSaveTimerRef.current);
      blurSaveTimerRef.current = null;
    }

    const targetEdit = { rowId: row._id, colKey: col.key };
    editingCellRef.current = targetEdit;
    setEditingCell(targetEdit);

    if (initialTypedChar !== undefined) {
      selectAllOnEditRef.current = false;
      setEditValue(initialTypedChar);
      if (initialTypedChar === '=') {
        setTimeout(() => {
          if (editInputRef.current) {
            updateCellAutocomplete(initialTypedChar, editInputRef.current);
          }
        }, 30);
      } else {
        clearAutocomplete();
      }
      return;
    }

    selectAllOnEditRef.current = true;
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

  const handleCancelEdit = () => {
    if (blurSaveTimerRef.current !== null) {
      window.clearTimeout(blurSaveTimerRef.current);
      blurSaveTimerRef.current = null;
    }
    editingCellRef.current = null;
    setEditingCell(null);
    clearAutocomplete();
    requestAnimationFrame(() => {
      gridContainerRef.current?.focus({ preventScroll: true });
    });
  };

  const handleSaveEdit = (
    moveAfterSave?: 'nextCell' | 'prevCell' | 'nextRow' | 'prevRow'
  ) => {
    if (blurSaveTimerRef.current !== null) {
      window.clearTimeout(blurSaveTimerRef.current);
      blurSaveTimerRef.current = null;
    }
    const activeEdit = editingCellRef.current || editingCell;
    if (!activeEdit) return;

    clearAutocomplete();
    const col = sheet.columns.find((c) => c.key === activeEdit.colKey);
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

    onUpdateCell(activeEdit.rowId, activeEdit.colKey, finalVal);
    editingCellRef.current = null;
    setEditingCell(null);

    if (moveAfterSave === 'nextCell') {
      moveCellSelection(0, 1, true);
    } else if (moveAfterSave === 'prevCell') {
      moveCellSelection(0, -1, true);
    } else if (moveAfterSave === 'nextRow') {
      moveCellSelection(1, 0, false);
    } else if (moveAfterSave === 'prevRow') {
      moveCellSelection(-1, 0, false);
    }

    if (moveAfterSave) {
      requestAnimationFrame(() => {
        gridContainerRef.current?.focus({ preventScroll: true });
      });
    }
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

    if (isAIFormula(formulaStr)) {
      return { value: 'Enter untuk analisis AI', isError: false, isAIHint: true };
    }

    try {
      const targetRowId = selectedCell?.rowId || rows[0]?._id;
      const targetColKey = selectedCell?.colKey || visibleColumns[0]?.key;
      if (!targetRowId || !targetColKey) return null;

      const result = formulaEngine.evaluateFormulaString(formulaStr, targetRowId, targetColKey);
      if (result === undefined || result === null) return null;

      if (typeof result === 'string' && result.startsWith('#')) {
        return { value: result, isError: true, isAIHint: false };
      }

      const targetCol = sheet.columns.find((c) => c.key === targetColKey);
      const formatted = formatCellValue(result, targetCol?.type || 'number', targetCol?.currencyCode);
      return { value: formatted, raw: result, isError: false, isAIHint: false };
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
      moveCellSelection(e.shiftKey ? -1 : 1, 0, false);
      requestAnimationFrame(() => gridContainerRef.current?.focus({ preventScroll: true }));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleCommitFormulaBar();
      moveCellSelection(0, e.shiftKey ? -1 : 1, true);
      requestAnimationFrame(() => gridContainerRef.current?.focus({ preventScroll: true }));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelFormulaBar();
      requestAnimationFrame(() => gridContainerRef.current?.focus({ preventScroll: true }));
    }
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
      e.preventDefault();
      handleSaveEdit(e.shiftKey ? 'prevRow' : 'nextRow');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleSaveEdit(e.shiftKey ? 'prevCell' : 'nextCell');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  // Global spreadsheet keyboard navigation listener (Tab, Enter, Arrows, F2, Esc)
  useEffect(() => {
    const handleGridNavigationKeyDown = (e: KeyboardEvent) => {
      if (showFormulaHelp || showValidationModal || bulkActionModal !== null) return;
      if (editingCellRef.current) return;

      const activeEl = document.activeElement as HTMLElement | null;
      const isFormInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable);
      if (isFormInput) return;

      const isGridFocused =
        activeEl === gridContainerRef.current ||
        (activeEl !== null &&
          gridContainerRef.current?.contains(activeEl) &&
          activeEl.tagName !== 'BUTTON' &&
          activeEl.tagName !== 'A');
      const isBodyWithActiveCell =
        (!activeEl || activeEl === document.body) && selectedCell !== null;

      if (!isGridFocused && !isBodyWithActiveCell) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        moveCellSelection(0, e.shiftKey ? -1 : 1, true);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        moveCellSelection(e.shiftKey ? -1 : 1, 0, false);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveCellSelection(-1, 0, false);
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveCellSelection(1, 0, false);
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        moveCellSelection(0, -1, false);
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        moveCellSelection(0, 1, false);
        return;
      }

      if (e.key === 'F2') {
        e.preventDefault();
        if (rows.length === 0 || visibleColumns.length === 0) return;
        const targetRow =
          rows.find((r) => r._id === selectedCell?.rowId) || rows[0];
        const targetCol =
          visibleColumns.find((c) => c.key === selectedCell?.colKey) ||
          visibleColumns[0];
        if (targetRow && targetCol && targetCol.type !== 'relation') {
          handleStartEdit(targetRow, targetCol);
        }
        return;
      }

      if (e.key === 'Escape') {
        if (relationalPreview) {
          e.preventDefault();
          setRelationalPreview(null);
          return;
        }
        if (editingCellRef.current) {
          e.preventDefault();
          handleCancelEdit();
          return;
        }
        if (isSelectionMode) {
          e.preventDefault();
          exitSelectionMode();
          return;
        }
        clearAutocomplete();
        return;
      }

      // Direct typing into a selected cell starts edit mode
      if (
        isGridFocused &&
        selectedCell &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.key.length === 1 &&
        e.key !== ' '
      ) {
        const targetRow = rows.find((r) => r._id === selectedCell.rowId);
        const targetCol = visibleColumns.find((c) => c.key === selectedCell.colKey);
        if (targetRow && targetCol && targetCol.type !== 'relation') {
          e.preventDefault();
          handleStartEdit(targetRow, targetCol, e.key);
        }
      }
    };

    window.addEventListener('keydown', handleGridNavigationKeyDown);
    return () => window.removeEventListener('keydown', handleGridNavigationKeyDown);
  });

  useEffect(() => {
    return () => {
      if (blurSaveTimerRef.current !== null) {
        window.clearTimeout(blurSaveTimerRef.current);
      }
    };
  }, []);

  const toggleSelectionMode = () => {
    if (isSelectionMode) {
      setIsSelectionMode(false);
      setSelectedRowIds([]);
      setLastSelectedRowIndex(null);
      setBulkActionModal(null);
    } else {
      setIsSelectionMode(true);
    }
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedRowIds([]);
    setLastSelectedRowIndex(null);
    setBulkActionModal(null);
  };

  const toggleSelectAll = () => {
    if (rows.length === 0) return;
    if (selectedRowIds.length === rows.length) {
      setSelectedRowIds([]);
      setLastSelectedRowIndex(null);
    } else {
      setSelectedRowIds(rows.map((r) => r._id));
      setIsSelectionMode(true);
      setLastSelectedRowIndex(null);
    }
  };

  const toggleSelectRow = (id: string, rowIndex: number, shiftKey = false) => {
    setIsSelectionMode(true);

    if (shiftKey && lastSelectedRowIndex !== null && lastSelectedRowIndex !== rowIndex) {
      const start = Math.min(lastSelectedRowIndex, rowIndex);
      const end = Math.max(lastSelectedRowIndex, rowIndex);
      const rangeIds = rows.slice(start, end + 1).map((r) => r._id);
      setSelectedRowIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
      setLastSelectedRowIndex(rowIndex);
      return;
    }

    setSelectedRowIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
    setLastSelectedRowIndex(rowIndex);
  };

  const openBulkUpdateModal = () => {
    if (selectedRowIds.length === 0) return;
    const defaultCol =
      visibleColumns.find((c) => !c.isPrimaryKey) ||
      visibleColumns[0] ||
      sheet.columns[0];
    if (defaultCol) {
      setBulkTargetColKey(defaultCol.key);
      if (defaultCol.type === 'boolean') {
        setBulkNewValue('true');
      } else {
        setBulkNewValue('');
      }
    }
    setBulkActionModal('update_column');
  };

  const openBulkMoveModal = () => {
    if (selectedRowIds.length === 0) return;
    const otherSheets = allSheets.filter((s) => s.id !== sheet.id);
    setBulkTargetSheetId(otherSheets[0]?.id || '__NEW__');
    setBulkNewSheetName(`${sheet.name} (Pindahan)`);
    setBulkIncludeUnmatchedCols(false);
    setBulkActionModal('move_sheet');
  };

  const handleApplyBulkUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onBulkUpdateColumn || selectedRowIds.length === 0 || !bulkTargetColKey) return;

    const targetCol = sheet.columns.find((c) => c.key === bulkTargetColKey);
    let parsedVal: any = bulkNewValue;

    if (typeof bulkNewValue === 'string' && bulkNewValue.trim().startsWith('=')) {
      parsedVal = bulkNewValue.trim();
    } else if (targetCol) {
      if (
        targetCol.type === 'number' ||
        targetCol.type === 'currency' ||
        targetCol.type === 'percentage' ||
        targetCol.type === 'rating'
      ) {
        const num = Number(bulkNewValue.replace(/[^\d.-]/g, ''));
        parsedVal = isNaN(num) || bulkNewValue.trim() === '' ? 0 : num;
      } else if (targetCol.type === 'boolean') {
        parsedVal =
          bulkNewValue === 'true' || bulkNewValue === 'Ya' || bulkNewValue === '1';
      }
    }

    onBulkUpdateColumn(selectedRowIds, bulkTargetColKey, parsedVal);
    setBulkActionModal(null);
  };

  const handleApplyBulkMove = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onMoveRowsToSheet || selectedRowIds.length === 0 || !bulkTargetSheetId) return;

    onMoveRowsToSheet(selectedRowIds, bulkTargetSheetId, {
      newSheetName: bulkNewSheetName,
      includeUnmatchedColumns: bulkIncludeUnmatchedCols,
    });
    exitSelectionMode();
  };

  const handleConfirmBulkDelete = () => {
    if (selectedRowIds.length === 0) return;
    onDeleteRows(selectedRowIds);
    exitSelectionMode();
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
              placeholder="Ketik nilai atau rumus Excel (contoh: =SUM(A1:A5), =AI(&quot;Analisis&quot;, B2:F2), =[Qty]*[Price])..."
              className="w-full bg-white border border-slate-300 rounded-lg pl-3 pr-44 py-1.5 text-xs text-slate-900 font-mono outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all shadow-2xs placeholder:text-slate-400"
            />

            {/* Live Calculation Preview Badge */}
            {liveFormulaPreview && (
              <div
                className={`absolute right-2 px-2 py-0.5 rounded text-[11px] font-mono font-bold flex items-center gap-1 border shadow-2xs animate-in fade-in duration-150 ${
                  liveFormulaPreview.isError
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : liveFormulaPreview.isAIHint
                    ? 'bg-blue-50 text-blue-700 border-blue-200 font-sans font-semibold'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
                title={`Kalkulasi instan: ${liveFormulaPreview.value}`}
              >
                {!liveFormulaPreview.isAIHint && (
                  <span className="text-[10px] opacity-75 font-sans font-semibold">Hasil:</span>
                )}
                <span>{liveFormulaPreview.value}</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Secondary Row: Action & Guide buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleSelectionMode}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold border rounded-md transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0 ${
                isSelectionMode || selectedRowIds.length > 0
                  ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                  : 'text-slate-700 bg-white border-slate-200 hover:bg-slate-50'
              }`}
              title="Aktifkan mode seleksi untuk memilih beberapa baris dan menjalankan aksi massal"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Mode Seleksi</span>
              {selectedRowIds.length > 0 && (
                <span className="font-mono tabular-nums text-[10px] bg-white/20 px-1.5 rounded">
                  {selectedRowIds.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowFormulaHelp(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white hover:bg-blue-50/60 hover:text-blue-700 border border-slate-200 hover:border-blue-200 rounded-md transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
              title="Lihat panduan sintaks rumus spreadsheet"
            >
              <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
              <span>Panduan Rumus</span>
            </button>

            <button
              type="button"
              onClick={() => openValidationModal()}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium border rounded-md transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0 ${
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
          </div>
        </div>
      </div>

      {/* Contextual Bulk Selection Action Bar */}
      {(isSelectionMode || selectedRowIds.length > 0) && (
        <div className="bg-blue-50/70 border-b border-blue-200/90 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-slate-900 font-semibold">
              <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="tabular-nums">
                {selectedRowIds.length > 0
                  ? `${selectedRowIds.length} dari ${rows.length} baris terpilih`
                  : 'Mode Seleksi Aktif'}
              </span>
            </div>

            <span className="text-slate-300" aria-hidden="true">|</span>

            {selectedRowIds.length === 0 ? (
              <span className="text-[11px] text-slate-600">
                Centang baris yang diinginkan atau tahan <kbd className="px-1 py-0.5 bg-white border border-slate-300 rounded font-mono text-[10px]">Shift</kbd> untuk memilih rentang baris.
              </span>
            ) : null}

            <div className="flex items-center gap-2">
              {selectedRowIds.length < rows.length && rows.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedRowIds(rows.map((r) => r._id))}
                  className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer whitespace-nowrap"
                >
                  Pilih Semua ({rows.length})
                </button>
              )}
              {selectedRowIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRowIds([]);
                    setLastSelectedRowIndex(null);
                  }}
                  className="text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:underline cursor-pointer whitespace-nowrap"
                >
                  Bersihkan Pilihan
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedRowIds.length === 0 || !onBulkUpdateColumn}
              onClick={openBulkUpdateModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-md text-[11px] font-semibold transition-colors shadow-2xs disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0"
              title="Ubah nilai kolom pada seluruh baris yang dipilih sekaligus"
            >
              <Edit3 className="w-3.5 h-3.5 text-blue-600" />
              <span>Ubah Nilai Kolom</span>
            </button>

            <button
              type="button"
              disabled={selectedRowIds.length === 0 || !onMoveRowsToSheet}
              onClick={openBulkMoveModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-md text-[11px] font-semibold transition-colors shadow-2xs disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0"
              title="Pindahkan baris terpilih ke sheet lain atau buat sheet baru"
            >
              <FolderInput className="w-3.5 h-3.5 text-emerald-600" />
              <span>Pindahkan ke Sheet</span>
            </button>

            <button
              type="button"
              disabled={selectedRowIds.length === 0}
              onClick={() => setBulkActionModal('confirm_delete')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-md text-[11px] font-semibold transition-colors shadow-2xs disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0"
              title="Hapus seluruh baris yang dipilih"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Hapus ({selectedRowIds.length})</span>
            </button>

            <button
              type="button"
              onClick={exitSelectionMode}
              className="flex items-center gap-1 px-2.5 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-blue-100/60 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Keluar dari Mode Seleksi"
            >
              <X className="w-3.5 h-3.5" />
              <span>Selesai</span>
            </button>
          </div>
        </div>
      )}

      {/* Contextual Full-Text AI Cell Analysis Reader (only shown when selected cell uses =AI()) */}
      {selectedCell && (() => {
        const rawSelected = formulaEngine.getRawCellValue(selectedCell.rowId, selectedCell.colKey);
        if (!isAIFormula(rawSelected)) return null;
        const aiMeta = formulaEngine.getAICellMeta(selectedCell.rowId, selectedCell.colKey);
        if (!aiMeta) return null;
        const cellCoord = `${columnIndexToLetter(selectedCell.colIndex)}${selectedCell.rowIndex + 1}`;
        const cellKey = `${selectedCell.rowId}:${selectedCell.colKey}`;

        return (
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-start justify-between gap-3 text-xs animate-in fade-in duration-150">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <div className="mt-0.5 p-1 rounded bg-blue-50 border border-blue-200/80 text-blue-700 shrink-0">
                {aiMeta.status === 'loading' || aiMeta.status === 'pending' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSearch className="w-3.5 h-3.5" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-800">
                    Hasil Analisis Sel{' '}
                    <span className="font-mono text-blue-800">{cellCoord}</span>
                  </span>
                  {aiMeta.request.prompt && (
                    <span className="text-[11px] text-slate-500 truncate max-w-md">
                      Instruksi: &ldquo;{aiMeta.request.prompt}&rdquo;
                    </span>
                  )}
                </div>
                {aiMeta.status === 'loading' || aiMeta.status === 'pending' ? (
                  <p className="text-slate-500 italic text-xs">
                    Sedang menganalisis data sel dengan Gemini...
                  </p>
                ) : aiMeta.status === 'error' ? (
                  <p className="text-rose-700 font-medium text-xs whitespace-pre-wrap">
                    Gagal menganalisis sel: {aiMeta.error || 'Terjadi kesalahan API.'}
                  </p>
                ) : (
                  <p className="text-slate-800 text-xs leading-relaxed whitespace-pre-wrap">
                    {aiMeta.result}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {aiMeta.status === 'success' && aiMeta.result && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(aiMeta.result || '');
                    setCopiedAICellKey(cellKey);
                    setTimeout(() => setCopiedAICellKey(null), 1800);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap"
                  title="Salin hasil analisis ke clipboard"
                >
                  {copiedAICellKey === cellKey ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-700">Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Salin</span>
                    </>
                  )}
                </button>
              )}

              {onRefreshAICell && (
                <button
                  type="button"
                  disabled={aiMeta.status === 'loading'}
                  onClick={() => onRefreshAICell(aiMeta.cacheKey)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 rounded-md text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  title="Jalankan ulang analisis Gemini untuk sel ini"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${aiMeta.status === 'loading' ? 'animate-spin' : ''}`}
                  />
                  <span>Perbarui</span>
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Main Grid Viewport */}
      <div
        ref={gridContainerRef}
        tabIndex={0}
        className="flex-1 overflow-x-auto overflow-y-auto bg-slate-100/50 outline-hidden"
      >
        <table
          style={{ minWidth: `${Math.max(1200, visibleColumns.reduce((sum, c) => sum + (c.width || 150), 60))}px` }}
          className="border-collapse table-fixed w-full text-xs text-left bg-white"
        >
          {/* Header Row */}
          <thead className="sticky top-0 z-20 bg-slate-100 border-b border-slate-300 shadow-2xs select-none">
            <tr>
              {/* Row Selector Column */}
              <th
                className={`w-14 px-2 py-2 text-center border-r border-slate-200 font-mono text-[11px] sticky left-0 z-30 shadow-xs transition-colors ${
                  isSelectionMode ? 'bg-blue-50 text-blue-800' : 'bg-slate-100 text-slate-500'
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selectedRowIds.length === rows.length}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate =
                          selectedRowIds.length > 0 && selectedRowIds.length < rows.length;
                      }
                    }}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 accent-blue-600 cursor-pointer"
                    title="Pilih atau batalkan semua baris yang tampil"
                    aria-label="Pilih semua baris"
                  />
                </div>
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
                      isRowSelected ? 'bg-blue-50/60' : rIdx % 2 === 1 ? 'bg-slate-50/25' : 'bg-white'
                    }`}
                  >
                    {/* Row Number & Checkbox */}
                    <td
                      onClick={(e) => {
                        if ((e.target as HTMLElement).tagName !== 'INPUT') {
                          toggleSelectRow(row._id, rIdx, e.shiftKey);
                        }
                      }}
                      className={`px-2 py-1.5 text-center border-r border-slate-200 font-mono text-[11px] select-none sticky left-0 z-10 shadow-xs cursor-pointer transition-colors ${
                        isRowSelected
                          ? 'bg-blue-100/90 text-blue-900 font-semibold'
                          : isSelectionMode
                          ? 'bg-blue-50/60 text-slate-700'
                          : 'bg-slate-50/95 text-slate-500'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={isRowSelected}
                          onChange={() => {}}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectRow(row._id, rIdx, e.shiftKey);
                          }}
                          className="rounded border-slate-300 accent-blue-600 cursor-pointer"
                          aria-label={`Pilih baris ${rIdx + 1}`}
                        />
                        <span className="w-4 text-right tabular-nums">{rIdx + 1}</span>
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
                          data-cell-key={`${row._id}:${col.key}`}
                          onClick={() => {
                            setSelectedCell({
                              rowId: row._id,
                              colKey: col.key,
                              rowIndex: rIdx,
                              colIndex: cIdx,
                            });
                            gridContainerRef.current?.focus({ preventScroll: true });
                          }}
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
                                  if (blurSaveTimerRef.current !== null) {
                                    window.clearTimeout(blurSaveTimerRef.current);
                                  }
                                  blurSaveTimerRef.current = window.setTimeout(() => {
                                    blurSaveTimerRef.current = null;
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
                              const aiMeta = isAIFormula(rawVal)
                                ? formulaEngine.getAICellMeta(row._id, col.key)
                                : undefined;
                              const isError = typeof evalVal === 'string' && evalVal.startsWith('#');

                              if (aiMeta && (aiMeta.status === 'loading' || aiMeta.status === 'pending')) {
                                return (
                                  <div
                                    className="flex items-center justify-between gap-1.5 text-slate-500 relative z-10"
                                    title={`Rumus AI: ${rawVal}\nStatus: Sedang menganalisis sel...`}
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0 truncate">
                                      <Loader2 className="w-3 h-3 animate-spin text-blue-600 shrink-0" />
                                      <span className="truncate italic font-sans text-[11px]">
                                        Menganalisis...
                                      </span>
                                    </div>
                                    <span className="text-[9px] font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-1 rounded shrink-0">
                                      AI
                                    </span>
                                  </div>
                                );
                              }

                              if (isError) {
                                return (
                                  <span
                                    className="inline-flex items-center gap-1 text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded text-[11px] font-mono font-bold"
                                    title={`Rumus: ${rawVal}\nError: ${aiMeta?.error || evalVal}`}
                                  >
                                    <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                                    <span>{evalVal}</span>
                                  </span>
                                );
                              }

                              if (aiMeta) {
                                return (
                                  <div
                                    className="flex items-center justify-between gap-1.5 group/fcell relative z-10"
                                    title={`${String(evalVal)}\n\nRumus: ${rawVal}`}
                                  >
                                    <span className="truncate font-sans font-medium text-slate-900">
                                      {String(evalVal ?? '')}
                                    </span>
                                    <span
                                      className="text-[9px] text-blue-700 bg-blue-50 border border-blue-200/80 font-mono select-none font-bold px-1 rounded shrink-0"
                                      title={`Analisis AI: ${rawVal}`}
                                    >
                                      AI
                                    </span>
                                  </div>
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

      {/* Grid Bottom Bar: Add Row & Stats */}
      <div className="bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center gap-3">
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

        <div className="text-[11px] text-slate-400">
          Tip: Segitiga merah di pojok kanan atas sel menandakan data tidak memenuhi aturan validasi kolom
        </div>
      </div>

      {/* Bulk Update Column Modal */}
      {bulkActionModal === 'update_column' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Ubah Nilai Kolom Massal
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                    Menerapkan pembaruan ke {selectedRowIds.length} baris terpilih pada {sheet.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBulkActionModal(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleApplyBulkUpdate} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Pilih Kolom Target
                </label>
                <select
                  value={bulkTargetColKey}
                  onChange={(e) => {
                    const nextKey = e.target.value;
                    setBulkTargetColKey(nextKey);
                    const nextCol = sheet.columns.find((c) => c.key === nextKey);
                    setBulkNewValue(nextCol?.type === 'boolean' ? 'true' : '');
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-hidden"
                >
                  {sheet.columns.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              </div>

              {(() => {
                const targetCol = sheet.columns.find((c) => c.key === bulkTargetColKey);
                if (!targetCol) return null;

                // Gather existing unique values for category quick-select
                const existingOptions =
                  targetCol.type === 'category'
                    ? Array.from(
                        new Set([
                          ...(targetCol.categoryColors
                            ? Object.keys(targetCol.categoryColors)
                            : []),
                          ...sheet.data
                            .map((r) => r[targetCol.key])
                            .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
                            .map((v) => String(v)),
                        ])
                      )
                    : [];

                // Relation target records if type === 'relation'
                const relSheet =
                  targetCol.type === 'relation' && targetCol.relation
                    ? allSheets.find((s) => s.id === targetCol.relation?.targetSheetId)
                    : null;

                return (
                  <div className="space-y-2">
                    <label className="block font-semibold text-slate-700">
                      Nilai Baru untuk Kolom "{targetCol.name}"
                    </label>

                    {targetCol.type === 'boolean' ? (
                      <select
                        value={bulkNewValue}
                        onChange={(e) => setBulkNewValue(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-hidden"
                      >
                        <option value="true">Ya (true)</option>
                        <option value="false">Tidak (false)</option>
                      </select>
                    ) : relSheet && targetCol.relation ? (
                      <select
                        value={bulkNewValue}
                        onChange={(e) => setBulkNewValue(e.target.value)}
                        required
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-mono text-xs focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-hidden"
                      >
                        <option value="">-- Pilih record dari {relSheet.name} --</option>
                        {relSheet.data.map((tr) => {
                          const keyVal = tr[targetCol.relation!.targetColumnKey];
                          const dispVal = targetCol.relation?.displayColumnKey
                            ? tr[targetCol.relation.displayColumnKey]
                            : '';
                          return (
                            <option key={tr._id} value={String(keyVal)}>
                              {String(keyVal)}
                              {dispVal ? ` · ${dispVal}` : ''}
                            </option>
                          );
                        })}
                      </select>
                    ) : targetCol.type === 'date' ? (
                      <input
                        type="date"
                        value={bulkNewValue}
                        onChange={(e) => setBulkNewValue(e.target.value)}
                        required
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-mono focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-hidden"
                      />
                    ) : (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={bulkNewValue}
                          onChange={(e) => setBulkNewValue(e.target.value)}
                          placeholder={
                            targetCol.type === 'number' ||
                            targetCol.type === 'currency' ||
                            targetCol.type === 'percentage'
                              ? 'Masukkan angka atau rumus (misal: 10 atau =[Quantity]*[UnitPrice])'
                              : 'Masukkan nilai baru untuk seluruh baris terpilih...'
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-mono focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-hidden"
                          autoFocus
                        />
                        {existingOptions.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[11px] text-slate-500 block">
                              Pilih cepat nilai yang tersedia:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {existingOptions.map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => setBulkNewValue(opt)}
                                  className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                                    bulkNewValue === opt
                                      ? 'bg-blue-600 text-white border-blue-600'
                                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBulkActionModal(null)}
                  className="px-3.5 py-2 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 transition-colors shadow-xs cursor-pointer tabular-nums"
                >
                  Terapkan ke {selectedRowIds.length} Baris
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Move Selected Rows to Sheet Modal */}
      {bulkActionModal === 'move_sheet' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <FolderInput className="w-4 h-4 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Pindahkan Baris ke Sheet Lain
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                    Memindahkan {selectedRowIds.length} baris dari "{sheet.name}"
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBulkActionModal(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleApplyBulkMove} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Pilih Sheet Tujuan
                </label>
                <select
                  value={bulkTargetSheetId}
                  onChange={(e) => setBulkTargetSheetId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-hidden"
                >
                  {allSheets
                    .filter((s) => s.id !== sheet.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.data.length} baris · {s.columns.length} kolom)
                      </option>
                    ))}
                  <option value="__NEW__">+ Buat Sheet Baru untuk Baris Ini</option>
                </select>
              </div>

              {bulkTargetSheetId === '__NEW__' ? (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Nama Sheet Baru
                  </label>
                  <input
                    type="text"
                    value={bulkNewSheetName}
                    onChange={(e) => setBulkNewSheetName(e.target.value)}
                    placeholder="Contoh: Arsip Pesanan Prioritas"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-hidden"
                  />
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Sheet baru akan dibuat dengan struktur kolom yang sama persis dengan "{sheet.name}".
                  </p>
                </div>
              ) : (
                (() => {
                  const targetSheet = allSheets.find((s) => s.id === bulkTargetSheetId);
                  if (!targetSheet) return null;

                  const matchedCount = targetSheet.columns.filter((tc) =>
                    sheet.columns.some(
                      (sc) =>
                        sc.key === tc.key ||
                        sc.name.trim().toLowerCase() === tc.name.trim().toLowerCase()
                    )
                  ).length;

                  const unmatchedSourceCount = sheet.columns.filter(
                    (sc) =>
                      !targetSheet.columns.some(
                        (tc) =>
                          tc.key === sc.key ||
                          tc.name.trim().toLowerCase() === sc.name.trim().toLowerCase()
                      )
                  ).length;

                  return (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                      <div className="text-[11px] text-slate-700">
                        <span className="font-semibold">Ringkasan Pemetaan Kolom:</span>{' '}
                        <span className="font-mono font-bold text-slate-900 tabular-nums">
                          {matchedCount}
                        </span>{' '}
                        kolom cocok otomatis dengan "{targetSheet.name}".
                      </div>

                      {unmatchedSourceCount > 0 && (
                        <label className="flex items-start gap-2 text-[11px] text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bulkIncludeUnmatchedCols}
                            onChange={(e) => setBulkIncludeUnmatchedCols(e.target.checked)}
                            className="mt-0.5 rounded border-slate-300 accent-blue-600"
                          />
                          <span>
                            Sertakan {unmatchedSourceCount} kolom dari sheet asal yang belum ada di "{targetSheet.name}"
                          </span>
                        </label>
                      )}
                    </div>
                  );
                })()
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBulkActionModal(null)}
                  className="px-3.5 py-2 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 transition-colors shadow-xs cursor-pointer tabular-nums"
                >
                  Pindahkan {selectedRowIds.length} Baris
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Bulk Delete Modal */}
      {bulkActionModal === 'confirm_delete' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-rose-50/70">
              <div className="flex items-center gap-2 text-rose-800">
                <Trash2 className="w-4 h-4 text-rose-600" />
                <h3 className="text-sm font-bold">Konfirmasi Hapus Baris</h3>
              </div>
              <button
                type="button"
                onClick={() => setBulkActionModal(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-700 leading-relaxed">
                Anda akan menghapus{' '}
                <strong className="font-mono text-slate-900 tabular-nums">
                  {selectedRowIds.length} baris
                </strong>{' '}
                terpilih dari sheet <strong>{sheet.name}</strong>. Anda tetap dapat mengembalikan data ini melalui Undo (<kbd className="px-1 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px]">Ctrl+Z</kbd>).
              </p>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBulkActionModal(null)}
                  className="px-3.5 py-2 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBulkDelete}
                  className="px-4 py-2 bg-rose-600 text-white font-semibold rounded-lg hover:bg-rose-700 transition-colors shadow-xs cursor-pointer tabular-nums"
                >
                  Hapus {selectedRowIds.length} Baris
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
