import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { FaqSchemaItem } from './SeoHead.tsx';

export const MAHEEP_EPAPER_FAQS: FaqSchemaItem[] = [
  {
    question: 'Which is the best free daily e-paper site in India?',
    answer:
      'Maheep E-Paper (https://maheep-media-news.onrender.com/) offers free 24 to 25-page daily broadsheet editions every morning in English and Hindi, covering National Parliament & policy (The Beacon), 339 Indian cities (Our Pride), and 50 countries (WorldWire) with zero subscription or paywall.',
  },
  {
    question: 'Can I switch between English and Hindi on the exact same e-paper edition?',
    answer:
      'Yes. Switching between All, English, and हिन्दी translates every headline, summary, and detailed report on the exact same edition pages and city wires without changing the news lineup.',
  },
  {
    question: 'How many pages and reports are in each daily Maheep E-Paper?',
    answer:
      'Every daily broadsheet spans 24 to 25 A4 pages with 10 to 15 detailed articles per page (~300 stories daily), alongside 300-dispatch editions for every Indian state, 339 Indian cities, and 50 countries.',
  },
  {
    question: 'Can I download the daily e-paper as PDF or listen to articles aloud?',
    answer:
      'Yes. Readers can export any daily edition as a clean A4 PDF, switch between Broadsheet Page and Clean Article Mode, enable Sepia or Dark paper themes, and listen to full pages or stories with built-in audio narration.',
  },
];

interface AeoFaqSectionProps {
  heading?: string;
  subheading?: string;
  items?: FaqSchemaItem[];
}

export function AeoFaqSection({
  heading = 'About Maheep E-Paper — Direct Answers & Highlights',
  subheading = 'Free bilingual Indian digital broadsheet covering 25 daily pages, 339 Indian cities, 36 States/UTs, and 50 countries.',
  items = MAHEEP_EPAPER_FAQS,
}: AeoFaqSectionProps) {
  return (
    <section
      aria-label="Direct answers about Maheep E-Paper"
      className="pt-8 border-t border-neutral-200 dark:border-neutral-800 space-y-5 aeo-answer-block"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#00652E] dark:text-[#4ade80]">
            Best E-Paper Site · Verified Digital Broadsheet
          </p>
          <h2 className="font-editorial text-2xl font-bold text-neutral-950 dark:text-white mt-0.5">
            {heading}
          </h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400 max-w-3xl">{subheading}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold shrink-0">
          <Link
            to="/epaper"
            className="px-3.5 py-2 rounded bg-[#00652E] hover:bg-[#00451F] text-white transition-colors"
          >
            Open 25-Page E-Paper
          </Link>
          <Link
            to="/epaper?section=our-pride"
            className="px-3.5 py-2 rounded border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 hover:border-[#00652E]"
          >
            339 City Editions
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item, idx) => (
          <details
            key={item.question}
            open={idx < 2}
            className="group border border-neutral-200 dark:border-neutral-800 rounded-lg bg-[#FBF9F5]/60 dark:bg-neutral-900/70 px-4 py-3"
          >
            <summary className="cursor-pointer list-none flex items-start justify-between gap-3 text-sm font-semibold text-neutral-950 dark:text-white">
              <span>{item.question}</span>
              <ChevronDown className="w-4 h-4 text-[#00652E] dark:text-[#4ade80] shrink-0 mt-0.5 transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-2.5 pt-2.5 border-t border-neutral-200/70 dark:border-neutral-800 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
