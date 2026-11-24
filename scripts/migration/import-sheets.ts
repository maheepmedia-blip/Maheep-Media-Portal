import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { readSheet } from 'read-excel-file/node';
import { db, initDatabase } from '../../server/db.ts';
import { createSlug, titleSimilarity } from '../../server/rss.ts';

function parseCsvText(csvText: string): Array<Record<string, unknown>> {
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

async function run() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error('Usage: npx tsx scripts/migration/import-sheets.ts <path-to-csv-xlsx-json>');
    process.exit(1);
  }

  const resolved = path.resolve(process.cwd(), inputFile);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  initDatabase();

  let records: Array<Record<string, unknown>> = [];
  const lower = resolved.toLowerCase();
  if (lower.endsWith('.json')) {
    records = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } else if (lower.endsWith('.csv')) {
    records = parseCsvText(fs.readFileSync(resolved, 'utf8'));
  } else if (lower.endsWith('.xlsx')) {
    const rows = await readSheet(resolved);
    if (rows.length >= 2) {
      const headers = rows[0].map((h) => String(h ?? '').trim());
      records = rows.slice(1).map((vals) => {
        const obj: Record<string, unknown> = {};
        headers.forEach((h, idx) => {
          if (h) obj[h] = vals[idx] ?? '';
        });
        return obj;
      });
    }
  } else {
    console.error('Unsupported file type. Use .csv, .xlsx, or .json');
    process.exit(1);
  }

  const categories = db.prepare('SELECT id, slug, name FROM categories').all() as Array<{ id: string; slug: string; name: string }>;
  const states = db.prepare('SELECT id, slug, name FROM states').all() as Array<{ id: string; slug: string; name: string }>;
  const existingTitles = (db.prepare('SELECT title FROM articles').all() as Array<{ title: string }>).map((r) => r.title);

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  records.forEach((row, idx) => {
    const title = String(row.title || row.headline || row.Title || '').trim();
    const summary = String(row.summary || row.description || row.Summary || '').trim();
    if (!title || !summary) {
      errors.push(`Row ${idx + 1}: Missing required title or summary`);
      return;
    }
    if (existingTitles.some((t) => titleSimilarity(t, title) >= 0.85)) {
      skipped++;
      return;
    }

    const rawCat = String(row.category || row.Category || 'national').toLowerCase();
    const cat = categories.find((c) => c.slug === rawCat || c.name.toLowerCase() === rawCat);
    const rawState = String(row.state || row.State || '').toLowerCase();
    const st = states.find((s) => s.slug === rawState || s.name.toLowerCase() === rawState);
    const lang = String(row.language || row.Language || 'en').toLowerCase().startsWith('hi') ? 'hi' : 'en';
    const pubDate = row.published_at || row.date ? new Date(String(row.published_at || row.date)) : new Date();
    if (Number.isNaN(pubDate.getTime())) {
      errors.push(`Row ${idx + 1} (${title}): Invalid date`);
      return;
    }

    db.prepare(`
      INSERT INTO articles (id, title, slug, summary, content, source_name, author, language, category_id, state_id, status, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)
    `).run(
      `art-mig-${Date.now()}-${idx}`,
      title,
      createSlug(title),
      summary,
      String(row.content || row.body || summary),
      String(row.source_name || row.source || 'Maheep Archive'),
      String(row.author || 'Maheep Editorial Archive'),
      lang,
      cat?.id || 'cat-national',
      st?.id || null,
      pubDate.toISOString(),
    );

    existingTitles.push(title);
    imported++;
  });

  console.log(`Migration finished: ${imported} imported, ${skipped} skipped duplicates, ${errors.length} invalid.`);
  if (errors.length > 0) console.log('Validation Errors:\n' + errors.join('\n'));
}

void run();
