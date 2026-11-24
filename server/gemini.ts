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

export type ReaderAiMode = 'summary' | 'explain' | 'student' | 'points' | 'translate' | 'compare' | 'qa';

export async function runPublicReaderAiTool(input: {
  mode: ReaderAiMode;
  article: {
    id: string;
    title: string;
    summary: string;
    content: string;
    source_name: string;
    source_url: string;
    language: 'en' | 'hi';
    published_at: string;
  };
  question?: string;
  targetLanguage?: 'en' | 'hi';
  relatedSources?: Array<{ title: string; slug: string; source_name: string; summary: string; published_at: string }>;
}): Promise<{
  mode: ReaderAiMode;
  answer: string;
  bullets: string[];
  citations: Array<{ title: string; slug: string; source_name: string }>;
  groundedWithGemini: boolean;
}> {
  const ai = getGeminiClient();
  const started = Date.now();
  const related = input.relatedSources || [];
  const citations = related.map((r) => ({ title: r.title, slug: r.slug, source_name: r.source_name }));

  const fallbackResult = () => {
    const sentences = (input.article.content || input.article.summary)
      .split(/(?<=[.।!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (input.mode === 'points') {
      return {
        mode: input.mode,
        answer: `Key points extracted from ${input.article.source_name}:`,
        bullets: sentences.slice(0, 5),
        citations,
        groundedWithGemini: false,
      };
    }
    if (input.mode === 'compare') {
      return {
        mode: input.mode,
        answer:
          related.length > 0
            ? `Found ${related.length} additional report(s) in Maheep Media covering related aspects of this story. Review the linked sources below to compare coverage.`
            : 'No additional multi-source reports matched this specific story yet.',
        bullets: related.map((r) => `${r.source_name}: ${r.title}`),
        citations,
        groundedWithGemini: false,
      };
    }
    return {
      mode: input.mode,
      answer: `${input.article.summary}${sentences[0] && sentences[0] !== input.article.summary ? ` ${sentences[0]}` : ''}`,
      bullets: sentences.slice(0, 3),
      citations,
      groundedWithGemini: false,
    };
  };

  if (!ai) {
    return fallbackResult();
  }

  const contextBlock = `Title: ${input.article.title}
Published: ${input.article.published_at}
Primary Source: ${input.article.source_name} ${input.article.source_url ? `(${input.article.source_url})` : ''}
Language: ${input.article.language}
Summary: ${input.article.summary}
Body: ${(input.article.content || input.article.summary).slice(0, 4200)}
${related.length > 0 ? `\nRelated Published Reports on Portal:\n${related.map((r, i) => `${i + 1}. [${r.source_name}] ${r.title} — ${r.summary}`).join('\n')}` : ''}`;

  const promptByMode: Record<ReaderAiMode, string> = {
    summary: 'Summarize this news report in under 80 words (30-second read) plus 3 crisp bullet takeaways strictly from the provided report.',
    explain: 'Explain what this news means and why it matters in clear, everyday plain language without jargon, strictly from the provided facts.',
    student: 'Explain this news for a college/competitive-exam student in India: highlight key institutions, policy terms, dates, or concepts strictly present in the report.',
    points: 'Extract up to 5 verifiable key facts, dates, figures, and named stakeholders from this report as concise bullets.',
    translate: `Translate the headline and key summary accurately into ${input.targetLanguage === 'hi' || input.article.language === 'en' ? 'Hindi (Devanagari)' : 'English'} keeping factual fidelity.`,
    compare: 'Compare how this main report and the linked related portal reports cover this event, highlighting distinct focus areas and naming each source.',
    qa: `Answer this reader question using ONLY facts explicitly written in the article and related reports: "${(input.question || '').slice(0, 300)}". If the report does not contain the answer, clearly say so.`,
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `${contextBlock}\n\nTask: ${promptByMode[input.mode]}`,
      config: {
        systemInstruction: EDITORIAL_GUARDRAIL,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answer: { type: Type.STRING },
            bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['answer', 'bullets'],
        },
      },
    });
    const text = (response.text ?? '{}').trim();
    const parsed = JSON.parse(text) as { answer?: string; bullets?: string[] };
    logAiUsage({
      action: `reader_${input.mode}`,
      articleId: input.article.id,
      actorEmail: 'public_reader',
      status: 'success',
      latencyMs: Date.now() - started,
      inputChars: contextBlock.length,
      outputChars: text.length,
      resultSummary: `Reader AI tool (${input.mode})`,
    });
    return {
      mode: input.mode,
      answer: parsed.answer || input.article.summary,
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [],
      citations,
      groundedWithGemini: true,
    };
  } catch {
    return fallbackResult();
  }
}

