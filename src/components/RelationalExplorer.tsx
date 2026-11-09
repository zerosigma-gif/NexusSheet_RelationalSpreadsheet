import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  GitFork,
  Link2,
  Table,
  ArrowRight,
  Download,
  CheckCircle2,
  Layers,
  Database,
  Plus,
  Trash2,
  Play,
  Key,
  Check,
  FileSpreadsheet,
  Columns,
  Share2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { RelationalJoinConfig, Sheet, ColumnDef, RowData } from '../types/spreadsheet';
import { executeRelationalJoin, findBestJoinKeys } from '../utils/filterEngine';

interface RelationalExplorerProps {
  sheets: Sheet[];
  onAddRelation: (
    sourceSheetId: string,
    sourceColKey: string,
    targetSheetId: string,
    targetColKey: string
  ) => void;
  onSaveAsNewSheet?: (newSheet: Sheet) => void;
  onUpdateSheetPrimaryKey?: (sheetId: string, newPkKey: string) => void;
}

export const RelationalExplorer: React.FC<RelationalExplorerProps> = ({
  sheets,
  onAddRelation,
  onSaveAsNewSheet,
  onUpdateSheetPrimaryKey,
}) => {
  // Existing identified relations across sheets
  const existingRelations = useMemo(() => {
    const list: {
      sourceSheet: Sheet;
      sourceCol: string;
      targetSheet: Sheet;
      targetCol: string;
    }[] = [];

    sheets.forEach((s) => {
      s.columns.forEach((c) => {
        if (c.type === 'relation' && c.relation) {
          const target = sheets.find((ts) => ts.id === c.relation?.targetSheetId);
          if (target) {
            list.push({
              sourceSheet: s,
              sourceCol: c.name,
              targetSheet: target,
              targetCol: c.relation.targetColumnKey,
            });
          }
        }
      });
    });

    return list;
  }, [sheets]);

  // Join Mode: 2 Sheets or 3 Sheets
  const [joinMode, setJoinMode] = useState<'two_sheets' | 'three_sheets'>(
    sheets.length >= 3 ? 'three_sheets' : 'two_sheets'
  );

  // Participating Sheets
  const [primarySheetId, setPrimarySheetId] = useState<string>(sheets[0]?.id || '');
  const [foreignSheetId, setForeignSheetId] = useState<string>(sheets[1]?.id || sheets[0]?.id || '');
  const [tertiarySheetId, setTertiarySheetId] = useState<string>(
    sheets[2]?.id || sheets[1]?.id || sheets[0]?.id || ''
  );

  // Join Keys for Sheet 1 & Sheet 2
  const [primaryKeyCol, setPrimaryKeyCol] = useState<string>('');
  const [foreignKeyCol, setForeignKeyCol] = useState<string>('');
  const [joinType, setJoinType] = useState<'left' | 'inner'>('left');

  // Join Keys for Sheet 1 & Sheet 3 (Tertiary)
  const [tertiarySourceKeyCol, setTertiarySourceKeyCol] = useState<string>('');
  const [tertiaryTargetKeyCol, setTertiaryTargetKeyCol] = useState<string>('');
  const [tertiaryJoinType, setTertiaryJoinType] = useState<'left' | 'inner'>('left');

  // Selected columns to include in joined master sheet
  const [selectedColAliases, setSelectedColAliases] = useState<
    { sheetId: string; columnKey: string; alias: string }[]
  >([]);

  // Joined result table state
  const [joinedResult, setJoinedResult] = useState<{
    columns: { key: string; name: string; type: string; sourceSheetId: string; sourceColumnKey: string; currencyCode?: string }[];
    rows: Record<string, any>[];
  } | null>(null);

  const tablePreviewRef = useRef<HTMLDivElement>(null);

  const handleScrollPreview = (direction: 'left' | 'right') => {
    if (tablePreviewRef.current) {
      tablePreviewRef.current.scrollBy({
        left: direction === 'left' ? -380 : 380,
        behavior: 'smooth',
      });
    }
  };

  // Master Database Sheet Name Input
  const [masterSheetName, setMasterSheetName] = useState<string>('Master Database Terpadu');

  // New Relation creator state
  const [newRelSourceSheet, setNewRelSourceSheet] = useState(sheets[0]?.id || '');
  const [newRelSourceCol, setNewRelSourceCol] = useState('');
  const [newRelTargetSheet, setNewRelTargetSheet] = useState(sheets[1]?.id || sheets[0]?.id || '');
  const [newRelTargetCol, setNewRelTargetCol] = useState('');

  const primarySheet = useMemo(() => sheets.find((s) => s.id === primarySheetId) || sheets[0], [sheets, primarySheetId]);
  const foreignSheet = useMemo(() => sheets.find((s) => s.id === foreignSheetId) || sheets[1] || sheets[0], [sheets, foreignSheetId]);
  const tertiarySheet = useMemo(() => sheets.find((s) => s.id === tertiarySheetId) || sheets[2] || null, [sheets, tertiarySheetId]);

  // Synchronize keys automatically when sheets selection changes using intelligent relation matcher
  useEffect(() => {
    if (primarySheet && foreignSheet) {
      const { sourceKey, targetKey } = findBestJoinKeys(
        primarySheet,
        foreignSheet,
        primaryKeyCol,
        foreignKeyCol
      );
      setPrimaryKeyCol(sourceKey);
      setForeignKeyCol(targetKey);
    }
  }, [primarySheetId, foreignSheetId]);

  useEffect(() => {
    if (primarySheet && tertiarySheet) {
      const { sourceKey, targetKey } = findBestJoinKeys(
        primarySheet,
        tertiarySheet,
        tertiarySourceKeyCol,
        tertiaryTargetKeyCol
      );
      setTertiarySourceKeyCol(sourceKey);
      setTertiaryTargetKeyCol(targetKey);
    }
  }, [primarySheetId, tertiarySheetId, joinMode]);

  // Synchronize selected columns when participating sheets change
  useEffect(() => {
    if (!primarySheet || !foreignSheet) return;

    const cols: { sheetId: string; columnKey: string; alias: string }[] = [];

    // Sheet 1 columns (top 5)
    primarySheet.columns.slice(0, 5).forEach((c) => {
      cols.push({ sheetId: primarySheet.id, columnKey: c.key, alias: c.name });
    });

    // Sheet 2 columns (top 4, ensuring foreign attributes are populated)
    foreignSheet.columns.slice(0, 4).forEach((c) => {
      cols.push({ sheetId: foreignSheet.id, columnKey: c.key, alias: c.name });
    });

    // Sheet 3 columns (if 3-sheet mode active)
    if (joinMode === 'three_sheets' && tertiarySheet && tertiarySheet.id !== primarySheet.id && tertiarySheet.id !== foreignSheet.id) {
      tertiarySheet.columns.slice(0, 4).forEach((c) => {
        cols.push({ sheetId: tertiarySheet.id, columnKey: c.key, alias: c.name });
      });
    }

    setSelectedColAliases(cols);
    setMasterSheetName(
      joinMode === 'three_sheets' && tertiarySheet
        ? `Master Data (${primarySheet.name} + ${foreignSheet.name} + ${tertiarySheet.name})`
        : `Master Data (${primarySheet.name} + ${foreignSheet.name})`
    );
  }, [primarySheet?.id, foreignSheet?.id, tertiarySheet?.id, joinMode]);

  const handleToggleColumn = (sheetId: string, columnKey: string, alias: string) => {
    setSelectedColAliases((prev) => {
      const exists = prev.some((c) => c.sheetId === sheetId && c.columnKey === columnKey);
      if (exists) {
        return prev.filter((c) => !(c.sheetId === sheetId && c.columnKey === columnKey));
      } else {
        return [...prev, { sheetId, columnKey, alias }];
      }
    });
  };

  const handleRunJoin = () => {
    if (!primarySheet || !foreignSheet) return;

    const isThreeSheet = joinMode === 'three_sheets' && tertiarySheet;

    const resolvedKeys1 = findBestJoinKeys(primarySheet, foreignSheet, primaryKeyCol, foreignKeyCol);
    const resolvedKeys3 = isThreeSheet && tertiarySheet
      ? findBestJoinKeys(primarySheet, tertiarySheet, tertiarySourceKeyCol, tertiaryTargetKeyCol)
      : null;

    const colsToUse =
      selectedColAliases.length > 0
        ? selectedColAliases
        : [
            ...primarySheet.columns.slice(0, 5).map((c) => ({
              sheetId: primarySheet.id,
              columnKey: c.key,
              alias: c.name,
            })),
            ...foreignSheet.columns.slice(0, 4).map((c) => ({
              sheetId: foreignSheet.id,
              columnKey: c.key,
              alias: c.name,
            })),
            ...(isThreeSheet && tertiarySheet
              ? tertiarySheet.columns.slice(0, 4).map((c) => ({
                  sheetId: tertiarySheet.id,
                  columnKey: c.key,
                  alias: c.name,
                }))
              : []),
          ];

    const joinConfig: RelationalJoinConfig = {
      id: `join-${Date.now()}`,
      title: `${primarySheet.name} × ${foreignSheet.name}${isThreeSheet && tertiarySheet ? ' × ' + tertiarySheet.name : ''}`,
      primarySheetId,
      foreignSheetId,
      primaryKeyColumn: primaryKeyCol || resolvedKeys1.sourceKey,
      foreignKeyColumn: foreignKeyCol || resolvedKeys1.targetKey,
      joinType,
      tertiarySheetId: isThreeSheet && tertiarySheet ? tertiarySheet.id : undefined,
      tertiarySourceKeyColumn: isThreeSheet ? (tertiarySourceKeyCol || resolvedKeys3?.sourceKey) : undefined,
      tertiaryTargetKeyColumn: isThreeSheet ? (tertiaryTargetKeyCol || resolvedKeys3?.targetKey) : undefined,
      tertiaryJoinType: isThreeSheet ? tertiaryJoinType : undefined,
      includedColumns: colsToUse,
    };

    const res = executeRelationalJoin(sheets, joinConfig);
    setJoinedResult(res);
  };

  // Automatically update preview when configuration parameters or sheet columns change
  useEffect(() => {
    if (primarySheet && foreignSheet && selectedColAliases.length > 0) {
      handleRunJoin();
    }
  }, [
    primarySheetId,
    foreignSheetId,
    tertiarySheetId,
    joinMode,
    selectedColAliases.length,
    primaryKeyCol,
    foreignKeyCol,
    tertiarySourceKeyCol,
    tertiaryTargetKeyCol,
    joinType,
    tertiaryJoinType,
  ]);

  // Convert joined result into a true Sheet tab in NexusSheet!
  const handleSaveAsMasterSheet = () => {
    if (!joinedResult || !onSaveAsNewSheet) return;

    const newSheetId = `sheet-master-${Date.now()}`;
    const generatedColumns: ColumnDef[] = joinedResult.columns.map((c, idx) => {
      const sourceS = sheets.find((s) => s.id === c.sourceSheetId);
      const originalCol = sourceS?.columns.find((orig) => orig.key === c.sourceColumnKey);

      return {
        key: `col_${idx}_${c.sourceColumnKey}`,
        name: c.name,
        type: (c.type as any) || 'text',
        category: sourceS ? `${sourceS.name}` : 'Master Join',
        summary: originalCol ? originalCol.summary : 'none',
        width: originalCol?.width || (c.type === 'currency' ? 160 : 140),
        currencyCode: c.currencyCode,
        visible: true,
        isPrimaryKey: idx === 0,
      };
    });

    const generatedData: RowData[] = joinedResult.rows.map((r, rIdx) => {
      const rowObj: Record<string, any> = { _id: `master-${newSheetId}-${rIdx}` };
      joinedResult.columns.forEach((c, idx) => {
        const cleanColKey = `col_${idx}_${c.sourceColumnKey}`;
        rowObj[cleanColKey] = r[c.key];
      });
      return rowObj as RowData;
    });

    const newSheet: Sheet = {
      id: newSheetId,
      name: masterSheetName.trim() || `Master Database (${joinMode === 'three_sheets' ? '3 Sheet' : '2 Sheet'})`,
      description: `Master consolidated database hasil penggabungan ${primarySheet?.name} + ${foreignSheet?.name}${
        joinMode === 'three_sheets' && tertiarySheet ? ' + ' + tertiarySheet.name : ''
      }`,
      primaryKey: generatedColumns[0]?.key,
      columns: generatedColumns,
      data: generatedData,
    };

    onSaveAsNewSheet(newSheet);
  };

  const handleExportJoinedExcel = () => {
    if (!joinedResult) return;
    const wb = XLSX.utils.book_new();
    const cleanRows = joinedResult.rows.map((r) => {
      const obj: Record<string, any> = {};
      joinedResult.columns.forEach((c) => {
        obj[c.name] = r[c.key];
      });
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(cleanRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Master_Database');
    XLSX.writeFile(wb, `${masterSheetName.replace(/\s+/g, '_')}_${Date.now()}.xlsx`);
  };

  const handleExportJoinedCsv = () => {
    if (!joinedResult) return;
    const cleanRows = joinedResult.rows.map((r) => {
      const obj: Record<string, any> = {};
      joinedResult.columns.forEach((c) => {
        obj[c.name] = r[c.key];
      });
      return obj;
    });
    const csv = Papa.unparse(cleanRows, { header: true });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${masterSheetName.replace(/\s+/g, '_')}_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCreateNewRelation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRelSourceSheet || !newRelSourceCol || !newRelTargetSheet || !newRelTargetCol) return;
    onAddRelation(newRelSourceSheet, newRelSourceCol, newRelTargetSheet, newRelTargetCol);
    setNewRelSourceCol('');
    setNewRelTargetCol('');
  };

  return (
    <div className="flex-1 bg-slate-50 p-6 overflow-y-auto space-y-8">
      {/* 1. Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 bg-slate-900 text-white rounded-lg shadow-2xs shrink-0">
            <Database className="w-5 h-5 text-slate-100" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Studio Relasional & Multi-Sheet Join (Master Database Builder)
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                Mendukung 2 & 3 Sheet
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Setiap sheet memiliki Primary Key unik. Hubungkan kunci antar-sheet dan gabungkan lembar kerja menjadi satu Sheet Master Database baru yang langsung aktif di tab spreadsheet.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg font-medium">
            <span className="font-bold text-slate-900 font-mono text-xs">{sheets.length}</span> Sheet Terbaca ·{' '}
            <span className="font-bold text-slate-900 font-mono text-xs">{existingRelations.length}</span> Relasi Aktif
          </div>
        </div>
      </div>

      {/* 2. Visual Entity-Relationship (ER) Diagram Cards & Primary Key Manager */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <GitFork className="w-4 h-4 text-slate-700" />
            <span>Skema Diagram Relasi Entitas & Primary Key per Sheet</span>
          </h3>
          <span className="text-[11px] text-slate-400">
            Setiap sheet memiliki Primary Key sendiri yang menjadi acuan penggabungan data.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {sheets.map((s, idx) => {
            const relationsOut = s.columns.filter((c) => c.type === 'relation');
            const currentPk = s.primaryKey || s.columns.find((c) => c.isPrimaryKey)?.key || s.columns[0]?.key;
            const primaryKeyCol = s.columns.find((c) => c.key === currentPk);

            return (
              <div
                key={s.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Table className="w-4 h-4 text-slate-700" />
                      <div>
                        <span className="font-bold text-slate-900 text-sm block">{s.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">ID: {s.id}</span>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-semibold">
                      {s.data.length} records
                    </span>
                  </div>

                  <div className="py-3 space-y-2 text-xs">
                    {/* Primary Key Config & Badge */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                          <Key className="w-3 h-3 text-slate-500" />
                          <span>Primary Key Terpilih</span>
                        </span>
                        <span className="text-[9px] bg-slate-200 text-slate-800 font-bold px-1.5 py-0.2 rounded font-mono">
                          PK WAJIB
                        </span>
                      </div>

                      {onUpdateSheetPrimaryKey ? (
                        <div className="pt-0.5">
                          <select
                            value={currentPk}
                            onChange={(e) => onUpdateSheetPrimaryKey(s.id, e.target.value)}
                            className="w-full text-xs font-mono font-semibold text-slate-900 bg-white border border-slate-300 rounded px-2 py-1 focus:ring-1 focus:ring-slate-400"
                            title="Ubah kolom primary key untuk sheet ini"
                          >
                            {s.columns.map((col) => (
                              <option key={col.key} value={col.key}>
                                {col.name} ({col.key})
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="font-mono font-semibold text-slate-900 text-xs">
                          {primaryKeyCol?.name || currentPk}
                        </div>
                      )}
                    </div>

                    {/* Columns preview */}
                    <div className="space-y-1 pt-1 max-h-40 overflow-y-auto">
                      <div className="text-[10px] uppercase font-bold text-slate-400 pb-0.5">Kolom Tersedia:</div>
                      {s.columns
                        .filter((c) => c.key !== currentPk)
                        .map((c) => (
                          <div
                            key={c.key}
                            className={`flex items-center justify-between px-2 py-1 rounded text-[11px] ${
                              c.type === 'relation'
                                ? 'bg-slate-100 border border-slate-200 text-slate-900 font-semibold'
                                : 'hover:bg-slate-50 text-slate-600'
                            }`}
                          >
                            <span className="truncate">{c.name}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {c.type === 'relation' ? (
                                <span className="flex items-center gap-0.5 text-[10px] text-slate-700 font-mono font-bold">
                                  <Link2 className="w-3 h-3 text-slate-500" />
                                  <span>FK</span>
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono text-slate-400">{c.type}</span>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>

                {/* Footer relation link status */}
                {relationsOut.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-600 font-medium flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span>Terhubung ke {relationsOut.length} tabel referensi</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Interactive Multi-Sheet Join Studio (Master Database Builder) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-slate-800" />
              <span>Studio Penggabungan Multi-Sheet (Cross-Sheet JOIN Studio)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Gabungkan 2 atau 3 lembar kerja berbeda dengan relasi kunci (Left Join / Inner Join) menjadi satu sheet master database terpadu.
            </p>
          </div>

          {/* Join Mode Selector: 2 Sheets vs 3 Sheets */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setJoinMode('two_sheets')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                joinMode === 'two_sheets'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mode 2 Sheet
            </button>
            <button
              type="button"
              onClick={() => setJoinMode('three_sheets')}
              disabled={sheets.length < 3}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                joinMode === 'three_sheets'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 disabled:opacity-40'
              }`}
              title={sheets.length < 3 ? 'Membutuhkan minimal 3 sheet aktif' : 'Gabungkan 3 sheet menjadi master database'}
            >
              Mode 3 Sheet (Master Terpadu)
            </button>
          </div>
        </div>

        {/* Join Configuration Parameters */}
        <div className="space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Langkah 1: Konfigurasi Hubungan Kunci Antar-Sheet
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Box 1: Primary Sheet (Sheet 1) */}
            <div className="p-4 bg-blue-50/40 border border-blue-200/90 rounded-xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-blue-200/70">
                <span className="font-bold text-blue-950 text-xs flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shadow-2xs">1</span>
                  <span>Sheet Utama (Fact/Source)</span>
                </span>
                <span className="text-[10px] font-mono text-blue-800 bg-blue-100/70 border border-blue-200 px-1.5 py-0.5 rounded font-semibold">
                  Tabel Basis
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Pilih Sheet Utama:</label>
                <select
                  value={primarySheetId}
                  onChange={(e) => setPrimarySheetId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-xs font-medium"
                >
                  {sheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.data.length} baris)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Kolom Penghubung ke Sheet 2:
                </label>
                <select
                  value={primaryKeyCol}
                  onChange={(e) => setPrimaryKeyCol(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-xs font-mono font-semibold"
                >
                  {primarySheet?.columns.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name} ({c.key}) {c.type === 'relation' ? '· [FK]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {joinMode === 'three_sheets' && (
                <div className="pt-2 border-t border-blue-200/70">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Kolom Penghubung ke Sheet 3:
                  </label>
                  <select
                    value={tertiarySourceKeyCol}
                    onChange={(e) => setTertiarySourceKeyCol(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-xs font-mono font-semibold"
                  >
                    {primarySheet?.columns.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name} ({c.key}) {c.type === 'relation' ? '· [FK]' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Box 2: Foreign Sheet (Sheet 2) */}
            <div className="p-4 bg-teal-50/40 border border-teal-200/90 rounded-xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-teal-200/70">
                <span className="font-bold text-teal-950 text-xs flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-bold shadow-2xs">2</span>
                  <span>Sheet Referensi Kedua</span>
                </span>
                <span className="text-[10px] font-mono text-teal-800 bg-teal-100/70 border border-teal-200 px-1.5 py-0.5 rounded font-semibold">
                  Lookup Master
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Pilih Sheet Kedua:</label>
                <select
                  value={foreignSheetId}
                  onChange={(e) => setForeignSheetId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-xs font-medium"
                >
                  {sheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.data.length} baris)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Kunci Pencocokan (Primary Key):
                </label>
                <select
                  value={foreignKeyCol}
                  onChange={(e) => setForeignKeyCol(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-xs font-mono font-semibold"
                >
                  {foreignSheet?.columns.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name} ({c.key}) {c.isPrimaryKey || c.key === foreignSheet.primaryKey ? '· [PK]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 border-t border-teal-200/70">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Tipe Join Sheet 1 &amp; 2:</label>
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="joinType"
                      checked={joinType === 'left'}
                      onChange={() => setJoinType('left')}
                      className="accent-teal-600"
                    />
                    <span className="font-semibold text-teal-950">LEFT JOIN</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="joinType"
                      checked={joinType === 'inner'}
                      onChange={() => setJoinType('inner')}
                      className="accent-teal-600"
                    />
                    <span className="font-semibold text-teal-950">INNER JOIN</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Box 3: Tertiary Sheet (Sheet 3) */}
            {joinMode === 'three_sheets' ? (
              <div className="p-4 bg-amber-50/40 border border-amber-200/90 rounded-xl space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-amber-200/70">
                  <span className="font-bold text-amber-950 text-xs flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px] font-bold shadow-2xs">3</span>
                    <span>Sheet Referensi Ketiga</span>
                  </span>
                  <span className="text-[10px] font-mono text-amber-800 bg-amber-100/70 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">
                    Master Produk / Katalog
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Pilih Sheet Ketiga:</label>
                  <select
                    value={tertiarySheetId}
                    onChange={(e) => setTertiarySheetId(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-xs font-medium"
                  >
                    {sheets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.data.length} baris)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Kunci Pencocokan (Primary Key):
                  </label>
                  <select
                    value={tertiaryTargetKeyCol}
                    onChange={(e) => setTertiaryTargetKeyCol(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-xs font-mono font-semibold"
                  >
                    {tertiarySheet?.columns.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name} ({c.key}) {c.isPrimaryKey || c.key === tertiarySheet.primaryKey ? '· [PK]' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-2 border-t border-amber-200/70">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Tipe Join Sheet 1 &amp; 3:</label>
                  <div className="flex items-center gap-3 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="tertiaryJoinType"
                        checked={tertiaryJoinType === 'left'}
                        onChange={() => setTertiaryJoinType('left')}
                        className="accent-amber-600"
                      />
                      <span className="font-semibold text-amber-950">LEFT JOIN</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="tertiaryJoinType"
                        checked={tertiaryJoinType === 'inner'}
                        onChange={() => setTertiaryJoinType('inner')}
                        className="accent-amber-600"
                      />
                      <span className="font-semibold text-amber-950">INNER JOIN</span>
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-center text-slate-400 space-y-2">
                <Database className="w-8 h-8 opacity-40 text-slate-400" />
                <div className="text-xs font-semibold text-slate-600">Mode 2 Sheet Aktif</div>
                <p className="text-[11px] text-slate-400 max-w-xs">
                  Ingin menggabungkan 3 sheet sekaligus menjadi master database terpadu? Klik tombol <strong>Mode 3 Sheet</strong> di atas.
                </p>
                <button
                  type="button"
                  onClick={() => setJoinMode('three_sheets')}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Aktifkan Mode 3 Sheet
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Columns Selection Matrix */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Langkah 2: Pilih Kolom yang Dimasukkan ke Master Sheet ({selectedColAliases.length} Kolom Terpilih)
            </div>
            <button
              type="button"
              onClick={() => {
                const allCols: { sheetId: string; columnKey: string; alias: string }[] = [];
                primarySheet?.columns.forEach((c) => allCols.push({ sheetId: primarySheet.id, columnKey: c.key, alias: c.name }));
                foreignSheet?.columns.forEach((c) => allCols.push({ sheetId: foreignSheet.id, columnKey: c.key, alias: c.name }));
                if (joinMode === 'three_sheets' && tertiarySheet) {
                  tertiarySheet.columns.forEach((c) => allCols.push({ sheetId: tertiarySheet.id, columnKey: c.key, alias: c.name }));
                }
                setSelectedColAliases(allCols);
              }}
              className="text-xs text-slate-600 hover:text-slate-900 font-medium hover:underline cursor-pointer"
            >
              Pilih Semua Kolom
            </button>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5 max-h-56 overflow-y-auto">
            {/* Sheet 1 columns */}
            <div>
              <div className="text-[11px] font-semibold text-blue-950 mb-1.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                <span>Kolom dari {primarySheet?.name}:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {primarySheet?.columns.map((c) => {
                  const isChecked = selectedColAliases.some((col) => col.sheetId === primarySheet.id && col.columnKey === c.key);
                  return (
                    <button
                      type="button"
                      key={`${primarySheet.id}_${c.key}`}
                      onClick={() => handleToggleColumn(primarySheet.id, c.key, c.name)}
                      className={`px-2.5 py-1 rounded-md text-xs border flex items-center gap-1.5 transition-all cursor-pointer ${
                        isChecked
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs font-semibold'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50/60 hover:text-blue-800 hover:border-blue-200 font-normal'
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 text-white shrink-0" />}
                      <span>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sheet 2 columns */}
            <div className="pt-2.5 border-t border-slate-200">
              <div className="text-[11px] font-semibold text-teal-950 mb-1.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-teal-600" />
                <span>Kolom dari {foreignSheet?.name}:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {foreignSheet?.columns.map((c) => {
                  const isChecked = selectedColAliases.some((col) => col.sheetId === foreignSheet.id && col.columnKey === c.key);
                  return (
                    <button
                      type="button"
                      key={`${foreignSheet.id}_${c.key}`}
                      onClick={() => handleToggleColumn(foreignSheet.id, c.key, c.name)}
                      className={`px-2.5 py-1 rounded-md text-xs border flex items-center gap-1.5 transition-all cursor-pointer ${
                        isChecked
                          ? 'bg-teal-600 text-white border-teal-600 shadow-2xs font-semibold'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-teal-50/60 hover:text-teal-800 hover:border-teal-200 font-normal'
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 text-white shrink-0" />}
                      <span>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sheet 3 columns if active */}
            {joinMode === 'three_sheets' && tertiarySheet && (
              <div className="pt-2.5 border-t border-slate-200">
                <div className="text-[11px] font-semibold text-amber-950 mb-1.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-600" />
                  <span>Kolom dari {tertiarySheet.name}:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tertiarySheet.columns.map((c) => {
                    const isChecked = selectedColAliases.some((col) => col.sheetId === tertiarySheet.id && col.columnKey === c.key);
                    return (
                      <button
                        type="button"
                        key={`${tertiarySheet.id}_${c.key}`}
                        onClick={() => handleToggleColumn(tertiarySheet.id, c.key, c.name)}
                        className={`px-2.5 py-1 rounded-md text-xs border flex items-center gap-1.5 transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-amber-600 text-white border-amber-600 shadow-2xs font-semibold'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-50/60 hover:text-amber-800 hover:border-amber-200 font-normal'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3 text-white shrink-0" />}
                        <span>{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Step 3: Run Join Button */}
        <div className="pt-2 flex items-center justify-between border-t border-slate-100">
          <div className="text-xs text-slate-500">
            {joinMode === 'three_sheets'
              ? `Menggabungkan 3 Sheet (${primarySheet?.name} × ${foreignSheet?.name} × ${tertiarySheet?.name})`
              : `Menggabungkan 2 Sheet (${primarySheet?.name} × ${foreignSheet?.name})`}
          </div>

          <button
            onClick={handleRunJoin}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Eksekusi Join &amp; Tampilkan Preview</span>
          </button>
        </div>

        {/* Joined Table Result Preview & Save as Master Database Sheet */}
        {joinedResult && (
          <div className="space-y-4 pt-5 border-t border-slate-200 animate-in fade-in">
            {/* Header Result & Save as New Sheet Action */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <h4 className="text-sm font-bold text-slate-900">
                    Penggabungan Berhasil: {joinedResult.rows.length} Baris Data Terpadu
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {joinedResult.columns.length} Kolom
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Data telah digabung secara relasional. Simpan hasil ini menjadi <strong>Tab Sheet Baru</strong> agar langsung muncul dan bisa diolah di Spreadsheet Grid.
                </p>
              </div>

              {/* Master Sheet Save Form & Button */}
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="text"
                  value={masterSheetName}
                  onChange={(e) => setMasterSheetName(e.target.value)}
                  placeholder="Nama Sheet Baru..."
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white text-slate-900 shadow-2xs focus:ring-1 focus:ring-blue-400 min-w-56"
                />

                <button
                  onClick={handleSaveAsMasterSheet}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs shrink-0 cursor-pointer"
                  title="Simpan tabel terpadu ini menjadi tab sheet baru yang aktif di aplikasi"
                >
                  <Plus className="w-4 h-4 text-white" />
                  <span>Jadikan Sheet Tab Baru (Master Database)</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleExportJoinedExcel}
                    className="p-2 bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold transition-colors"
                    title="Export ke file Excel (.xlsx)"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleExportJoinedCsv}
                    className="p-2 bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold transition-colors"
                    title="Export ke file CSV"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Horizontal Scroll Bar & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1 pt-1 text-xs">
              <div className="text-slate-600 font-medium flex items-center gap-1.5">
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>
                  Total <strong>{joinedResult.columns.length} kolom</strong> hasil join. Geser horizontal ke arah kanan untuk memeriksa seluruh isi sel.
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleScrollPreview('left')}
                  className="px-2.5 py-1 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                  title="Geser tampilan tabel ke kiri"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Geser Kiri</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleScrollPreview('right')}
                  className="px-2.5 py-1 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                  title="Geser tampilan tabel ke arah kanan untuk melihat semua kolom"
                >
                  <span>Geser Kanan</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Table Preview with Full Horizontal & Vertical Scrolling */}
            <div
              ref={tablePreviewRef}
              className="border border-slate-200 rounded-xl overflow-x-auto overflow-y-auto max-h-96 bg-white shadow-2xs scroll-smooth"
            >
              <table className="min-w-max w-full text-xs text-left border-collapse">
                <thead className="sticky top-0 bg-slate-100 font-semibold text-slate-700 border-b border-slate-200 z-10 select-none">
                  <tr>
                    <th className="sticky left-0 bg-slate-100 z-20 px-3 py-2.5 text-center w-12 min-w-[48px] border-r border-slate-300 font-sans">
                      #
                    </th>
                    {joinedResult.columns.map((col, cIdx) => (
                      <th
                        key={`${col.key}-${cIdx}`}
                        className="px-4 py-2.5 border-r border-slate-200 whitespace-nowrap min-w-[160px] bg-slate-100"
                      >
                        <span className="block font-bold text-slate-900">{col.name}</span>
                        <span className="text-[9px] font-mono font-normal text-slate-400 block uppercase mt-0.5">
                          {col.type}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {joinedResult.rows.map((row, idx) => (
                    <tr key={row._id || `join-row-${idx}`} className="hover:bg-slate-50 transition-colors">
                      <td className="sticky left-0 bg-slate-50 z-10 px-3 py-2 text-center text-slate-400 font-sans border-r border-slate-300">
                        {idx + 1}
                      </td>
                      {joinedResult.columns.map((col, cIdx) => (
                        <td
                          key={`${col.key}-${cIdx}`}
                          className="px-4 py-2 border-r border-slate-200 text-slate-800 whitespace-nowrap min-w-[160px]"
                        >
                          {row[col.key] !== null && row[col.key] !== undefined
                            ? String(row[col.key])
                            : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Scroll Assist & Affordance Bar */}
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 font-medium">
              <span className="flex items-center gap-1.5">
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  Gunakan scrollbar horizontal di atas untuk melihat kolom yang ada di sisi kanan tabel sebelum menyimpan master sheet.
                </span>
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleScrollPreview('left')}
                  className="px-2 py-0.5 text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded shadow-2xs"
                >
                  ← Kiri
                </button>
                <button
                  type="button"
                  onClick={() => handleScrollPreview('right')}
                  className="px-2 py-0.5 text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded shadow-2xs"
                >
                  Kanan →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Manual Relation Link Form */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Plus className="w-4 h-4 text-slate-700" />
            <span>Konfigurasi Relasi Baru Antar-Sheet</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Buat definisi hubungan foreign key baru antara dua lembar kerja untuk mengaktifkan tautan navigasi dan join otomatis.
          </p>
        </div>

        <form onSubmit={handleCreateNewRelation} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Sheet Sumber (Source)</label>
            <select
              value={newRelSourceSheet}
              onChange={(e) => setNewRelSourceSheet(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-800 text-xs"
            >
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Kolom Sumber (Foreign Key)</label>
            <select
              value={newRelSourceCol}
              onChange={(e) => setNewRelSourceCol(e.target.value)}
              required
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-800 text-xs font-mono"
            >
              <option value="">Pilih kolom...</option>
              {sheets.find((s) => s.id === newRelSourceSheet)?.columns.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name} ({c.key})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Sheet Tujuan (Master Target)</label>
            <select
              value={newRelTargetSheet}
              onChange={(e) => setNewRelTargetSheet(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-800 text-xs"
            >
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Kolom Tujuan (Primary Key)</label>
            <select
              value={newRelTargetCol}
              onChange={(e) => setNewRelTargetCol(e.target.value)}
              required
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-800 text-xs font-mono"
            >
              <option value="">Pilih kolom...</option>
              {sheets.find((s) => s.id === newRelTargetSheet)?.columns.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name} ({c.key}) {c.isPrimaryKey ? '· [PK]' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <button
              type="submit"
              className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
            >
              + Simpan Relasi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
