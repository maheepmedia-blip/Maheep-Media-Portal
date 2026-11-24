import crypto from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';
import { db } from './db.ts';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isGeminiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
}

export type AiAssistAction =
  | 'summarize'
  | 'suggest_headlines'
  | 'suggest_category'
  | 'translate'
  | 'check_quality'
  | 'draft_intro';

export interface AiAssistInput {
  action: AiAssistAction;
  title: string;
  summary?: string;
  content?: string;
  sourceName?: string;
  sourceUrl?: string;
  language?: 'en' | 'hi';
  existingTitles?: string[];
  articleId?: string;
  actorEmail?: string;
}

const EDITORIAL_GUARDRAIL =
  'You are the editorial assistant for Maheep News Portal (India). Strictly preserve factual meaning. Never invent quotes, statistics, named sources, or unverified claims. Never claim to have performed independent fact-checking. Only inspect and process the provided headline, summary, body, and attribution fields.';

function logAiUsage(entry: {
  action: string;
  articleId?: string;
  actorEmail?: string;
  status: 'success' | 'failed';
  latencyMs: number;
  inputChars: number;
  outputChars: number;
  resultSummary: string;
}): void {
  try {
    db.prepare(`
      INSERT INTO ai_usage_logs (
        id, action, article_id, actor_email, model, status, latency_ms, input_chars, output_chars, result_summary
      ) VALUES (?, ?, ?, ?, 'gemini-4-hydrogen', ?, ?, ?, ?, ?)
    `).run(
      `ai-${crypto.randomUUID().slice(0, 10)}`,
      entry.action,
      entry.articleId || '',
      entry.actorEmail || 'editorial',
      entry.status,
      entry.latencyMs,
      entry.inputChars,
      entry.outputChars,
      entry.resultSummary.slice(0, 300),
    );
  } catch {
    // Do not block workflows on audit log insert failure
  }
}

