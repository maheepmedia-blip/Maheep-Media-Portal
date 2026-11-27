import { GoogleGenAI, Type } from '@google/genai';
import crypto from 'node:crypto';
import { db } from './db.ts';

export type TargetLanguage = 'all' | 'en' | 'hi';

export interface TranslatableNewsItem {
  id?: string;
  title: string;
  summary?: string;
  content?: string;
  detailed_body?: string;
  source_name?: string;
  language?: string;
}

interface CachedTranslationRow {
  cache_key: string;
  target_lang: string;
  title: string;
  summary: string;
  body: string;
}

const inflightRequests = new Map<string, Promise<{ title: string; summary: string; body: string }>>();

export function hasDevanagari(text?: string | null): boolean {
  return /[\u0900-\u097F]/.test(String(text || ''));
}

function makeCacheKey(targetLang: 'en' | 'hi', title: string, summary: string): string {
  return crypto
    .createHash('sha1')
    .update(`${targetLang}|${title.trim()}|${summary.trim().slice(0, 140)}`)
    .digest('hex')
    .slice(0, 24);
}

function needsTranslation(
  item: { title: string; summary?: string },
  targetLang: 'en' | 'hi',
): boolean {
  const title = (item.title || '').trim();
  const summary = (item.summary || '').trim();
  if (!title) return false;
  if (targetLang === 'hi') {
    return !hasDevanagari(title) || (summary.length > 20 && !hasDevanagari(summary));
  }
  return hasDevanagari(title) || hasDevanagari(summary);
}

function stripBoilerplateEnglishTail(body: string, summary: string): { isBoilerplate: boolean; extraParagraphs: string[] } {
  const paras = body
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length === 0) return { isBoilerplate: true, extraParagraphs: [] };

  const realExtras = paras.filter((p, idx) => {
    if (idx === 0 && summary && p.slice(0, 40).toLowerCase() === summary.trim().slice(0, 40).toLowerCase()) {
      return false;
    }
    if (
      /^(Click "Read Full Publisher Dispatch"|Source Dispatch:|Our Pride City Dispatch|.*— Reported by )/i.test(p)
    ) {
      return false;
    }
    return true;
  });
  return {
    isBoilerplate: realExtras.length === 0,
    extraParagraphs: realExtras,
  };
}

function buildLocalizedBody(
  translatedSummary: string,
  translatedExtras: string[],
  sourceName: string,
  targetLang: 'en' | 'hi',
): string {
  const parts = [translatedSummary, ...translatedExtras].filter(Boolean);
  if (parts.length <= 1) {
    parts.push(
      targetLang === 'hi'
        ? `स्रोत: ${sourceName || 'माहीप न्यूज़ डेस्क'}। पूरी मूल रिपोर्ट देखने के लिए नीचे दिए गए स्रोत लिंक का उपयोग करें।`
        : `Source: ${sourceName || 'Maheep News Desk'}. Open the publisher attribution link below for the complete original report.`,
    );
  }
  return parts.join('\n\n');
}

function splitIntoChunks(text: string, maxLen = 420): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  const chunks: string[] = [];
  const sentences = clean.split(/(?<=[.।!?])\s+/);
  let current = '';
  for (const s of sentences) {
    if (!s) continue;
    if ((current + ' ' + s).trim().length <= maxLen) {
      current = (current + ' ' + s).trim();
    } else {
      if (current) chunks.push(current);
      if (s.length <= maxLen) {
        current = s;
      } else {
        // Hard wrap oversized clause at word boundary
        let rest = s;
        while (rest.length > maxLen) {
          let cut = rest.lastIndexOf(' ', maxLen);
          if (cut < 60) cut = maxLen;
          chunks.push(rest.slice(0, cut).trim());
          rest = rest.slice(cut).trim();
        }
        current = rest;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function translateViaMyMemory(text: string, targetLang: 'en' | 'hi'): Promise<string> {
  const clean = text.trim();
  if (!clean) return '';
  if (targetLang === 'hi' && hasDevanagari(clean) && !/[A-Za-z]{4,}/.test(clean)) return clean;
  if (targetLang === 'en' && !hasDevanagari(clean)) return clean;

  const src = targetLang === 'hi' ? 'en' : 'hi';
  const chunks = splitIntoChunks(clean, 420);
  const translatedChunks: string[] = [];

  for (const chunk of chunks) {
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${src}|${targetLang}&de=maheepmedia@gmail.com`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6500) });
      if (!res.ok) {
        translatedChunks.push(chunk);
        continue;
      }
      const json = (await res.json()) as {
        responseStatus?: number;
        responseData?: { translatedText?: string };
      };
      const out = (json?.responseData?.translatedText || '').trim();
      if (json?.responseStatus === 200 && out && !/MYMEMORY WARNING/i.test(out)) {
        translatedChunks.push(out);
      } else {
        translatedChunks.push(chunk);
      }
    } catch {
      translatedChunks.push(chunk);
    }
  }

  return translatedChunks.join(' ').trim();
}

async function translateBatchViaGemini(
  items: Array<{ cacheKey: string; title: string; summary: string; bodyText: string }>,
  targetLang: 'en' | 'hi',
): Promise<Map<string, { title: string; summary: string; body: string }> | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || items.length === 0) return null;

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const langLabel = targetLang === 'hi' ? 'Hindi (Devanagari script)' : 'English';
    const payload = items.map((it, idx) => ({
      idx,
      title: it.title,
      summary: it.summary.slice(0, 600),
      body: it.bodyText.slice(0, 1200),
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Translate each news item's title, summary, and body faithfully into journalistic ${langLabel}. Keep exact meaning, names, numbers, and paragraph breaks.\n\n${JSON.stringify(payload)}`,
      config: {
        systemInstruction:
          'You are a newsroom translator for Maheep News Portal. Preserve factual accuracy without adding or omitting information.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              idx: { type: Type.INTEGER },
              title: { type: Type.STRING },
              summary: { type: Type.STRING },
              body: { type: Type.STRING },
            },
            required: ['idx', 'title', 'summary', 'body'],
          },
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '[]').trim()) as Array<{
      idx: number;
      title: string;
      summary: string;
      body: string;
    }>;
    const outMap = new Map<string, { title: string; summary: string; body: string }>();
    for (const row of parsed) {
      const src = items[row.idx];
      if (!src) continue;
      outMap.set(src.cacheKey, {
        title: (row.title || src.title).trim(),
        summary: (row.summary || src.summary).trim(),
        body: (row.body || '').trim(),
      });
    }
    return outMap.size > 0 ? outMap : null;
  } catch {
    return null;
  }
}

