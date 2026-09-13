'use client';

import { useState } from 'react';
import Link from 'next/link';

const FAQS = [
  {
    q: 'Do I need any prior experience to enroll?',
    a: 'No. Every stage begins with a plain-language intro that explains what you\'re about to build and why — before the technical task. The 30-day (Foundation) track is specifically designed for beginners. Longer durations expect more depth but not prior certifications.',
  },
  {
    q: 'What does "no live mentor" actually mean?',
    a: 'There are no scheduled sessions, no waiting for a human to review your work, and no dependency on someone else\'s calendar. You work at your own pace. After you submit, you compare your output against the model answer and a rubric checklist — and you mark your own completion. This mirrors how real professional projects work: you\'re responsible for your own output quality.',
  },
  {
    q: 'How does the AI-generated unique scenario work?',
    a: 'When you enroll, a background job generates a unique dataset variant and project scenario for your track — seeded by your profile. This means your submitted work looks different from every other student\'s even if you\'re on the same track. Once generated, it\'s locked for the life of your certificate: all stages in your track build on the same scenario, so the final certificate represents one coherent project rather than disconnected exercises.',
  },
  {
    q: 'Can I enroll in multiple domains at the same time?',
    a: 'Yes. There are no restrictions on how many tracks you can be enrolled in simultaneously. Each enrollment is independent.',
  },
  {
    q: 'Is there a time limit once I enroll?',
    a: 'The durations (30/45/60/75/90 days) describe the scope and depth of the project — not a hard deadline. We\'re working on finalizing access policies and will publish them clearly before launch.',
  },
  {
    q: 'What is the difference between the 5 durations for the same domain?',
    a: 'Each longer duration folds more of the professional workflow into one larger, more integrated project. The 30-day Foundation track covers core concepts with a focused first task. By the 90-day Capstone, you\'re building a full end-to-end system across multiple stages. Every duration is independently enrollable — you don\'t need to complete the 30-day track before enrolling in the 60-day track.',
  },
  {
    q: 'How does certificate verification work?',
    a: 'Every certificate is assigned a unique ID and QR code at the moment it\'s generated. The QR code links to a public page at yuktii.ai/verify/[id] that shows the student name, domain, certification level, and completion date — no login required. A recruiter can verify it directly from a resume or LinkedIn profile.',
  },
  {
    q: 'What payment methods are accepted?',
    a: 'We use Razorpay, which supports UPI, credit/debit cards, netbanking, and EMI options. Pricing is being finalized and will be shown at checkout before any payment is required.',
  },
  {
    q: 'I already completed similar work on another platform. Can I just take the certificate?',
    a: 'No. You need to complete all stages of the track — including the self-check step — to generate the certificate. The self-check is the mechanism that closes the learning loop and gives the certificate its meaning.',
  },
  {
    q: 'What happens if I find the self-check rubric unclear?',
    a: 'The rubric is designed to be unambiguous for the specific task at each stage. If something is genuinely unclear, contact us at connect@yuktiiai.in. We\'ll update the rubric for all future students if needed.',
  },
  {
    q: 'Is this recognised / accredited by a university?',
    a: 'Not currently. This is an industry certificate issued by Yuktii AI Labs — not an academic credential. It\'s designed to demonstrate practical skills to employers and internship programs, not to satisfy university credit requirements.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-line rounded-xl bg-white overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left gap-4"
        aria-expanded={open}
      >
        <span className="font-medium text-sm sm:text-base text-ink">{q}</span>
        <span className={`shrink-0 w-7 h-7 rounded-full border border-line flex items-center justify-center transition-transform duration-200 ${open ? 'rotate-180 border-marigold bg-marigold/5' : ''}`}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 text-sm text-ink/70 leading-relaxed border-t border-line pt-4">
          {a}
        </div>
      )}
    </div>
  );
}

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <div className="text-center mb-12">
        <p className="badge badge-teal mb-4 mx-auto">FAQ</p>
        <h1 className="font-display text-4xl font-semibold">Frequently asked questions</h1>
        <p className="text-ink/60 mt-3 max-w-lg mx-auto">
          If your question isn't here, email us at{' '}
          <a href="mailto:connect@yuktiiai.in" className="text-marigold-dark hover:underline">
            connect@yuktiiai.in
          </a>
        </p>
      </div>

      <div className="space-y-3">
        {FAQS.map((faq, i) => (
          <FaqItem key={i} q={faq.q} a={faq.a} />
        ))}
      </div>

      <div className="mt-12 glass rounded-2xl p-8 border border-line text-center">
        <p className="font-display text-xl font-semibold mb-2">Ready to start?</p>
        <p className="text-ink/60 text-sm mb-5">Pick a domain and a duration — no prerequisites, no live mentor required.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/#domains" className="btn-primary">Browse domains</Link>
          <Link href="/pricing" className="btn-ghost">Compare durations</Link>
        </div>
      </div>
    </div>
  );
}
