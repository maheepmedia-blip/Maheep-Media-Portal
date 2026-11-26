import { CheckCircle2, Mail, MapPin, Phone } from 'lucide-react';
import React, { useState } from 'react';
import { EditorialBureauMap } from '../components/IndiaGoogleNewsMap.tsx';
import { PublicLayout } from '../components/PublicLayout.tsx';
import { SeoHead } from '../components/SeoHead.tsx';

export function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [inquiryType, setInquiryType] = useState('general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ message: string; emailSent: boolean } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, inquiryType, subject, message }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Submission failed.');
        return;
      }
      setResult({ message: json.message, emailSent: Boolean(json.emailSent) });
      setName('');
      setEmail('');
      setPhone('');
      setSubject('');
      setMessage('');
    } catch {
      setError('Unable to reach server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      <SeoHead
        title="Contact & Editorial Consultation — Maheep News Portal"
        description="Contact Maheep News Portal editorial desk, submit press inquiries, news tips, or schedule a media consultation."
        canonicalPath="/contact"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5 space-y-6">
            <div>
              <p className="text-xs font-semibold text-[#00652E] dark:text-[#4ade80]">संपर्क एवं परामर्श · Editorial Desk</p>
              <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-neutral-950 dark:text-white mt-1">
                Contact &amp; Media Consultation
              </h1>
              <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Reach the Maheep News Portal editorial team for news tips, press releases, regional state partnerships, corrections, or media consultation.
              </p>
            </div>

            <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-6 space-y-4 bg-[#EAF5E5]/40 dark:bg-neutral-900">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-[#00652E] mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-neutral-500">Editorial &amp; Admin Desk</div>
                  <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">maheepmedia@gmail.com</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[#00652E] mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-neutral-500">Coverage Jurisdiction</div>
                  <div className="text-sm text-neutral-800 dark:text-neutral-200">
                    New Delhi Bureau · All 28 Indian States &amp; 8 Union Territories
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-[#00652E] mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-neutral-500">Working Hours</div>
                  <div className="text-sm text-neutral-800 dark:text-neutral-200">
                    Monday – Saturday · 09:00 AM – 07:00 PM IST
                  </div>
                </div>
              </div>
            </div>

            {Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY) && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                  Bureau Location Map · New Delhi
                </div>
                <EditorialBureauMap />
              </div>
            )}
          </div>

          <div className="lg:col-span-7">
            <form
              onSubmit={handleSubmit}
              className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-6 sm:p-8 bg-white dark:bg-neutral-900 space-y-5"
            >
              <h2 className="font-editorial text-2xl font-bold text-neutral-950 dark:text-white">
                Send a Message or Consultation Request
              </h2>

              {result && (
                <div className="p-4 rounded-md bg-[#EAF5E5] dark:bg-[#00451F]/50 border border-[#00652E]/30 text-sm text-[#00451F] dark:text-[#EAF5E5] flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-[#00652E] dark:text-[#4ade80]" />
                  <div>
                    <div className="font-semibold">Submission Recorded</div>
                    <p className="mt-0.5 text-xs">{result.message}</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3.5 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full px-3.5 py-2.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 focus:outline-none focus:border-[#00652E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full px-3.5 py-2.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 focus:outline-none focus:border-[#00652E]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98XXXXXXXX"
                    className="w-full px-3.5 py-2.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 focus:outline-none focus:border-[#00652E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                    Inquiry Type
                  </label>
                  <select
                    value={inquiryType}
                    onChange={(e) => setInquiryType(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 focus:outline-none focus:border-[#00652E]"
                  >
                    <option value="general">General Contact</option>
                    <option value="consultation">Media Consultation</option>
                    <option value="news_tip">News Tip / Press Release</option>
                    <option value="correction">Editorial Correction</option>
                    <option value="advertising">Advertising &amp; Partnerships</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Subject *
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief subject line"
                  className="w-full px-3.5 py-2.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 focus:outline-none focus:border-[#00652E]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Message *
                </label>
                <textarea
                  required
                  minLength={10}
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write your message or consultation details (minimum 10 characters)..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 focus:outline-none focus:border-[#00652E]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 rounded-md bg-[#00652E] hover:bg-[#00451F] disabled:opacity-60 text-white text-sm font-semibold transition-colors"
              >
                {submitting ? 'Submitting...' : 'Submit Inquiry'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
