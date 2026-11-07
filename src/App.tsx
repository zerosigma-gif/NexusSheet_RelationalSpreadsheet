import React, { useState, useMemo, useEffect } from 'react';
import { INITIAL_SHEETS } from './data/demoData';
import { Sheet, FilterRule, SortConfig, ColumnDef, ConditionalFormattingRule } from './types/spreadsheet';
import { filterRows, sortRows } from './utils/filterEngine';
import {
  parseExcelFile,
  parseCsvFile,
  exportToExcel,
  exportToCsv
} from './services/importExport';
import { Header } from './components/Header';
import { SheetTabs } from './components/SheetTabs';
import { ColumnCategoryManager } from './components/ColumnCategoryManager';
import { FilterBar } from './components/FilterBar';
import { SpreadsheetGrid } from './components/SpreadsheetGrid';
import { VisualAnalytics } from './components/VisualAnalytics';
import { RelationalExplorer } from './components/RelationalExplorer';
import { FilterStudioView } from './components/FilterStudioView';
import { ConditionalFormattingModal } from './components/ConditionalFormattingModal';
import { getDefaultConditionalRules } from './utils/conditionalFormatEngine';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { getEvaluatedSheet } from './utils/formulaEngine';

export default function App() {
  const [sheets, setSheets] = useState<Sheet[]>(INITIAL_SHEETS);
  const [activeSheetId, setActiveSheetId] = useState<string>(INITIAL_SHEETS[0].id);
  const [activeTab, setActiveTab] = useState<'spreadsheet' | 'charts' | 'relations' | 'filters'>('spreadsheet');

  // Undo & Redo History Stacks
  const [undoStack, setUndoStack] = useState<Sheet[][]>([]);
  const [redoStack, setRedoStack] = useState<Sheet[][]>([]);

  // Column category filtering per active sheet
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Global search query
  const [globalQuery, setGlobalQuery] = useState<string>('');

  // Sheet-specific filters and sorting
  const [filtersBySheet, setFiltersBySheet] = useState<Record<string, FilterRule[]>>({});
  const [sortConfigBySheet, setSortConfigBySheet] = useState<Record<string, SortConfig | null>>({});

  // Conditional formatting rules per sheet
  const [conditionalRulesBySheet, setConditionalRulesBySheet] = useState<Record<string, ConditionalFormattingRule[]>>({
    'sheet-orders': getDefaultConditionalRules('sheet-orders'),
  });
  const [showConditionalModal, setShowConditionalModal] = useState<boolean>(false);

  // Notification toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // History Helper: push snapshot before modifying state
  const saveStateForUndo = () => {
    setUndoStack((prev) => [...prev.slice(-35), JSON.parse(JSON.stringify(sheets))]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev.slice(-35), JSON.parse(JSON.stringify(sheets))]);
    setSheets(previous);
    if (!previous.some((s) => s.id === activeSheetId) && previous.length > 0) {
      setActiveSheetId(previous[0].id);
    }
    showToast('Perubahan berhasil diurungkan (Undo ↶)', 'success');
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev.slice(-35), JSON.parse(JSON.stringify(sheets))]);
    setSheets(next);
    if (!next.some((s) => s.id === activeSheetId) && next.length > 0) {
      setActiveSheetId(next[0].id);
    }
    showToast('Perubahan berhasil diulangi (Redo ↷)', 'success');
  };

  // Global Keyboard Shortcuts for Undo & Redo (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA';

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          if (!isInput) {
            e.preventDefault();
            handleUndo();
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        if (!isInput) {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [undoStack, redoStack, sheets, activeSheetId]);

  const activeSheet = useMemo(
    () => sheets.find((s) => s.id === activeSheetId) || sheets[0],
    [sheets, activeSheetId]
  );

  const currentFilters = useMemo(
    () => filtersBySheet[activeSheet?.id] || [],
    [filtersBySheet, activeSheet?.id]
  );

  const currentSortConfig = useMemo(
    () => sortConfigBySheet[activeSheet?.id] || null,
    [sortConfigBySheet, activeSheet?.id]
  );

  const currentConditionalRules = useMemo(
    () => conditionalRulesBySheet[activeSheet?.id] || [],
    [conditionalRulesBySheet, activeSheet?.id]
  );
  // Filter and sort active sheet data
  const processedRows = useMemo(() => {
    if (!activeSheet) return [];
    // Evaluate formulas into computed values for filtering, sorting, and charts
    const evaluatedSheet = getEvaluatedSheet(activeSheet);
    const filtered = filterRows(
      evaluatedSheet.data,
      currentFilters,
      evaluatedSheet.columns,
      globalQuery
    );
    return sortRows(filtered, currentSortConfig);
  }, [activeSheet, currentFilters, globalQuery, currentSortConfig]);

  // Import Handler
  const handleImportFile = async (file: File) => {
    try {
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const importedSheets = await parseExcelFile(file);
        if (importedSheets.length === 0) {
          showToast('Tidak ada data yang dapat dibaca dalam file Excel.', 'error');
          return;
        }
        saveStateForUndo();
        setSheets((prev) => [...importedSheets, ...prev]);
        setActiveSheetId(importedSheets[0].id);
        setSelectedCategory('ALL');
        showToast(
          `Berhasil mengimpor file Excel "${file.name}" dengan ${importedSheets.length} sheet!`,
          'success'
        );
      } else if (fileName.endsWith('.csv')) {
        const importedSheet = await parseCsvFile(file);
        saveStateForUndo();
        setSheets((prev) => [importedSheet, ...prev]);
        setActiveSheetId(importedSheet.id);
        setSelectedCategory('ALL');
        showToast(
          `Berhasil mengimpor file CSV "${file.name}" dengan ${importedSheet.data.length} baris data!`,
          'success'
        );
      } else {
        showToast('Format file tidak didukung. Harap upload .xlsx, .xls, atau .csv', 'error');
      }
    } catch (err: any) {
      showToast(`Gagal membaca file: ${err.message || 'Format tidak valid'}`, 'error');
    }
  };

  // Export Handlers
  const handleExportExcel = (isWorkbook: boolean) => {
    try {
      if (isWorkbook) {
        exportToExcel(sheets);
        showToast('Workbook Excel (.xlsx) semua sheet berhasil diunduh.', 'success');
      } else {
        exportToExcel(sheets, activeSheet.id, true, processedRows);
        showToast(`Sheet "${activeSheet.name}" terfilter berhasil diekspor ke Excel (.xlsx).`, 'success');
      }
    } catch (err: any) {
      showToast(`Gagal ekspor Excel: ${err.message}`, 'error');
    }
  };

  const handleExportCsv = () => {
    try {
      exportToCsv(activeSheet, processedRows);
      showToast(`Sheet "${activeSheet.name}" berhasil diekspor ke format CSV.`, 'success');
    } catch (err: any) {
      showToast(`Gagal ekspor CSV: ${err.message}`, 'error');
    }
  };

  const handleResetDemo = () => {
    saveStateForUndo();
    setSheets(INITIAL_SHEETS);
    setActiveSheetId(INITIAL_SHEETS[0].id);
    setFiltersBySheet({});
    setSortConfigBySheet({});
    setGlobalQuery('');
    setSelectedCategory('ALL');
    setConditionalRulesBySheet({
      'sheet-orders': getDefaultConditionalRules('sheet-orders'),
    });
    showToast('Dataset contoh relational telah direset ke setelan awal.', 'success');
  };

  // Sheet Operations
  const handleAddSheet = () => {
    saveStateForUndo();
    const newId = `sheet-${Date.now()}`;
    const newSheet: Sheet = {
      id: newId,
      name: `Sheet ${sheets.length + 1}`,
      description: 'Lembar kerja baru',
      primaryKey: 'ID',
      columns: [
        {
          key: 'ID',
          name: 'ID Baris',
          type: 'text',
          category: 'Identifikasi',
          summary: 'count',
          width: 120,
          visible: true,
          isPrimaryKey: true,
        },
        {
          key: 'Nama',
          name: 'Nama Entitas',
          type: 'text',
          category: 'General Data',
          summary: 'none',
          width: 180,
          visible: true,
        },
        {
          key: 'Nilai',
          name: 'Nilai Nominal',
          type: 'currency',
          category: 'Finansial & Volume',
          summary: 'sum',
          width: 150,
          currencyCode: 'IDR',
          visible: true,
        },
      ],
      data: [
        { _id: `row-${Date.now()}-1`, ID: 'REC-001', Nama: 'Item Sampel A', Nilai: 5000000 },
        { _id: `row-${Date.now()}-2`, ID: 'REC-002', Nama: 'Item Sampel B', Nilai: 8500000 },
      ],
    };

    setSheets((prev) => [...prev, newSheet]);
    setActiveSheetId(newId);
    showToast(`Sheet baru "${newSheet.name}" berhasil ditambahkan.`, 'success');
  };

  const handleRenameSheet = (id: string, newName: string) => {
    saveStateForUndo();
    setSheets((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name: newName } : s))
    );
  };

  const handleDuplicateSheet = (id: string) => {
    const target = sheets.find((s) => s.id === id);
    if (!target) return;

    saveStateForUndo();
    const dupId = `sheet-${Date.now()}`;
    const dupSheet: Sheet = {
      ...target,
      id: dupId,
      name: `${target.name} (Copy)`,
      data: target.data.map((r, i) => ({ ...r, _id: `dup-${dupId}-${i}` })),
    };

    setSheets((prev) => [...prev, dupSheet]);
    setActiveSheetId(dupId);
    showToast(`Sheet "${target.name}" berhasil diduplikasi.`, 'success');
  };

  const handleDeleteSheet = (id: string) => {
    saveStateForUndo();
    const targetSheet = sheets.find((s) => s.id === id);
    const remaining = sheets.filter((s) => s.id !== id);

    if (remaining.length === 0) {
      // Force closed the last sheet: gracefully initialize a clean empty sheet!
      const newEmptySheet: Sheet = {
        id: `sheet-${Date.now()}`,
        name: 'Sheet 1',
        description: 'Lembar kerja bersih baru',
        primaryKey: 'ID',
        columns: [
          {
            key: 'ID',
            name: 'ID Baris',
            type: 'text',
            category: 'Identifikasi',
            summary: 'count',
            width: 120,
            visible: true,
            isPrimaryKey: true,
          },
          {
            key: 'Nama',
            name: 'Nama Entitas',
            type: 'text',
            category: 'General Data',
            summary: 'none',
            width: 180,
            visible: true,
          },
          {
            key: 'Kategori',
            name: 'Kategori',
            type: 'category',
            category: 'General Data',
            summary: 'unique',
            width: 140,
            visible: true,
          },
          {
            key: 'Jumlah',
            name: 'Jumlah',
            type: 'number',
            category: 'Finansial & Volume',
            summary: 'sum',
            width: 130,
            visible: true,
          },
          {
            key: 'Harga',
            name: 'Harga',
            type: 'currency',
            category: 'Finansial & Volume',
            summary: 'sum',
            width: 160,
            currencyCode: 'IDR',
            visible: true,
          },
        ],
        data: [],
      };
      setSheets([newEmptySheet]);
      setActiveSheetId(newEmptySheet.id);
      setSelectedCategory('ALL');
      showToast(
        `Sheet "${targetSheet?.name || id}" di-force close. Sheet 1 baru dibuka.`,
        'success'
      );
      return;
    }

    setSheets(remaining);
    setActiveSheetId(remaining[0].id);
    setSelectedCategory('ALL');
    showToast(`Sheet "${targetSheet?.name || id}" berhasil ditutup.`, 'success');
  };

  const handleCloseOtherSheets = (id: string) => {
    const keepSheet = sheets.find((s) => s.id === id);
    if (!keepSheet) return;
    saveStateForUndo();
    setSheets([keepSheet]);
    setActiveSheetId(keepSheet.id);
    setSelectedCategory('ALL');
    showToast(`Semua sheet lain ditutup. Hanya "${keepSheet.name}" yang aktif.`, 'success');
  };

  const handleClearSheetData = (id: string) => {
    const target = sheets.find((s) => s.id === id);
    saveStateForUndo();
    setSheets((prev) =>
      prev.map((s) => (s.id === id ? { ...s, data: [] } : s))
    );
    showToast(`Semua data baris pada "${target?.name || 'sheet'}" telah dikosongkan.`, 'success');
  };

  // Sorting
  const handleSort = (columnKey: string) => {
    setSortConfigBySheet((prev) => {
      const current = prev[activeSheet.id];
      if (current?.columnKey === columnKey) {
        if (current.direction === 'asc') {
          return { ...prev, [activeSheet.id]: { columnKey, direction: 'desc' } };
        } else {
          return { ...prev, [activeSheet.id]: null };
        }
      } else {
        return { ...prev, [activeSheet.id]: { columnKey, direction: 'asc' } };
      }
    });
  };

  // Filtering
  const handleAddFilter = (rule: FilterRule) => {
    setFiltersBySheet((prev) => {
      const existing = prev[activeSheet.id] || [];
      return { ...prev, [activeSheet.id]: [...existing, rule] };
    });
  };

  const handleRemoveFilter = (filterId: string) => {
    setFiltersBySheet((prev) => {
      const existing = prev[activeSheet.id] || [];
      return {
        ...prev,
        [activeSheet.id]: existing.filter((f) => f.id !== filterId),
      };
    });
  };

  const handleClearAllFilters = () => {
    setFiltersBySheet((prev) => ({
      ...prev,
      [activeSheet.id]: [],
    }));
  };

  // Conditional Formatting Operations
  const handleAddConditionalRule = (rule: ConditionalFormattingRule) => {
    saveStateForUndo();
    setConditionalRulesBySheet((prev) => {
      const existing = prev[activeSheet.id] || [];
      return { ...prev, [activeSheet.id]: [...existing, rule] };
    });
    showToast(`Aturan format bersyarat "${rule.name || 'Baru'}" ditambahkan.`, 'success');
  };

  const handleUpdateConditionalRule = (rule: ConditionalFormattingRule) => {
    saveStateForUndo();
    setConditionalRulesBySheet((prev) => {
      const existing = prev[activeSheet.id] || [];
      const idx = existing.findIndex((r) => r.id === rule.id);
      if (idx >= 0) {
        const copy = [...existing];
        copy[idx] = rule;
        return { ...prev, [activeSheet.id]: copy };
      }
      return { ...prev, [activeSheet.id]: [...existing, rule] };
    });
  };

  const handleDeleteConditionalRule = (ruleId: string) => {
    saveStateForUndo();
    setConditionalRulesBySheet((prev) => {
      const existing = prev[activeSheet.id] || [];
      return { ...prev, [activeSheet.id]: existing.filter((r) => r.id !== ruleId) };
    });
    showToast('Aturan format bersyarat berhasil dihapus.', 'success');
  };

  const handleResetConditionalRules = () => {
    saveStateForUndo();
    setConditionalRulesBySheet((prev) => ({
      ...prev,
      [activeSheet.id]: getDefaultConditionalRules(activeSheet.id),
    }));
    showToast('Format bersyarat telah direset ke rekomendasi bawaan sheet.', 'success');
  };

  // Grid Cell Operations
  const handleUpdateCell = (rowId: string, columnKey: string, newValue: any) => {
    const curSheet = sheets.find((s) => s.id === activeSheet.id);
    const row = curSheet?.data.find((r) => r._id === rowId);
    if (row && row[columnKey] === newValue) {
      return;
    }
    saveStateForUndo();
    setSheets((prev) =>
      prev.map((s) => {
        if (s.id !== activeSheet.id) return s;
        return {
          ...s,
          data: s.data.map((r) =>
            r._id === rowId ? { ...r, [columnKey]: newValue } : r
          ),
        };
      })
    );
  };

  const handleAddRow = () => {
    saveStateForUndo();
    const newRowId = `row-${Date.now()}`;
    const newRowObj: Record<string, any> = { _id: newRowId };

    activeSheet.columns.forEach((col) => {
      if (col.isPrimaryKey) {
        newRowObj[col.key] = `ID-${activeSheet.data.length + 1}`;
      } else if (col.type === 'number' || col.type === 'currency' || col.type === 'percentage') {
        newRowObj[col.key] = 0;
      } else {
        newRowObj[col.key] = '';
      }
    });

    setSheets((prev) =>
      prev.map((s) =>
        s.id === activeSheet.id
          ? { ...s, data: [...s.data, newRowObj as any] }
          : s
      )
    );
  };

  const handleDeleteRows = (rowIds: string[]) => {
    saveStateForUndo();
    setSheets((prev) =>
      prev.map((s) =>
        s.id === activeSheet.id
          ? { ...s, data: s.data.filter((r) => !rowIds.includes(r._id)) }
          : s
      )
    );
    showToast(`${rowIds.length} baris data berhasil dihapus.`, 'success');
  };

  // Column Schema updates
  const handleUpdateColumn = (updatedCol: ColumnDef) => {
    saveStateForUndo();
    setSheets((prev) =>
      prev.map((s) => {
        if (s.id !== activeSheet.id) return s;
        return {
          ...s,
          columns: s.columns.map((c) =>
            c.key === updatedCol.key ? updatedCol : c
          ),
        };
      })
    );
  };

  const handleAddColumn = (newCol: ColumnDef) => {
    saveStateForUndo();
    setSheets((prev) =>
      prev.map((s) => {
        if (s.id !== activeSheet.id) return s;
        return {
          ...s,
          columns: [...s.columns, newCol],
        };
      })
    );
    showToast(`Kolom baru "${newCol.name}" berhasil ditambahkan ke sheet.`, 'success');
  };

  const handleAddRelation = (
    sourceSheetId: string,
    sourceColKey: string,
    targetSheetId: string,
    targetColKey: string
  ) => {
    setSheets((prev) =>
      prev.map((s) => {
        if (s.id !== sourceSheetId) return s;
        return {
          ...s,
          columns: s.columns.map((c) => {
            if (c.key !== sourceColKey) return c;
            return {
              ...c,
              type: 'relation',
              category: 'Relasi Entitas',
              relation: {
                targetSheetId,
                targetColumnKey: targetColKey,
              },
            };
          }),
        };
      })
    );
    showToast('Relasi baru antar sheet berhasil dikonfigurasi.', 'success');
  };

  // Convert relational join output into a brand-new master sheet tab
  const handleSaveJoinedAsNewSheet = (newSheet: Sheet) => {
    saveStateForUndo();
    setSheets((prev) => [...prev, newSheet]);
    setActiveSheetId(newSheet.id);
    setActiveTab('spreadsheet');
    setSelectedCategory('ALL');
    showToast(`Sheet "${newSheet.name}" berhasil dibuat sebagai Master Database baru!`, 'success');
  };

  // Dynamically reassign or set Primary Key for any sheet
  const handleUpdateSheetPrimaryKey = (sheetId: string, newPkKey: string) => {
    saveStateForUndo();
    setSheets((prev) =>
      prev.map((s) => {
        if (s.id !== sheetId) return s;
        return {
          ...s,
          primaryKey: newPkKey,
          columns: s.columns.map((c) => ({
            ...c,
            isPrimaryKey: c.key === newPkKey,
          })),
        };
      })
    );
    showToast(`Primary Key sheet berhasil diperbarui menjadi "${newPkKey}".`, 'success');
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white text-slate-800">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        sheets={sheets}
        activeSheet={activeSheet}
        onImportExcelOrCsv={handleImportFile}
        onExportExcel={handleExportExcel}
        onExportCsv={handleExportCsv}
        onResetDemo={handleResetDemo}
        filterCount={currentFilters.length}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      {/* Sheet Tabs Bar */}
      <SheetTabs
        sheets={sheets}
        activeSheetId={activeSheet.id}
        onSelectSheet={(id) => {
          setActiveSheetId(id);
          setSelectedCategory('ALL');
        }}
        onAddSheet={handleAddSheet}
        onRenameSheet={handleRenameSheet}
        onDuplicateSheet={handleDuplicateSheet}
        onDeleteSheet={handleDeleteSheet}
        onCloseOtherSheets={handleCloseOtherSheets}
        onClearSheetData={handleClearSheetData}
        onResetDemo={handleResetDemo}
      />

      {/* Column Category Manager Bar */}
      <ColumnCategoryManager
        sheet={activeSheet}
        allSheets={sheets}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        onUpdateColumn={handleUpdateColumn}
        onAddColumn={handleAddColumn}
      />

      {/* Responsive Filter Bar */}
      <FilterBar
        sheet={activeSheet}
        globalQuery={globalQuery}
        onSetGlobalQuery={setGlobalQuery}
        filters={currentFilters}
        onAddFilter={handleAddFilter}
        onRemoveFilter={handleRemoveFilter}
        onClearAllFilters={handleClearAllFilters}
        totalRowCount={activeSheet.data.length}
        filteredRowCount={processedRows.length}
        conditionalRules={currentConditionalRules}
        onOpenConditionalFormatting={() => setShowConditionalModal(true)}
        onToggleConditionalRule={(ruleId) => {
          const target = currentConditionalRules.find((r) => r.id === ruleId);
          if (target) {
            handleUpdateConditionalRule({ ...target, enabled: !target.enabled });
          }
        }}
        onRemoveConditionalRule={handleDeleteConditionalRule}
      />

      {/* Main View Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        {activeTab === 'spreadsheet' && (
          <SpreadsheetGrid
            sheet={activeSheet}
            allSheets={sheets}
            rows={processedRows}
            selectedCategory={selectedCategory}
            sortConfig={currentSortConfig}
            onSort={handleSort}
            onUpdateCell={handleUpdateCell}
            onAddRow={handleAddRow}
            onDeleteRows={handleDeleteRows}
            onSwitchSheet={(sheetId) => {
              setActiveSheetId(sheetId);
              setSelectedCategory('ALL');
            }}
            onUpdateColumn={handleUpdateColumn}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onUndo={handleUndo}
            onRedo={handleRedo}
            conditionalRules={currentConditionalRules}
          />
        )}

        {activeTab === 'charts' && (
          <VisualAnalytics
            sheet={activeSheet}
            filteredRows={processedRows}
            totalRowCount={activeSheet.data.length}
          />
        )}

        {activeTab === 'relations' && (
          <RelationalExplorer
            sheets={sheets}
            onAddRelation={handleAddRelation}
            onSaveAsNewSheet={handleSaveJoinedAsNewSheet}
            onUpdateSheetPrimaryKey={handleUpdateSheetPrimaryKey}
          />
        )}

        {activeTab === 'filters' && (
          <FilterStudioView
            sheet={activeSheet}
            filters={currentFilters}
            onAddFilter={handleAddFilter}
            onRemoveFilter={handleRemoveFilter}
            onClearAll={handleClearAllFilters}
            totalRows={activeSheet.data.length}
            filteredRows={processedRows.length}
          />
        )}
      </main>

      {/* Conditional Formatting Modal */}
      <ConditionalFormattingModal
        sheet={activeSheet}
        isOpen={showConditionalModal}
        onClose={() => setShowConditionalModal(false)}
        rules={currentConditionalRules}
        onAddRule={handleAddConditionalRule}
        onUpdateRule={handleUpdateConditionalRule}
        onDeleteRule={handleDeleteConditionalRule}
        onResetRules={handleResetConditionalRules}
      />

      {/* Floating Notification Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-in slide-in-from-bottom-3 duration-200">
          <div
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold border ${
              toast.type === 'success'
                ? 'bg-slate-900 text-white border-slate-800'
                : 'bg-red-600 text-white border-red-700'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-white shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
