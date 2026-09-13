'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type RubricItem = {
  label: string;
  description: string;
};

type Level = {
  duration: 30 | 45 | 60 | 75 | 90;
  level: string;
  certificate: string;
  price?: number | null; // in paise, null = TBA
  tagColor: string;
  accentColor: string;
  highlights: string[]; // what's new/added at this duration
  deliverables: string[]; // what the student produces
  stages?: number; // number of stages
};

const LEVEL_DEFS: Omit<Level, 'highlights' | 'deliverables'>[] = [
  {
    duration: 30,
    level: 'Foundation',
    certificate: 'Foundation Certificate',
    price: null,
    tagColor: 'text-sky-700 bg-sky-50 border-sky-200',
    accentColor: 'border-l-sky-400',
  },
  {
    duration: 45,
    level: 'Foundation+',
    certificate: 'Foundation+ Certificate',
    price: null,
    tagColor: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    accentColor: 'border-l-indigo-400',
  },
  {
    duration: 60,
    level: 'Practitioner',
    certificate: 'Practitioner Certificate',
    price: null,
    tagColor: 'text-teal-700 bg-teal-50 border-teal-200',
    accentColor: 'border-l-teal-400',
  },
  {
    duration: 75,
    level: 'Applied Practitioner',
    certificate: 'Applied Practitioner Certificate',
    price: null,
    tagColor: 'text-amber-700 bg-amber-50 border-amber-200',
    accentColor: 'border-l-amber-400',
  },
  {
    duration: 90,
    level: 'Capstone',
    certificate: 'Capstone Certificate',
    price: null,
    tagColor: 'text-rose-700 bg-rose-50 border-rose-200',
    accentColor: 'border-l-rose-400',
  },
];

const DEFAULT_HIGHLIGHTS: Record<number, string[]> = {
  30: [
    'Core concepts and foundational theory',
    'First hands-on project task',
    'Introduction to domain tooling and environment setup',
  ],
  45: [
    'Everything in 30 days, plus:',
    'Deeper exploration of core workflow',
    'Additional analysis or feature expansion',
    'Broader deliverable scope',
  ],
  60: [
    'Everything in 45 days, plus:',
    'Intermediate techniques and best practices',
    'End-to-end mini-project with multiple components',
    'Data quality, error-handling, or deployment considerations',
  ],
  75: [
    'Everything in 60 days, plus:',
    'Applied problem-solving on a realistic scenario',
    'Performance evaluation, optimization, or real-world constraints',
    'Professional-grade deliverable presentation',
  ],
  90: [
    'Everything in 75 days, plus:',
    'Capstone project: full lifecycle, production-ready output',
    'Integration of all prior skills in one coherent system',
    'Portfolio-ready final deliverable',
  ],
};

const DEFAULT_DELIVERABLES: Record<number, string[]> = {
  30: ['Project notebook/report', 'Working implementation of core task', 'Self-check against model answer'],
  45: ['Expanded project artifact', 'Additional analysis or feature', 'Updated self-check checklist'],
  60: ['Multi-component project package', 'End-to-end workflow demonstration', 'Practitioner-level rubric completion'],
  75: ['Applied case study output', 'Evaluation and optimization notes', 'Professional presentation artifact'],
  90: ['Full capstone project', 'All-stages integrated deliverable', 'Portfolio-ready case study write-up', 'Public certificate with QR code'],
};

type Props = {
  domainSlug: string;
  domainName: string;
};

