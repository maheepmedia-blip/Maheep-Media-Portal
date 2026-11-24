import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PortalProvider } from './context/PortalContext.tsx';

// Code splitting across major routes for fast loading
const HomePage = lazy(() => import('./pages/HomePage.tsx').then((m) => ({ default: m.HomePage })));
const NationalPage = lazy(() => import('./pages/NationalPage.tsx').then((m) => ({ default: m.NationalPage })));
const StatesPage = lazy(() => import('./pages/StatesPage.tsx').then((m) => ({ default: m.StatesPage })));
const BusinessSportsPage = lazy(() =>
  import('./pages/BusinessSportsPage.tsx').then((m) => ({ default: m.BusinessSportsPage })),
);
const EPaperPage = lazy(() => import('./pages/EPaperPage.tsx').then((m) => ({ default: m.EPaperPage })));
const ContactPage = lazy(() => import('./pages/ContactPage.tsx').then((m) => ({ default: m.ContactPage })));
const ArticleDetailPage = lazy(() =>
  import('./pages/ArticleDetailPage.tsx').then((m) => ({ default: m.ArticleDetailPage })),
);
const SearchPage = lazy(() => import('./pages/SearchPage.tsx').then((m) => ({ default: m.SearchPage })));
const AuthorPage = lazy(() => import('./pages/AuthorPage.tsx').then((m) => ({ default: m.AuthorPage })));
const BriefingPage = lazy(() => import('./pages/BriefingPage.tsx').then((m) => ({ default: m.BriefingPage })));
const TimelinesPage = lazy(() => import('./pages/TimelinesPage.tsx').then((m) => ({ default: m.TimelinesPage })));
const AdminPage = lazy(() => import('./pages/AdminPage.tsx').then((m) => ({ default: m.AdminPage })));

class PortalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-white text-neutral-900">
          <div className="max-w-md border border-neutral-200 rounded-lg p-6 text-center space-y-3">
            <h1 className="font-editorial text-2xl font-bold text-[#00652E]">Maheep News Portal</h1>
            <p className="text-sm text-neutral-600">Something went wrong while rendering this page.</p>
            <p className="text-xs text-red-600 font-mono-tabular">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="px-4 py-2 rounded bg-[#00652E] text-white text-xs font-semibold"
            >
              Reload Homepage
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <PortalErrorBoundary>
      <PortalProvider>
        <BrowserRouter>
          <Suspense
            fallback={
              <div className="min-h-screen flex items-center justify-center bg-white dark:bg-neutral-950 text-sm text-[#00652E]">
                Loading Maheep News Portal...
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/index.html" element={<Navigate to="/" replace />} />
              <Route path="/national" element={<NationalPage />} />
              <Route path="/national.html" element={<Navigate to="/national" replace />} />
              <Route path="/states" element={<StatesPage />} />
              <Route path="/states.html" element={<Navigate to="/states" replace />} />
              <Route path="/states/:slug" element={<StatesPage />} />
              <Route path="/business-sports" element={<BusinessSportsPage />} />
              <Route path="/business-sports.html" element={<Navigate to="/business-sports" replace />} />
              <Route path="/epaper" element={<EPaperPage />} />
              <Route path="/newspaper.html" element={<Navigate to="/epaper" replace />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/contact.html" element={<Navigate to="/contact" replace />} />
              <Route path="/news/:slug" element={<ArticleDetailPage />} />
              <Route path="/authors" element={<AuthorPage />} />
              <Route path="/author/:slug" element={<AuthorPage />} />
              <Route path="/briefing" element={<BriefingPage />} />
              <Route path="/timelines" element={<TimelinesPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </PortalProvider>
    </PortalErrorBoundary>
  );
}
