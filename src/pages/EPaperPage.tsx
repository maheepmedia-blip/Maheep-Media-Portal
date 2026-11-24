import { Calendar, ChevronLeft, ChevronRight, Download, ExternalLink, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArticleImage } from '../components/ArticleImage.tsx';
import { PublicLayout } from '../components/PublicLayout.tsx';
import { SeoHead } from '../components/SeoHead.tsx';
import type { Edition, EditionPage } from '../types/news.ts';
import { downloadEditionPdf } from '../utils/pdf.ts';

export function EPaperPage() {
  const [editions, setEditions] = useState<Edition[]>([]);
  const [selectedEdition, setSelectedEdition] = useState<Edition | null>(null);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [monthFilter, setMonthFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = monthFilter ? `?month=${encodeURIComponent(monthFilter)}` : '';
    fetch(`/api/editions${qs}`)
      .then((r) => r.json())
      .then((json) => {
        const list = (json.editions || []) as Edition[];
        setEditions(list);
        if (list.length > 0) {
          setSelectedEdition(list[0]);
          setCurrentPageIdx(0);
        } else {
          setSelectedEdition(null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [monthFilter]);

  let pages: EditionPage[] = [];
  if (selectedEdition) {
    try {
      const parsed = JSON.parse(selectedEdition.content_json || '{}');
      pages = Array.isArray(parsed.pages) ? parsed.pages : [];
    } catch {
      pages = [];
    }
  }

  const activePage = pages[currentPageIdx] || pages[0];

  const handleDateChange = (dateVal: string) => {
    const found = editions.find((e) => e.edition_date === dateVal);
    if (found) {
      setSelectedEdition(found);
      setCurrentPageIdx(0);
    }
  };

  return (
    <PublicLayout>
      <SeoHead
        title="Digital E-Paper & PDF Archive — Maheep News Portal"
        description="Read today's Maheep Digital Broadsheet, browse previous editions by date and month, print A4 pages, and download PDF editions."
        canonicalPath="/epaper"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Controls Toolbar */}
        <div className="pb-6 border-b border-neutral-200 dark:border-neutral-800 flex flex-col lg:flex-row lg:items-end justify-between gap-4 no-print">
          <div>
            <p className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">ई-पेपर संस्करण · Digital Broadsheet</p>
            <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-neutral-950 dark:text-white mt-1">
              Maheep Daily E-Paper &amp; Archive
            </h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Multi-page A4 print-ready digital newspaper with clickable stories and downloadable PDF editions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-300">
              <Calendar className="w-4 h-4 text-[#00652E]" />
              <span>Month:</span>
              <input
                type="month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs"
              />
            </label>

            {editions.length > 0 && (
              <select
                value={selectedEdition?.edition_date || ''}
                onChange={(e) => handleDateChange(e.target.value)}
                aria-label="Select edition date"
                className="px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-mono-tabular"
              >
                {editions.map((ed) => (
                  <option key={ed.id} value={ed.edition_date}>
                    {ed.edition_date} — {ed.page_count} Pages
                  </option>
                ))}
              </select>
            )}

            {selectedEdition && (
              <>
                <button
                  type="button"
                  onClick={() => downloadEditionPdf(selectedEdition)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-[#00652E] hover:bg-[#00451F] text-white text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded border border-neutral-300 dark:border-neutral-700 text-xs font-semibold hover:border-[#00652E] whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print A4
                </button>
                <a
                  href={`/api/editions/${selectedEdition.id}/html`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded border border-neutral-300 dark:border-neutral-700 text-xs font-semibold hover:border-[#00652E] whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Full Print View
                </a>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-sm text-neutral-500">Loading digital editions...</div>
        ) : !selectedEdition || !activePage ? (
          <div className="p-10 border border-neutral-200 dark:border-neutral-800 rounded-lg text-center">
            <p className="text-base font-medium">No editions published for the selected archive filter.</p>
            {monthFilter && (
              <button
                type="button"
                onClick={() => setMonthFilter('')}
                className="mt-3 px-4 py-2 rounded bg-[#00652E] text-white text-xs font-semibold"
              >
                Show All Archive Editions
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Page Navigator Sidebar */}
            <aside className="lg:col-span-3 space-y-4 no-print">
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-white dark:bg-neutral-900">
                <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">
                  Edition Pages ({pages.length})
                </h2>
                <div className="space-y-1.5">
                  {pages.map((p, idx) => (
                    <button
                      key={p.pageNumber}
                      type="button"
                      onClick={() => setCurrentPageIdx(idx)}
                      className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center justify-between gap-2 ${
                        idx === currentPageIdx
                          ? 'bg-[#00652E] text-white font-semibold'
                          : 'hover:bg-[#EAF5E5] dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      <span className="truncate">{p.sectionTitle}</span>
                      <span className="font-mono-tabular shrink-0">P.{p.pageNumber}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-white dark:bg-neutral-900">
                <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">
                  Previous Editions
                </h2>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {editions.map((ed) => (
                    <button
                      key={ed.id}
                      type="button"
                      onClick={() => {
                        setSelectedEdition(ed);
                        setCurrentPageIdx(0);
                      }}
                      className={`w-full text-left p-2.5 rounded border text-xs transition-colors ${
                        ed.id === selectedEdition.id
                          ? 'border-[#00652E] bg-[#EAF5E5]/60 dark:bg-[#00451F]/30'
                          : 'border-neutral-200 dark:border-neutral-800 hover:border-[#00652E]/40'
                      }`}
                    >
                      <div className="font-mono-tabular font-semibold text-neutral-900 dark:text-neutral-100">
                        {ed.edition_date}
                      </div>
                      <div className="text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                        {ed.page_count} Pages · {ed.article_count} Articles
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            {/* A4 Broadsheet Reader Canvas */}
            <div className="lg:col-span-9 space-y-4">
              <div className="flex items-center justify-between bg-neutral-100 dark:bg-neutral-900 px-4 py-2.5 rounded-lg no-print">
                <button
                  type="button"
                  disabled={currentPageIdx === 0}
                  onClick={() => setCurrentPageIdx((i) => Math.max(0, i - 1))}
                  className="inline-flex items-center gap-1 text-xs font-semibold disabled:opacity-40 hover:text-[#00652E]"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous Page
                </button>
                <span className="text-xs font-mono-tabular font-semibold">
                  Page {activePage.pageNumber} of {pages.length} · {selectedEdition.edition_date}
                </span>
                <button
                  type="button"
                  disabled={currentPageIdx >= pages.length - 1}
                  onClick={() => setCurrentPageIdx((i) => Math.min(pages.length - 1, i + 1))}
                  className="inline-flex items-center gap-1 text-xs font-semibold disabled:opacity-40 hover:text-[#00652E]"
                >
                  Next Page <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Broadsheet Sheet */}
              <div className="epaper-print-page bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg p-6 sm:p-10 shadow-sm">
                <div className="border-b-2 border-[#00652E] pb-4 mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                  <div>
                    <div className="font-editorial text-2xl sm:text-3xl font-extrabold text-[#00652E] dark:text-[#4ade80]">
                      MAHEEP NEWS PORTAL
                    </div>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      सच के साथ, जनता के विश्वास के साथ · News from India &amp; Beyond
                    </p>
                  </div>
                  <div className="text-left sm:text-right text-xs font-mono-tabular text-neutral-600 dark:text-neutral-400">
                    <div className="font-semibold text-neutral-900 dark:text-neutral-100">{activePage.sectionTitle}</div>
                    <div>Edition: {selectedEdition.edition_date} · Page {activePage.pageNumber}</div>
                  </div>
                </div>

                {/* Newspaper Multi-Column Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {activePage.articles.map((art, idx) => (
                    <article
                      key={`${art.title}-${idx}`}
                      className={`pb-5 border-b border-neutral-200 dark:border-neutral-800 ${
                        idx === 0 ? 'md:col-span-2' : ''
                      }`}
                    >
                      <div className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80] mb-1.5">
                        {art.category_name}
                        {art.state_name ? ` · ${art.state_name}` : ''} · {art.source_name}
                      </div>
                      <div className={idx === 0 ? 'grid grid-cols-1 md:grid-cols-12 gap-5 items-start' : ''}>
                        {idx === 0 && art.image_url && (
                          <div className="md:col-span-5 aspect-[4/3] rounded overflow-hidden bg-neutral-100">
                            <ArticleImage src={art.image_url} alt={art.title} category={art.category_name} />
                          </div>
                        )}
                        <div className={idx === 0 && art.image_url ? 'md:col-span-7' : ''}>
                          {art.slug ? (
                            <Link
                              to={`/news/${art.slug}`}
                              className={`font-editorial font-bold text-neutral-950 dark:text-white hover:text-[#00652E] block leading-snug ${
                                idx === 0 ? 'text-2xl' : 'text-lg'
                              }`}
                            >
                              {art.title}
                            </Link>
                          ) : (
                            <h3 className={`font-editorial font-bold leading-snug ${idx === 0 ? 'text-2xl' : 'text-lg'}`}>
                              {art.title}
                            </h3>
                          )}
                          <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                            {art.summary}
                          </p>
                          <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                            By {art.author || 'Editorial Desk'}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="mt-6 pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500 font-mono-tabular">
                  <span>Maheep News Portal · Digital Newspaper Edition</span>
                  <span>Page {activePage.pageNumber} of {pages.length}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