export default function CertLevelCards({ domainSlug, domainName }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [enrollingDuration, setEnrollingDuration] = useState<number | null>(null);
  const router = useRouter();

  async function handleEnroll(duration: number) {
    setEnrollingDuration(duration);
    try {
      const res = await fetch('/api/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainSlug, duration }),
      });
      const data = await res.json();
      if (res.ok && data.enrollmentId) {
        router.push(`/dashboard/track/${data.enrollmentId}`);
        return;
      }
      if (res.status === 401) {
        router.push(`/login?mode=signup&domain=${domainSlug}&duration=${duration}`);
        return;
      }
      alert(data.error || 'Failed to enroll');
    } catch (e) {
      console.error(e);
      router.push(`/login?mode=signup&domain=${domainSlug}&duration=${duration}`);
    } finally {
      setEnrollingDuration(null);
    }
  }

  const levels = LEVEL_DEFS.map((l) => ({
    ...l,
    highlights: DEFAULT_HIGHLIGHTS[l.duration],
    deliverables: DEFAULT_DELIVERABLES[l.duration],
    stages: l.duration === 30 ? 3 : l.duration === 45 ? 4 : l.duration === 60 ? 5 : l.duration === 75 ? 6 : 8,
  }));

  return (
    <div className="space-y-3">
      {levels.map((lvl) => {
        const isOpen = expanded === lvl.duration;
        const isEnrolling = enrollingDuration === lvl.duration;
        return (
          <div
            key={lvl.duration}
            className={`rounded-xl border border-line bg-white overflow-hidden border-l-4 ${lvl.accentColor} transition-shadow duration-200 ${isOpen ? 'shadow-lg' : 'shadow-sm hover:shadow-md'}`}
          >
            {/* Header row — always visible */}
            <button
              onClick={() => setExpanded(isOpen ? null : lvl.duration)}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
              aria-expanded={isOpen}
              id={`cert-${lvl.duration}`}
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="text-center min-w-[52px]">
                  <div className="stage-id text-xl font-bold text-ink">{lvl.duration}</div>
                  <div className="stage-id text-[10px] text-ink/40 leading-tight">days</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`badge text-[10px] px-2 py-0.5 rounded-md font-medium border ${lvl.tagColor}`}>
                      {lvl.level}
                    </span>
                    <span className="text-xs text-ink/50 hidden sm:inline">{lvl.stages} stages</span>
                  </div>
                  <p className="font-display font-semibold text-sm sm:text-base mt-0.5 truncate">{lvl.certificate}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right hidden sm:block">
                  {lvl.price == null ? (
                    <p className="text-xs text-teal font-medium stage-id">Free for testing</p>
                  ) : (
                    <p className="font-semibold text-ink">₹{(lvl.price / 100).toLocaleString('en-IN')}</p>
                  )}
                </div>
                <div className={`w-7 h-7 rounded-full border border-line flex items-center justify-center transition-transform duration-200 ${isOpen ? 'rotate-180 border-marigold' : ''}`}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </button>

            {/* Expanded detail */}
            {isOpen && (
              <div className="px-5 pb-6 border-t border-line">
                <div className="grid sm:grid-cols-2 gap-6 mt-5">
                  {/* What's covered */}
                  <div>
                    <h4 className="text-xs stage-id text-ink/40 tracking-widest mb-3">WHAT'S COVERED</h4>
                    <ul className="space-y-2">
                      {lvl.highlights.map((h, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-ink/75">
                          <span className="text-teal mt-0.5 shrink-0">✓</span>
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Deliverables */}
                  <div>
                    <h4 className="text-xs stage-id text-ink/40 tracking-widest mb-3">DELIVERABLES</h4>
                    <ul className="space-y-2">
                      {lvl.deliverables.map((d, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-ink/75">
                          <span className="text-marigold-dark mt-0.5 shrink-0">→</span>
                          {d}
                        </li>
                      ))}
                    </ul>

                    {/* Price + enroll */}
                    <div className="mt-5 pt-4 border-t border-line flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <p className="text-lg font-display font-semibold text-teal">Direct Access</p>
                        <p className="text-xs text-ink/40">Payment gateway bypassed for testing</p>
                      </div>
                      <button
                        onClick={() => handleEnroll(lvl.duration)}
                        disabled={isEnrolling}
                        className="btn-gold text-sm disabled:opacity-50"
                      >
                        {isEnrolling ? 'Enrolling...' : `Start Track — ${lvl.duration} days →`}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