export async function runEditorialAiAssist(input: AiAssistInput) {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please configure it in Settings > Secrets to enable AI News Assistant tools.',
    );
  }

  const started = Date.now();
  const sourceText = `Language: ${input.language || 'en'}
Headline: ${input.title}
Summary: ${input.summary || ''}
Source Name: ${input.sourceName || ''}
Source URL: ${input.sourceUrl || ''}
Content: ${(input.content || '').slice(0, 4500)}`;

  try {
    if (input.action === 'suggest_headlines') {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `${sourceText}\n\nProvide 3 concise, factual newspaper headlines in ${input.language === 'hi' ? 'Hindi (Devanagari)' : 'English'} that accurately reflect the story without exaggeration.`,
        config: {
          systemInstruction: EDITORIAL_GUARDRAIL,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headlines: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['headlines'],
          },
        },
      });
      const text = (response.text ?? '{"headlines":[]}').trim();
      const parsed = JSON.parse(text);
      logAiUsage({
        action: input.action,
        articleId: input.articleId,
        actorEmail: input.actorEmail,
        status: 'success',
        latencyMs: Date.now() - started,
        inputChars: sourceText.length,
        outputChars: text.length,
        resultSummary: `Generated ${(parsed.headlines || []).length} headlines`,
      });
      return { headlines: parsed.headlines || [], aiMarked: true };
    }

    if (input.action === 'suggest_category') {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `${sourceText}\n\nClassify into one primary category slug from: national, international, state, business, sports, technology, education, science, entertainment, editorial. Also identify the Indian state or UT name if clearly mentioned, or empty string.`,
        config: {
          systemInstruction: EDITORIAL_GUARDRAIL,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              categorySlug: { type: Type.STRING },
              stateName: { type: Type.STRING },
              reason: { type: Type.STRING },
            },
            required: ['categorySlug', 'stateName', 'reason'],
          },
        },
      });
      const text = (response.text ?? '{}').trim();
      const parsed = JSON.parse(text);
      logAiUsage({
        action: input.action,
        articleId: input.articleId,
        actorEmail: input.actorEmail,
        status: 'success',
        latencyMs: Date.now() - started,
        inputChars: sourceText.length,
        outputChars: text.length,
        resultSummary: `Suggested ${parsed.categorySlug || 'national'}`,
      });
      return parsed;
    }

    if (input.action === 'translate') {
      const targetLang = input.language === 'hi' ? 'English' : 'Hindi (Devanagari script)';
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `${sourceText}\n\nTranslate the headline and summary accurately into ${targetLang} in journalistic newspaper register.`,
        config: {
          systemInstruction: EDITORIAL_GUARDRAIL,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translatedTitle: { type: Type.STRING },
              translatedSummary: { type: Type.STRING },
              targetLanguage: { type: Type.STRING },
            },
            required: ['translatedTitle', 'translatedSummary', 'targetLanguage'],
          },
        },
      });
      const text = (response.text ?? '{}').trim();
      const parsed = JSON.parse(text);
      logAiUsage({
        action: input.action,
        articleId: input.articleId,
        actorEmail: input.actorEmail,
        status: 'success',
        latencyMs: Date.now() - started,
        inputChars: sourceText.length,
        outputChars: text.length,
        resultSummary: `Translated to ${targetLang}`,
      });
      return parsed;
    }

    if (input.action === 'check_quality') {
      const existingList = (input.existingTitles || []).slice(0, 20).join('\n- ');
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `${sourceText}\n\nRecent portal headlines:\n- ${existingList}\n\nPerform an advisory editorial audit (NOT fact verification):
1. Check for missing metadata or missing context (who/when/where).
2. Flag sensational, speculative, or non-neutral phrasing.
3. Check whether a named source and attribution URL are present.
4. Check for duplicate overlap against recent headlines.`,
        config: {
          systemInstruction: EDITORIAL_GUARDRAIL,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              approved: { type: Type.BOOLEAN },
              issues: { type: Type.ARRAY, items: { type: Type.STRING } },
              neutralityWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
              missingInfo: { type: Type.ARRAY, items: { type: Type.STRING } },
              attributionCheck: { type: Type.STRING },
              duplicateWarning: { type: Type.STRING },
            },
            required: ['approved', 'issues', 'neutralityWarnings', 'missingInfo', 'attributionCheck', 'duplicateWarning'],
          },
        },
      });
      const text = (response.text ?? '{}').trim();
      const parsed = JSON.parse(text);
      logAiUsage({
        action: input.action,
        articleId: input.articleId,
        actorEmail: input.actorEmail,
        status: 'success',
        latencyMs: Date.now() - started,
        inputChars: sourceText.length,
        outputChars: text.length,
        resultSummary: `Audit ${parsed.approved ? 'ready' : 'needs review'} (${(parsed.issues || []).length} issues)`,
      });
      return { ...parsed, advisoryNote: 'AI Editorial Assistance only — requires human editor sign-off.' };
    }

    if (input.action === 'draft_intro') {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `${sourceText}\n\nDraft a crisp 2-sentence neutral newspaper lead introduction in ${input.language === 'hi' ? 'Hindi' : 'English'} strictly grounded in the provided facts.`,
        config: {
          systemInstruction: EDITORIAL_GUARDRAIL,
        },
      });
      const text = (response.text ?? '').trim();
      logAiUsage({
        action: input.action,
        articleId: input.articleId,
        actorEmail: input.actorEmail,
        status: 'success',
        latencyMs: Date.now() - started,
        inputChars: sourceText.length,
        outputChars: text.length,
        resultSummary: 'Drafted factual lead intro',
      });
      return { text, aiMarked: true };
    }

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `${sourceText}\n\nWrite a concise 2-3 sentence factual news summary in ${input.language === 'hi' ? 'Hindi' : 'English'}.`,
      config: {
        systemInstruction: EDITORIAL_GUARDRAIL,
      },
    });
    const text = (response.text ?? '').trim();
    logAiUsage({
      action: input.action,
      articleId: input.articleId,
      actorEmail: input.actorEmail,
      status: 'success',
      latencyMs: Date.now() - started,
      inputChars: sourceText.length,
      outputChars: text.length,
      resultSummary: 'Generated factual summary',
    });
    return { summary: text, aiMarked: true };
  } catch (err) {
    logAiUsage({
      action: input.action,
      articleId: input.articleId,
      actorEmail: input.actorEmail,
      status: 'failed',
      latencyMs: Date.now() - started,
      inputChars: sourceText.length,
      outputChars: 0,
      resultSummary: err instanceof Error ? err.message : 'AI error',
    });
    throw err;
  }
}

export async function runPendingArticlesAiAudit(limit = 5): Promise<{
  checked: number;
  skippedNoKey: boolean;
}> {
  if (!isGeminiConfigured()) {
    return { checked: 0, skippedNoKey: true };
  }

  const pending = db
    .prepare(`
      SELECT id, title, summary, content, source_name, source_url, language
      FROM articles
      WHERE status = 'pending' AND (ai_audit_json IS NULL OR ai_audit_json = '' OR ai_audit_json = '{}')
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(limit) as Array<{
    id: string;
    title: string;
    summary: string;
    content: string;
    source_name: string;
    source_url: string;
    language: 'en' | 'hi';
  }>;

  if (pending.length === 0) {
    return { checked: 0, skippedNoKey: false };
  }

  const recentTitles = (
    db.prepare('SELECT title FROM articles ORDER BY created_at DESC LIMIT 20').all() as Array<{ title: string }>
  ).map((r) => r.title);

  let checked = 0;
  for (const art of pending) {
    try {
      const audit = await runEditorialAiAssist({
        action: 'check_quality',
        articleId: art.id,
        actorEmail: 'cron:ai_audit',
        title: art.title,
        summary: art.summary,
        content: art.content,
        sourceName: art.source_name,
        sourceUrl: art.source_url,
        language: art.language,
        existingTitles: recentTitles,
      });

      // Strictly store advisory metadata — never automatically flip pending -> published
      db.prepare(`
        UPDATE articles
        SET ai_audit_json = ?, ai_assisted = 1, updated_at = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify({ ...audit, checkedAt: new Date().toISOString() }), art.id);
      checked++;
    } catch {
      // Leave unaudited for next cycle without blocking queue
    }
  }

  return { checked, skippedNoKey: false };
}
