import { FileSpreadsheet, Upload } from 'lucide-react';
import React, { useState } from 'react';
import { readSheet } from 'read-excel-file/browser';

interface AdminMigrationPanelProps {
  token: string;
  onImported: () => void;
}

function parseCsvRows(csvText: string): Array<Record<string, unknown>> {
  const lines: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i++;
      row.push(field.trim());
      if (row.some((c) => c !== '')) lines.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((c) => c !== '')) lines.push(row);
  }

  if (lines.length < 2) return [];
  const headers = lines[0].map((h) => h.trim());
  return lines.slice(1).map((vals) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = vals[idx] ?? '';
    });
    return obj;
  });
}

export function AdminMigrationPanel({ token, onImported }: AdminMigrationPanelProps) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<{
    imported: number;
    skipped: number;
    invalidCount: number;
    invalidRows: Array<{ row: number; reason: string; title?: string }>;
  } | null>(null);
  const [error, setError] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setReport(null);
    setFileName(file.name);

    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error('JSON must contain an array of article objects.');
        setRows(parsed);
      } else if (lower.endsWith('.csv')) {
        const text = await file.text();
        setRows(parseCsvRows(text));
      } else if (lower.endsWith('.xlsx')) {
        const sheetRows = await readSheet(file);
        if (sheetRows.length < 2) {
          setRows([]);
          return;
        }
        const headers = sheetRows[0].map((h) => String(h ?? '').trim());
        const mapped = sheetRows.slice(1).map((vals) => {
          const obj: Record<string, unknown> = {};
          headers.forEach((h, idx) => {
            if (h) obj[h] = vals[idx] ?? '';
          });
          return obj;
        });
        setRows(mapped);
      } else {
        throw new Error('Unsupported format. Please upload .csv, .xlsx, or .json exported from Google Sheets.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
      setRows([]);
    }
  };

  const runMigration = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/migrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ records: rows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Migration failed');
      setReport(json);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Migration request failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-6 bg-white dark:bg-neutral-900 space-y-4">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="w-6 h-6 text-[#00652E] shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-bold">Google Sheets &amp; Legacy Archive Importer</h2>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
              Import historical articles exported from Google Sheets in CSV, XLSX, or JSON format. Expected columns:{' '}
              <code className="font-mono-tabular bg-neutral-100 dark:bg-neutral-800 px-1 rounded">title</code>,{' '}
              <code className="font-mono-tabular bg-neutral-100 dark:bg-neutral-800 px-1 rounded">summary</code>,{' '}
              <code className="font-mono-tabular bg-neutral-100 dark:bg-neutral-800 px-1 rounded">content</code>,{' '}
              <code className="font-mono-tabular bg-neutral-100 dark:bg-neutral-800 px-1 rounded">category</code>,{' '}
              <code className="font-mono-tabular bg-neutral-100 dark:bg-neutral-800 px-1 rounded">state</code>,{' '}
              <code className="font-mono-tabular bg-neutral-100 dark:bg-neutral-800 px-1 rounded">language</code>,{' '}
              <code className="font-mono-tabular bg-neutral-100 dark:bg-neutral-800 px-1 rounded">published_at</code>.
              Invalid rows are never silently discarded—every validation issue is reported below.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-neutral-300 dark:border-neutral-700 text-xs font-semibold cursor-pointer hover:border-[#00652E]">
            <Upload className="w-4 h-4 text-[#00652E]" />
            <span>{fileName ? `Selected: ${fileName}` : 'Select CSV, XLSX, or JSON File'}</span>
            <input type="file" accept=".csv,.xlsx,.json" onChange={handleFile} className="hidden" />
          </label>

          {rows.length > 0 && (
            <button
              type="button"
              disabled={importing}
              onClick={runMigration}
              className="px-5 py-2.5 rounded-md bg-[#00652E] hover:bg-[#00451F] text-white text-xs font-semibold disabled:opacity-60"
            >
              {importing ? 'Importing...' : `Validate & Import ${rows.length} Records`}
            </button>
          )}
        </div>

        {error && (
          <div className="p-3 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {report && (
          <div className="p-4 rounded-lg bg-[#EAF5E5] dark:bg-[#00451F]/40 border border-[#00652E]/30 space-y-2 text-xs">
            <div className="font-bold text-[#00451F] dark:text-white font-mono-tabular">
              Migration Complete: {report.imported} Imported · {report.skipped} Duplicates Skipped · {report.invalidCount} Invalid Rows Flagged
            </div>
            {report.invalidRows.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto bg-white dark:bg-neutral-900 p-3 rounded border border-red-200 dark:border-red-900 space-y-1">
                {report.invalidRows.map((inv, idx) => (
                  <div key={idx} className="text-red-700 dark:text-red-300">
                    Row {inv.row}{inv.title ? ` (${inv.title})` : ''}: {inv.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800 rounded">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-100 dark:bg-neutral-800">
                <tr>
                  <th className="p-2.5">#</th>
                  <th className="p-2.5">Title / Headline</th>
                  <th className="p-2.5">Category</th>
                  <th className="p-2.5">Language</th>
                  <th className="p-2.5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {rows.slice(0, 8).map((r, i) => (
                  <tr key={i}>
                    <td className="p-2.5 font-mono-tabular">{i + 1}</td>
                    <td className="p-2.5 max-w-md truncate">{String(r.title || r.headline || r.Title || '—')}</td>
                    <td className="p-2.5">{String(r.category || r.Category || 'national')}</td>
                    <td className="p-2.5">{String(r.language || r.Language || 'en')}</td>
                    <td className="p-2.5 font-mono-tabular">{String(r.published_at || r.date || r.Date || 'Now')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