async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, concurrency = 6): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++;
      results[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

function readCachedRows(keys: string[], targetLang: 'en' | 'hi'): Map<string, CachedTranslationRow> {
  const map = new Map<string, CachedTranslationRow>();
  if (keys.length === 0) return map;
  const unique = Array.from(new Set(keys));
  const chunkSize = 180;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const slice = unique.slice(i, i + chunkSize);
    const placeholders = slice.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT cache_key, target_lang, title, summary, body FROM article_translations WHERE target_lang = ? AND cache_key IN (${placeholders})`,
      )
      .all(targetLang, ...slice) as CachedTranslationRow[];
    for (const r of rows) {
      map.set(r.cache_key, r);
    }
  }
  return map;
}

function saveTranslationRow(
  cacheKey: string,
  targetLang: 'en' | 'hi',
  title: string,
  summary: string,
  body: string,
  provider: string,
): void {
  try {
    db.prepare(`
      INSERT INTO article_translations (cache_key, target_lang, title, summary, body, provider, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(cache_key) DO UPDATE SET
        title = COALESCE(NULLIF(excluded.title, ''), article_translations.title),
        summary = COALESCE(NULLIF(excluded.summary, ''), article_translations.summary),
        body = CASE WHEN excluded.body != '' THEN excluded.body ELSE article_translations.body END,
        provider = excluded.provider
    `).run(cacheKey, targetLang, title, summary, body, provider);
  } catch {
    // Do not fail request if cache write fails
  }
}

function applyTranslatedFields<T extends TranslatableNewsItem>(
  item: T,
  translated: { title?: string; summary?: string; body?: string },
  targetLang: 'en' | 'hi',
): T {
  const nextTitle = translated.title || item.title;
  const nextSummary = translated.summary || item.summary || nextTitle;
  const fallbackBody = buildLocalizedBody(nextSummary, [], String(item.source_name || ''), targetLang);
  const nextBody = translated.body || fallbackBody;

  return {
    ...item,
    title: nextTitle,
    summary: nextSummary,
    ...(typeof item.content === 'string' ? { content: nextBody } : {}),
    ...(typeof item.detailed_body === 'string' ? { detailed_body: nextBody } : {}),
    language: targetLang,
  };
}

/**
 * Synchronously apply any already-cached translations from SQLite without network I/O.
 */
export function applyCachedTranslationsSync<T extends TranslatableNewsItem>(
  items: T[],
  targetLang: TargetLanguage,
): T[] {
  if (targetLang === 'all' || items.length === 0) return items;
  const keys = items.map((it) => makeCacheKey(targetLang, it.title, String(it.summary || '')));
  const cacheMap = readCachedRows(keys, targetLang);

  return items.map((it, idx) => {
    if (!needsTranslation(it, targetLang)) return it;
    const hit = cacheMap.get(keys[idx]);
    if (!hit || !hit.title) return it;
    return applyTranslatedFields(it, { title: hit.title, summary: hit.summary, body: hit.body }, targetLang);
  });
}

/**
 * Translate a slice of canonical news items into `targetLang` ('hi' or 'en'),
 * preserving the EXACT same stories and order while caching every translation in SQLite.
 */
export async function translateNewsItems<T extends TranslatableNewsItem>(
  items: T[],
  targetLang: TargetLanguage,
  options?: { translateBody?: boolean; maxLive?: number },
): Promise<T[]> {
  if (targetLang === 'all' || items.length === 0) return items;

  const translateBody = Boolean(options?.translateBody);
  const maxLive = Math.max(0, options?.maxLive ?? 24);
  const keys = items.map((it) => makeCacheKey(targetLang, it.title, String(it.summary || '')));
  const cacheMap = readCachedRows(keys, targetLang);

  const pendingIndices: number[] = [];
  items.forEach((it, idx) => {
    if (!needsTranslation(it, targetLang)) return;
    const hit = cacheMap.get(keys[idx]);
    if (!hit || !hit.title || (translateBody && !hit.body)) {
      pendingIndices.push(idx);
    }
  });

  const liveQueue = pendingIndices.slice(0, maxLive);

  if (liveQueue.length > 0) {
    // 1. Try Gemini batch translation first if configured
    const geminiInputs = liveQueue.map((idx) => {
      const it = items[idx];
      const rawBody = String(it.detailed_body || it.content || '');
      const { extraParagraphs } = stripBoilerplateEnglishTail(rawBody, String(it.summary || ''));
      return {
        idx,
        cacheKey: keys[idx],
        title: it.title,
        summary: String(it.summary || ''),
        bodyText: translateBody ? extraParagraphs.slice(0, 3).join('\n\n') : '',
      };
    });

    const geminiOut = await translateBatchViaGemini(
      geminiInputs.slice(0, 15),
      targetLang,
    );

    const remainingAfterGemini: typeof geminiInputs = [];
    for (const entry of geminiInputs) {
      const gem = geminiOut?.get(entry.cacheKey);
      if (gem) {
        const extraParas = gem.body ? gem.body.split(/\n+/).map((p) => p.trim()).filter(Boolean) : [];
        const fullBody = buildLocalizedBody(
          gem.summary,
          extraParas,
          String(items[entry.idx].source_name || ''),
          targetLang,
        );
        cacheMap.set(entry.cacheKey, {
          cache_key: entry.cacheKey,
          target_lang: targetLang,
          title: gem.title,
          summary: gem.summary,
          body: fullBody,
        });
        saveTranslationRow(entry.cacheKey, targetLang, gem.title, gem.summary, fullBody, 'gemini');
      } else {
        remainingAfterGemini.push(entry);
      }
    }

    // 2. Fallback to fast MyMemory cached translation for any remaining entries
    if (remainingAfterGemini.length > 0) {
      await runWithConcurrency(
        remainingAfterGemini.map((entry) => async () => {
          const item = items[entry.idx];
          const existing = inflightRequests.get(entry.cacheKey);
          if (existing) {
            const done = await existing;
            cacheMap.set(entry.cacheKey, {
              cache_key: entry.cacheKey,
              target_lang: targetLang,
              ...done,
            });
            return;
          }

          const task = (async () => {
            const cached = cacheMap.get(entry.cacheKey);
            let tTitle = cached?.title || '';
            let tSummary = cached?.summary || '';

            const cleanSum = entry.summary.trim();
            if (!tTitle || !tSummary) {
              if (cleanSum && cleanSum !== entry.title && entry.title.length + cleanSum.length <= 390) {
                const combined = await translateViaMyMemory(`${entry.title}\n|||\n${cleanSum}`, targetLang);
                const split = combined.split(/\s*\|\|\|\s*/);
                if (split.length >= 2 && split[0].trim() && split[1].trim()) {
                  tTitle = split[0].trim();
                  tSummary = split.slice(1).join(' ').trim();
                }
              }
              if (!tTitle) {
                tTitle = await translateViaMyMemory(entry.title, targetLang);
              }
              if (!tSummary) {
                tSummary =
                  !cleanSum || cleanSum === entry.title
                    ? tTitle
                    : await translateViaMyMemory(cleanSum.slice(0, 750), targetLang);
              }
            }

            let tExtras: string[] = [];
            if (translateBody && entry.bodyText) {
              const paras = entry.bodyText.split(/\n+/).map((p) => p.trim()).filter(Boolean).slice(0, 3);
              tExtras = await Promise.all(paras.map((p) => translateViaMyMemory(p.slice(0, 650), targetLang)));
            }

            const finalBody = buildLocalizedBody(
              tSummary || tTitle,
              tExtras,
              String(item.source_name || ''),
              targetLang,
            );
            const result = {
              title: tTitle || entry.title,
              summary: tSummary || entry.summary || tTitle || entry.title,
              body: finalBody,
            };
            saveTranslationRow(entry.cacheKey, targetLang, result.title, result.summary, result.body, 'mymemory');
            return result;
          })();

          inflightRequests.set(entry.cacheKey, task);
          try {
            const done = await task;
            cacheMap.set(entry.cacheKey, {
              cache_key: entry.cacheKey,
              target_lang: targetLang,
              ...done,
            });
          } finally {
            inflightRequests.delete(entry.cacheKey);
          }
        }),
        6,
      );
    }
  }

  return items.map((it, idx) => {
    if (!needsTranslation(it, targetLang)) return it;
    const hit = cacheMap.get(keys[idx]);
    if (!hit || !hit.title) return it;
    return applyTranslatedFields(it, { title: hit.title, summary: hit.summary, body: hit.body }, targetLang);
  });
}
