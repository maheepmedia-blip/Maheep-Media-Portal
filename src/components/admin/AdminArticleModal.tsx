import { Calendar, Eye, History, RotateCcw, Sparkles, Upload, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { Article, ArticleRevision, Category, StateItem } from '../../types/news.ts';
import { formatIndiaDateTime } from '../../utils/date.ts';

interface AdminArticleModalProps {
  article: Partial<Article> | null;
  categories: Category[];
  states: StateItem[];
  token: string;
  onClose: () => void;
  onSaved: () => void;
}

function isoToIstInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function istInputToIso(val: string): string | null {
  if (!val.trim()) return null;
  const d = new Date(`${val.trim()}:00+05:30`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
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
  const [scheduledIst, setScheduledIst] = useState(() => isoToIstInput(article?.scheduled_at));
  const [unpublishIst, setUnpublishIst] = useState(() => isoToIstInput(article?.unpublish_at));
  const [changeNote, setChangeNote] = useState('');

  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'revisions'>('edit');
  const [revisions, setRevisions] = useState<ArticleRevision[]>([]);
  const [loadingRevs, setLoadingRevs] = useState(false);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiBusy, setAiBusy] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiNotice, setAiNotice] = useState('');
  const [aiAuditDetails, setAiAuditDetails] = useState<{
    approved?: boolean;
    issues?: string[];
    neutralityWarnings?: string[];
    missingInfo?: string[];
    attributionCheck?: string;
    duplicateWarning?: string;
  } | null>(() => {
    if (!article?.ai_audit_json || article.ai_audit_json === '{}') return null;
    try {
      return JSON.parse(article.ai_audit_json);
    } catch {
      return null;
    }
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (viewMode === 'revisions' && isEdit && article?.id) {
      setLoadingRevs(true);
      fetch(`/api/admin/articles/${article.id}/revisions`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((json) => setRevisions(json.revisions || []))
        .catch(() => {})
        .finally(() => setLoadingRevs(false));
    }
  }, [viewMode, isEdit, article?.id, token]);

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
        body: JSON.stringify({
          action,
          articleId: article?.id,
          title,
          summary,
          content,
          sourceName,
          sourceUrl,
          language,
        }),
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
        setAiNotice(
          `Suggested category: ${result.categorySlug}${result.stateName ? ` · State: ${result.stateName}` : ''} (${result.reason})`,
        );
      } else if (action === 'translate') {
        if (result.translatedTitle) setTitle(result.translatedTitle);
        if (result.translatedSummary) setSummary(result.translatedSummary);
        setLanguage(language === 'hi' ? 'en' : 'hi');
        setAiNotice(`Translated to ${result.targetLanguage}. Please verify names and terminology.`);
      } else if (action === 'draft_intro' && result.text) {
        setContent((prev) => (prev ? `${result.text}\n\n${prev}` : result.text));
        setAiNotice('Added factual lead introduction paragraph.');
      } else if (action === 'check_quality') {
        setAiAuditDetails(result);
        setAiNotice(
          `Advisory Quality Audit: ${result.approved ? 'Ready for Editor Sign-off' : 'Needs Editorial Attention'} (AI does not verify facts).`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI assistant error');
    } finally {
      setAiBusy('');
    }
  };

  const restoreRevision = async (revId: string) => {
    if (!article?.id) return;
    const res = await fetch(`/api/admin/articles/${article.id}/revisions/${revId}/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (res.ok && json.article) {
      setTitle(json.article.title || '');
      setSummary(json.article.summary || '');
      setContent(json.article.content || '');
      setStatus(json.article.status || 'draft');
      setViewMode('edit');
      setAiNotice('Restored selected revision into editor.');
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
          scheduled_at: istInputToIso(scheduledIst),
          unpublish_at: istInputToIso(unpublishIst),
          change_note: changeNote || undefined,
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
        <div className="sticky top-0 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-6 py-4 flex flex-wrap items-center justify-between gap-3 z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-neutral-950 dark:text-white">
              {isEdit ? 'Edit News Article' : 'Create New Article'}
            </h2>
            <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-700 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('edit')}
                className={`px-2.5 py-1 rounded ${viewMode === 'edit' ? 'bg-[#00652E] text-white' : ''}`}
              >
                Editor
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`px-2.5 py-1 rounded inline-flex items-center gap-1 ${viewMode === 'preview' ? 'bg-[#00652E] text-white' : ''}`}
              >
                <Eye className="w-3 h-3" /> Preview
              </button>
              {isEdit && (
                <button
                  type="button"
                  onClick={() => setViewMode('revisions')}
                  className={`px-2.5 py-1 rounded inline-flex items-center gap-1 ${viewMode === 'revisions' ? 'bg-[#00652E] text-white' : ''}`}
                >
                  <History className="w-3 h-3" /> Revisions
                </button>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {viewMode === 'preview' && (
          <div className="p-6 space-y-4">
            <div className="text-xs font-semibold text-[#00652E]">
              {categories.find((c) => c.id === categoryId)?.name || 'News'} · {language === 'hi' ? 'हिन्दी' : 'English'} · Status: {status.toUpperCase()}
            </div>
            <h1 className="font-editorial text-3xl font-bold leading-tight">{title || 'Untitled Headline'}</h1>
            <p className="text-base text-neutral-600 dark:text-neutral-300">{summary}</p>
            <div className="text-xs text-neutral-500">By {author} · {sourceName}</div>
            {imageUrl && (
              <img src={imageUrl} alt={title} className="w-full max-h-72 object-cover rounded border border-neutral-200 dark:border-neutral-800" />
            )}
            <div className="space-y-3 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
              {(content || summary).split(/\n+/).map((p, idx) => (
                <p key={idx}>{p}</p>
              ))}
            </div>
          </div>
        )}

        {viewMode === 'revisions' && (
          <div className="p-6 space-y-3">
            <h3 className="text-sm font-bold">Revision History</h3>
            {loadingRevs ? (
              <p className="text-xs text-neutral-500">Loading revisions...</p>
            ) : revisions.length === 0 ? (
              <p className="text-xs text-neutral-500">No previous revisions recorded yet. Revisions are saved automatically on each edit.</p>
            ) : (
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {revisions.map((rev) => (
                  <div key={rev.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-bold">{rev.title}</div>
                      <div className="text-neutral-500 mt-0.5">
                        {rev.editor_email} · {formatIndiaDateTime(rev.created_at)} · Status: {rev.status}
                        {rev.change_note ? ` · "${rev.change_note}"` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => restoreRevision(rev.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-[#00652E] text-[#00652E] font-semibold shrink-0"
                    >
                      <RotateCcw className="w-3 h-3" /> Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {viewMode === 'edit' && (
          <form onSubmit={handleSave} className="p-6 space-y-5">
            {/* AI Editorial Assistant Toolbar */}
            <div className="p-4 rounded-lg bg-[#EAF5E5]/70 dark:bg-[#00451F]/30 border border-[#00652E]/20 space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#00451F] dark:text-[#4ade80]">
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  AI News Assistant (Advisory Only — Never Verifies Facts Automatically)
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {([
                  ['summarize', 'Summarize'],
                  ['suggest_headlines', 'Suggest Headlines'],
                  ['suggest_category', 'Auto-Categorize'],
                  ['translate', language === 'hi' ? 'Translate → English' : 'Translate → हिन्दी'],
                  ['draft_intro', 'Draft Intro'],
                  ['check_quality', 'Neutrality & Attribution Audit'],
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
              {aiAuditDetails && (
                <div className="p-3 rounded bg-white/90 dark:bg-neutral-950 border border-[#00652E]/20 text-xs space-y-1">
                  <div><strong>Attribution:</strong> {aiAuditDetails.attributionCheck || 'Checked'}</div>
                  {Boolean(aiAuditDetails.neutralityWarnings?.length) && (
                    <div className="text-amber-700 dark:text-amber-400">
                      <strong>Neutrality / Tone Notes:</strong> {aiAuditDetails.neutralityWarnings?.join('; ')}
                    </div>
                  )}
                  {Boolean(aiAuditDetails.missingInfo?.length) && (
                    <div className="text-neutral-700 dark:text-neutral-300">
                      <strong>Missing Context:</strong> {aiAuditDetails.missingInfo?.join('; ')}
                    </div>
                  )}
                  {Boolean(aiAuditDetails.duplicateWarning) && (
                    <div className="text-[#DF2525]"><strong>Duplicate Warning:</strong> {aiAuditDetails.duplicateWarning}</div>
                  )}
                </div>
              )}
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

            {/* Publishing Schedule & Revision Note (Asia/Kolkata IST) */}
            <div className="p-4 rounded-lg bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="flex items-center gap-1 text-xs font-semibold mb-1">
                  <Calendar className="w-3.5 h-3.5 text-[#00652E]" />
                  Schedule Publish (IST)
                </label>
                <input
                  type="datetime-local"
                  value={scheduledIst}
                  onChange={(e) => setScheduledIst(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Auto-Unpublish At (IST, Optional)</label>
                <input
                  type="datetime-local"
                  value={unpublishIst}
                  onChange={(e) => setUnpublishIst(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                />
              </div>
              {isEdit && (
                <div>
                  <label className="block text-xs font-semibold mb-1">Revision Note</label>
                  <input
                    type="text"
                    value={changeNote}
                    onChange={(e) => setChangeNote(e.target.value)}
                    placeholder="Reason for edit..."
                    className="w-full px-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                  />
                </div>
              )}
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
        )}
      </div>
    </div>
  );
}
