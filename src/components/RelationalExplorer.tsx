import React, { useState, useMemo } from 'react';
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
  Play
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { RelationalJoinConfig, Sheet } from '../types/spreadsheet';
import { executeRelationalJoin } from '../utils/filterEngine';

interface RelationalExplorerProps {
  sheets: Sheet[];
  onAddRelation: (
    sourceSheetId: string,
    sourceColKey: string,
    targetSheetId: string,
    targetColKey: string
  ) => void;
}

export const RelationalExplorer: React.FC<RelationalExplorerProps> = ({
  sheets,
  onAddRelation,
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

  // Join Studio configuration state
  const [primarySheetId, setPrimarySheetId] = useState<string>(sheets[0]?.id || '');
  const [foreignSheetId, setForeignSheetId] = useState<string>(sheets[1]?.id || '');
  const [primaryKeyCol, setPrimaryKeyCol] = useState<string>('CustomerID');
  const [foreignKeyCol, setForeignKeyCol] = useState<string>('CustomerID');
  const [joinType, setJoinType] = useState<'left' | 'inner'>('left');

  // Selected columns to include in joined view
  const [selectedColAliases, setSelectedColAliases] = useState<
    { sheetId: string; columnKey: string; alias: string }[]
  >([]);

  // Joined result table state
  const [joinedResult, setJoinedResult] = useState<{
    columns: { key: string; name: string; type: string }[];
    rows: Record<string, any>[];
  } | null>(null);

  // New Relation creator state
  const [newRelSourceSheet, setNewRelSourceSheet] = useState(sheets[0]?.id || '');
  const [newRelSourceCol, setNewRelSourceCol] = useState('');
  const [newRelTargetSheet, setNewRelTargetSheet] = useState(sheets[1]?.id || '');
  const [newRelTargetCol, setNewRelTargetCol] = useState('');

  const primarySheet = sheets.find((s) => s.id === primarySheetId);
  const foreignSheet = sheets.find((s) => s.id === foreignSheetId);

  // Auto initialize selected columns when sheets change
  const handleInitColumns = () => {
    if (!primarySheet || !foreignSheet) return;

    const initialCols: { sheetId: string; columnKey: string; alias: string }[] = [];

    // Take top 4 from primary sheet
    primarySheet.columns.slice(0, 4).forEach((c) => {
      initialCols.push({ sheetId: primarySheet.id, columnKey: c.key, alias: c.name });
    });

    // Take top 3 from foreign sheet
    foreignSheet.columns.slice(0, 3).forEach((c) => {
      initialCols.push({ sheetId: foreignSheet.id, columnKey: c.key, alias: c.name });
    });

    setSelectedColAliases(initialCols);
  };

  const handleRunJoin = () => {
    if (!primarySheet || !foreignSheet) return;

    const colsToUse =
      selectedColAliases.length > 0
        ? selectedColAliases
        : [
            ...primarySheet.columns.slice(0, 3).map((c) => ({
              sheetId: primarySheet.id,
              columnKey: c.key,
              alias: c.name,
            })),
            ...foreignSheet.columns.slice(0, 3).map((c) => ({
              sheetId: foreignSheet.id,
              columnKey: c.key,
              alias: c.name,
            })),
          ];

    const joinConfig: RelationalJoinConfig = {
      id: `join-${Date.now()}`,
      title: `${primarySheet.name} × ${foreignSheet.name}`,
      primarySheetId,
      foreignSheetId,
      primaryKeyColumn: primaryKeyCol,
      foreignKeyColumn: foreignKeyCol,
      joinType,
      includedColumns: colsToUse,
    };

    const res = executeRelationalJoin(sheets, joinConfig);
    setJoinedResult(res);
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
    XLSX.utils.book_append_sheet(wb, ws, 'Relational_Join');
    XLSX.writeFile(wb, `NexusSheet_Relational_Join_${Date.now()}.xlsx`);
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
    link.download = `NexusSheet_Relational_Join_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 bg-slate-50 p-6 overflow-y-auto space-y-8">
      {/* 1. Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Arsitektur Relasional Antar-Sheet & Join Studio
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Hubungkan foreign key antar lembar kerja, telusuri diagram ER relasi, dan eksekusi penggabungan tabel (Join Query)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg font-medium">
            <span className="font-bold text-indigo-600">{existingRelations.length}</span> Relasi Terdeteksi
          </div>
        </div>
      </div>

      {/* 2. Visual Entity-Relationship (ER) Diagram Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <GitFork className="w-4 h-4 text-slate-700" />
            <span>Skema Diagram Relasi Entitas (ER Model)</span>
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {sheets.map((s) => {
            const relationsOut = s.columns.filter((c) => c.type === 'relation');
            const primaryKeyCol = s.columns.find((c) => c.isPrimaryKey || c.key === s.primaryKey);

            return (
              <div
                key={s.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Table className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold text-slate-900 text-sm">{s.name}</span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
                      {s.data.length} records
                    </span>
                  </div>

                  <div className="py-3 space-y-1 text-xs">
                    {/* Primary Key */}
                    {primaryKeyCol && (
                      <div className="flex items-center justify-between p-1.5 bg-amber-50/60 border border-amber-200/60 rounded text-amber-900 font-mono text-[11px]">
                        <span className="font-semibold">{primaryKeyCol.name}</span>
                        <span className="text-[10px] bg-amber-200 text-amber-800 font-bold px-1 rounded">
                          PRIMARY KEY
                        </span>
                      </div>
                    )}

                    {/* Columns preview */}
                    <div className="space-y-1 pt-1 max-h-40 overflow-y-auto">
                      {s.columns
                        .filter((c) => !c.isPrimaryKey && c.key !== s.primaryKey)
                        .map((c) => (
                          <div
                            key={c.key}
                            className={`flex items-center justify-between px-2 py-1 rounded text-[11px] ${
                              c.type === 'relation'
                                ? 'bg-indigo-50/70 border border-indigo-200 text-indigo-900 font-semibold'
                                : 'hover:bg-slate-50 text-slate-600'
                            }`}
                          >
                            <span className="truncate">{c.name}</span>
                            <div className="flex items-center gap-1">
                              {c.type === 'relation' ? (
                                <span className="flex items-center gap-0.5 text-[10px] text-indigo-600">
                                  <Link2 className="w-3 h-3" />
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
                  <div className="pt-3 border-t border-slate-100 text-[11px] text-indigo-700 font-medium flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Terhubung ke {relationsOut.length} tabel referensi</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Interactive Cross-Sheet Join Query Builder */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600" />
            <span>Studio Penggabungan Tabel (Relational Cross-Sheet JOIN)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Gabungkan lembar kerja utama (Primary Sheet) dengan data dari lembar kerja kedua (Foreign Sheet) menjadi satu tabel terpadu.
          </p>
        </div>

        {/* Join Configuration Parameters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs">
          {/* Primary Sheet */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">1. Lembar Kerja Utama</label>
            <select
              value={primarySheetId}
              onChange={(e) => {
                setPrimarySheetId(e.target.value);
                const s = sheets.find((item) => item.id === e.target.value);
                if (s) setPrimaryKeyCol(s.columns[1]?.key || s.columns[0]?.key || '');
              }}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-slate-800 text-xs"
            >
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Join Key from Primary */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Kolom Kunci Sheet Utama</label>
            <select
              value={primaryKeyCol}
              onChange={(e) => setPrimaryKeyCol(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-slate-800 text-xs font-mono"
            >
              {primarySheet?.columns.map((c, cIdx) => (
                <option key={`${c.key}-${cIdx}`} value={c.key}>
                  {c.name} ({c.key})
                </option>
              ))}
            </select>
          </div>

          {/* Foreign Sheet */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">2. Lembar Kerja Referensi</label>
            <select
              value={foreignSheetId}
              onChange={(e) => {
                setForeignSheetId(e.target.value);
                const s = sheets.find((item) => item.id === e.target.value);
                if (s) setForeignKeyCol(s.primaryKey || s.columns[0]?.key || '');
              }}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-slate-800 text-xs"
            >
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Join Key from Foreign */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Kolom Kunci Sheet Referensi</label>
            <select
              value={foreignKeyCol}
              onChange={(e) => setForeignKeyCol(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-slate-800 text-xs font-mono"
            >
              {foreignSheet?.columns.map((c, cIdx) => (
                <option key={`${c.key}-${cIdx}`} value={c.key}>
                  {c.name} ({c.key})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Join Type and Action */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <div className="flex items-center gap-3 text-xs">
            <span className="font-semibold text-slate-700">Tipe Join:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="joinType"
                checked={joinType === 'left'}
                onChange={() => setJoinType('left')}
                className="text-indigo-600"
              />
              <span className="text-slate-800">LEFT JOIN (Pertahankan semua baris Sheet Utama)</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer ml-3">
              <input
                type="radio"
                name="joinType"
                checked={joinType === 'inner'}
                onChange={() => setJoinType('inner')}
                className="text-indigo-600"
              />
              <span className="text-slate-800">INNER JOIN (Hanya baris yang cocok keduanya)</span>
            </label>
          </div>

          <button
            onClick={handleRunJoin}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors shadow-xs"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>Eksekusi Join & Tampilkan Hasil</span>
          </button>
        </div>

        {/* Joined Table Result Preview */}
        {joinedResult && (
          <div className="space-y-4 pt-4 border-t border-slate-200 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Hasil Penggabungan Relasional: {joinedResult.rows.length} Baris Data Terpadu
                </h4>
                <p className="text-[11px] text-slate-500">
                  Kolom gabungan dari {primarySheet?.name} dan {foreignSheet?.name}
                </p>
              </div>

              {/* Export Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportJoinedExcel}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Excel (.xlsx)</span>
                </button>
                <button
                  onClick={handleExportJoinedCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download CSV</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="sticky top-0 bg-slate-100 font-semibold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-center w-10">#</th>
                    {joinedResult.columns.map((col, cIdx) => (
                      <th key={`${col.key}-${cIdx}`} className="px-3 py-2 border-r border-slate-200 whitespace-nowrap">
                        {col.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {joinedResult.rows.map((row, idx) => (
                    <tr key={row._id || `join-row-${idx}`} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 text-center text-slate-400 font-sans">{idx + 1}</td>
                      {joinedResult.columns.map((col, cIdx) => (
                        <td key={`${col.key}-${cIdx}`} className="px-3 py-1.5 border-r border-slate-200 text-slate-800 truncate max-w-xs">
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
          </div>
        )}
      </div>
    </div>
  );
};