export async function askMaheepAi(input: {
  query: string;
  language: 'all' | 'en' | 'hi';
  candidates: Array<{
    id: string;
    title: string;
    slug: string;
    summary: string;
    source_name: string;
    published_at: string;
    category_name?: string;
    state_name?: string;
  }>;
}): Promise<{
  answer: string;
  sources: Array<{ id: string; title: string; slug: string; source_name: string; published_at: string; category_name?: string }>;
  groundedWithGemini: boolean;
}> {
  const sources = input.candidates.slice(0, 6).map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    source_name: c.source_name,
    published_at: c.published_at,
    category_name: c.category_name,
  }));

  if (input.candidates.length === 0) {
    return {
      answer:
        input.language === 'hi'
          ? 'माफ़ कीजिए, इस विषय पर पोर्टल में अभी कोई प्रकाशित समाचार उपलब्ध नहीं मिला। कृपया दूसरे शब्द या राज्य के नाम से खोजें।'
          : 'No published reports matching that specific query were found in Maheep News Portal yet. Try searching another city, state, or topic.',
      sources: [],
      groundedWithGemini: false,
    };
  }

  const ai = getGeminiClient();
  if (!ai) {
    const lines = sources.map((s, idx) => `${idx + 1}. ${s.title} (${s.source_name})`).join('\n');
    return {
      answer: `Here are the latest published reports matching "${input.query}" from Maheep News Portal:\n\n${lines}`,
      sources,
      groundedWithGemini: false,
    };
  }

  const started = Date.now();
  const context = input.candidates
    .slice(0, 6)
    .map(
      (c, i) =>
        `[${i + 1}] Title: ${c.title}\nSource: ${c.source_name}\nCategory: ${c.category_name || 'News'}${c.state_name ? ` | State: ${c.state_name}` : ''}\nDate: ${c.published_at}\nSummary: ${c.summary}`,
    )
    .join('\n\n');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Reader Question: "${input.query}"\nPreferred Response Language: ${input.language === 'hi' ? 'Hindi (Devanagari)' : 'English'}\n\nPublished Maheep Portal Reports:\n${context}\n\nWrite a concise, objective answer summarizing ONLY the published reports above. Cite source names in brackets like [Source] and do not add outside claims.`,
      config: {
        systemInstruction: EDITORIAL_GUARDRAIL,
      },
    });
    const text = (response.text ?? '').trim();
    logAiUsage({
      action: 'ask_maheep_ai',
      actorEmail: 'public_reader',
      status: 'success',
      latencyMs: Date.now() - started,
      inputChars: context.length,
      outputChars: text.length,
      resultSummary: `Ask AI query (${sources.length} citations)`,
    });
    return {
      answer: text || `Found ${sources.length} published reports for "${input.query}".`,
      sources,
      groundedWithGemini: true,
    };
  } catch {
    return {
      answer: `Here are the top published reports matching "${input.query}" on Maheep News Portal.`,
      sources,
      groundedWithGemini: false,
    };
  }
}

export async function generateDailyBriefingScript(input: {
  articles: Array<{ title: string; summary: string; category_name?: string; source_name: string }>;
  language: 'en' | 'hi';
}): Promise<{ intro: string; bulletScript: string[]; closing: string; groundedWithGemini: boolean }> {
  const picks = input.articles.slice(0, 6);
  const fallback = {
    intro:
      input.language === 'hi'
        ? 'नमस्कार, महीप न्यूज़ पोर्टल के 60-सेकंड दैनिक समाचार बुलेटिन में आपका स्वागत है।'
        : 'Welcome to the Maheep News Portal 60-Second Daily Briefing.',
    bulletScript: picks.map((p) => `${p.title}. ${p.summary}`),
    closing:
      input.language === 'hi'
        ? 'अधिक विस्तार से पढ़ने के लिए महीप न्यूज़ पोर्टल और दैनिक ई-पेपर देखें।'
        : 'Read full reports and today’s digital broadsheet on Maheep News Portal.',
    groundedWithGemini: false,
  };

  const ai = getGeminiClient();
  if (!ai || picks.length === 0) return fallback;

  const context = picks
    .map((p, i) => `${i + 1}. [${p.category_name || 'News'} / ${p.source_name}] ${p.title} — ${p.summary}`)
    .join('\n');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Convert these top headlines into a crisp 60-second spoken news bulletin in ${input.language === 'hi' ? 'Hindi (Devanagari)' : 'English'}. Preserve all facts faithfully.\n\n${context}`,
      config: {
        systemInstruction: EDITORIAL_GUARDRAIL,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intro: { type: Type.STRING },
            bulletScript: { type: Type.ARRAY, items: { type: Type.STRING } },
            closing: { type: Type.STRING },
          },
          required: ['intro', 'bulletScript', 'closing'],
        },
      },
    });
    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      intro?: string;
      bulletScript?: string[];
      closing?: string;
    };
    return {
      intro: parsed.intro || fallback.intro,
      bulletScript: Array.isArray(parsed.bulletScript) && parsed.bulletScript.length > 0 ? parsed.bulletScript : fallback.bulletScript,
      closing: parsed.closing || fallback.closing,
      groundedWithGemini: true,
    };
  } catch {
    return fallback;
  }
}

