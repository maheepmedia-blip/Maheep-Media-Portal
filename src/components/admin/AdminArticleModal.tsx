import { Sparkles, Upload, X } from 'lucide-react';
import React, { useState } from 'react';
import type { Article, Category, StateItem } from '../../types/news.ts';

interface AdminArticleModalProps {
  article: Partial<Article> | null;
  categories: Category[];
  states: StateItem[];
  token: string;
  onClose: () => void;
  onSaved: () => void;
}

export function AdminArticleModal({
  article,
  categories,
  states,
  token,
  onClose,
  onSaved,
}: AdminArticleModalProps) {
  const isEdit = Boolean(article?.id);
  const [title, setTitle] = useState(article?.title || '');
  const [summary, setSummary] = useState(article?.summary || '');
  const [content, setContent] = useState(article?.content || '');
  const [imageUrl, setImageUrl] = useState(article?.image_url || '');
  const [sourceName, setSourceName] = useState(article?.source_name || 'Maheep News Desk');
  const [sourceUrl, setSourceUrl] = useState(article?.source_url || '');
  const [author, setAuthor] = useState(article?.author || 'Maheep Editorial Desk');
  const [language, setLanguage] = useState<'en' | 'hi'>(article?.language === 'hi' ? 'hi' : 'en');
  const [categoryId, setCategoryId] = useState(article?.category_id || categories[0]?.id || 'cat-national');
  const [stateId, setStateId] = useState(article?.state_id || '');
  const [subtopic, setSubtopic] = useState(article?.subtopic || '');
  const [status, setStatus] = useState<'draft' | 'pending' | 'published' | 'archived'>(article?.status || 'draft');
  const [featured, setFeatured] = useState(Boolean(article?.featured));
  const [breaking, setBreaking] = useState(Boolean(article?.breaking));

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiBusy, setAiBusy] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiNotice, setAiNotice] = useState('');
  const [error, setError] = useState('');

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setImageUrl(json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const runAi = async (
    action: 'summarize' | 'suggest_headlines' | 'suggest_category' | 'translate' | 'check_quality' | 'draft_intro',
  ) => {
    if (!title.trim()) {
      setError('Enter a headline first so the AI assistant can review it.');
      return;
    }
    setAiBusy(action);
    setError('');
    setAiNotice('');
    setAiSuggestions([]);

    try {
      const res = await fetch('/api/ai/assist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, title, summary, content, language }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'AI request failed');

      const result = json.result;
      if (action === 'summarize' && result.summary) {
        setSummary(result.summary);
        setAiNotice('AI generated a concise factual summary (marked for editorial review).');
      } else if (action === 'suggest_headlines' && Array.isArray(result.headlines)) {
        setAiSuggestions(result.headlines);
        setAiNotice('Click any suggested headline below to apply it.');
      } else if (action === 'suggest_category') {
        const cat = categories.find((c) => c.slug === result.categorySlug);
        if (cat) setCategoryId(cat.id);
        if (result.stateName) {
          const st = states.find((s) => s.name.toLowerCase() === String(result.stateName).toLowerCase());
          if (st) setStateId(st.id);
        }
        setAiNotice(`Suggested category: ${result.categorySlug}${result.stateName ? ` · State: ${result.stateName}` : ''} (${result.reason})`);
      } else if (action === 'translate') {
        if (result.translatedTitle) setTitle(result.translatedTitle);
        if (result.translatedSummary) setSummary(result.translatedSummary);
        setLanguage(language === 'hi' ? 'en' : 'hi');
        setAiNotice(`Translated to ${result.targetLanguage}. Please verify names and terminology.`);
      } else if (action === 'draft_intro' && result.text) {
        setContent((prev) => (prev ? `${result.text}\n\n${prev}` : result.text));
        setAiNotice('Added factual lead introduction paragraph.');
      } else if (action === 'check_quality') {
        const issues = Array.isArray(result.issues) && result.issues.length ? result.issues.join('; ') : 'No metadata gaps detected.';
        setAiNotice(
          `Quality check: ${result.approved ? 'Ready' : 'Needs Review'} — ${issues}${
            result.duplicateWarning ? ` | Duplicate check: ${result.duplicateWarning}` : ''
          }`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI assistant error');
    } finally {
      setAiBusy('');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = isEdit ? `/api/admin/articles/${article?.id}` : '/api/admin/articles';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          summary,
          content,
          image_url: imageUrl,
          source_name: sourceName,
          source_url: sourceUrl,
          author,
          language,
          category_id: categoryId,
          state_id: stateId || null,
          subtopic,
          status,
          featured,
          breaking,
          ai_assisted: Boolean(aiNotice),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save article');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-neutral-950 dark:text-white">
            {isEdit ? 'Edit News Article' : 'Create New Article'}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* AI Editorial Assistant Toolbar */}
          <div className="p-4 rounded-lg bg-[#EAF5E5]/70 dark:bg-[#00451F]/30 border border-[#00652E]/20 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[#00451F] dark:text-[#4ade80]">
              <Sparkles className="w-4 h-4" />
              <span>AI News Assistant (Factual Guardrails Active)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                ['summarize', 'Summarize'],
                ['suggest_headlines', 'Suggest Headlines'],
                ['suggest_category', 'Auto-Categorize'],
                ['translate', language === 'hi' ? 'Translate → English' : 'Translate → हिन्दी'],
                ['draft_intro', 'Draft Intro'],
                ['check_quality', 'Quality & Duplicate Check'],
              ] as const).map(([act, label]) => (
                <button
                  key={act}
                  type="button"
                  disabled={Boolean(aiBusy)}
                  onClick={() => runAi(act)}
                  className="px-3 py-1.5 rounded bg-white dark:bg-neutral-900 border border-[#00652E]/30 text-xs font-semibold text-[#00652E] dark:text-[#4ade80] hover:bg-[#00652E] hover:text-white transition-colors disabled:opacity-50"
                >
                  {aiBusy === act ? 'Working...' : label}
                </button>
              ))}
            </div>
            {aiNotice && <p className="text-xs text-[#00451F] dark:text-[#EAF5E5] font-medium">{aiNotice}</p>}
            {aiSuggestions.length > 0 && (
              <div className="space-y-1 pt-1">
                {aiSuggestions.map((h, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setTitle(h);
                      setAiSuggestions([]);
                    }}
                    className="block w-full text-left text-xs px-3 py-1.5 rounded bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 hover:border-[#00652E]"
                  >
                    Use: {h}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold mb-1">Headline (English or Hindi) *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Short Summary *</label>
            <textarea
              required
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Full Article Body</label>
            <textarea
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'en' | 'hi')}
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी (Hindi)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Category</label>
              <select
                value={categoryId || ''}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Indian State / UT (Optional)</label>
              <select
                value={stateId || ''}
                onChange={(e) => setStateId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              >
                <option value="">All India / None</option>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Author</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Source Name</label>
              <input
                type="text"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Subtopic (e.g. Cricket, Defence)</label>
              <input
                type="text"
                value={subtopic}
                onChange={(e) => setSubtopic(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Hero Image URL or Upload</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="/uploads/... or https://..."
                  className="flex-1 px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                />
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 text-xs font-semibold cursor-pointer hover:border-[#00652E]">
                  <Upload className="w-3.5 h-3.5" />
                  {uploading ? '...' : 'Upload'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageUpload} className="hidden" />
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Original Source Attribution URL</label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <div className="flex flex-wrap items-center gap-5">
              <div>
                <label className="text-xs font-semibold mr-2">Status:</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'draft' | 'pending' | 'published' | 'archived')}
                  className="px-3 py-1.5 text-xs font-semibold rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                >
                  <option value="draft">Draft</option>
                  <option value="pending">Pending Review</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
                Featured Story
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer text-[#DF2525]">
                <input type="checkbox" checked={breaking} onChange={(e) => setBreaking(e.target.checked)} />
                Breaking Ticker
              </label>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-md bg-[#00652E] hover:bg-[#00451F] text-white text-xs font-semibold disabled:opacity-60"
              >
                {saving ? 'Saving...' : isEdit ? 'Update Article' : 'Save Article'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
