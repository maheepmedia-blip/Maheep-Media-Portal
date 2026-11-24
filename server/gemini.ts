import { GoogleGenAI, Type } from '@google/genai';

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
  language?: 'en' | 'hi';
  existingTitles?: string[];
}

const EDITORIAL_GUARDRAIL =
  'You are the editorial assistant for Maheep News Portal (India). Strictly preserve factual meaning. Never invent quotes, statistics, named sources, or unverified claims. Only work from the provided headline and text.';

export async function runEditorialAiAssist(input: AiAssistInput) {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please configure it in Settings > Secrets to enable AI News Assistant tools.',
    );
  }

  const sourceText = `Language: ${input.language || 'en'}\nHeadline: ${input.title}\nSummary: ${input.summary || ''}\nContent: ${(input.content || '').slice(0, 4000)}`;

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
    const parsed = JSON.parse((response.text ?? '{"headlines":[]}').trim());
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
    return JSON.parse((response.text ?? '{}').trim());
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
    return JSON.parse((response.text ?? '{}').trim());
  }

  if (input.action === 'check_quality') {
    const existingList = (input.existingTitles || []).slice(0, 20).join('\n- ');
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `${sourceText}\n\nRecent portal headlines:\n- ${existingList}\n\nAudit this article for incomplete metadata, factual clarity, and potential duplicate overlap with recent headlines.`,
      config: {
        systemInstruction: EDITORIAL_GUARDRAIL,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            approved: { type: Type.BOOLEAN },
            issues: { type: Type.ARRAY, items: { type: Type.STRING } },
            duplicateWarning: { type: Type.STRING },
          },
          required: ['approved', 'issues', 'duplicateWarning'],
        },
      },
    });
    return JSON.parse((response.text ?? '{}').trim());
  }

  if (input.action === 'draft_intro') {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `${sourceText}\n\nDraft a crisp 2-sentence neutral newspaper lead introduction in ${input.language === 'hi' ? 'Hindi' : 'English'} strictly grounded in the provided facts.`,
      config: {
        systemInstruction: EDITORIAL_GUARDRAIL,
      },
    });
    return { text: (response.text ?? '').trim(), aiMarked: true };
  }

  // Default: summarize
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `${sourceText}\n\nWrite a concise 2-3 sentence factual news summary in ${input.language === 'hi' ? 'Hindi' : 'English'}.`,
    config: {
      systemInstruction: EDITORIAL_GUARDRAIL,
    },
  });
  return { summary: (response.text ?? '').trim(), aiMarked: true };
}
