import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Yuktii AI Labs — Internship Platform',
  description: 'Yuktii AI Labs is an active enterprise AI and software solutions company. Our internship platform grew out of real client project patterns.',
};

const VALUES = [
  {
    icon: '🏗️',
    title: 'Real client patterns, not invented exercises',
    body: 'Every task brief, model answer, and rubric is written to reflect how the work actually gets done — based on real project deliverables from our enterprise AI and software practice.',
  },
  {
    icon: '🔬',
    title: 'Self-checking over live evaluation',
    body: 'You see the model answer and a rubric-derived checklist after submitting. Honest self-assessment is a professional skill — we make it part of the internship, not an afterthought.',
  },
  {
    icon: '🛡️',
    title: 'Verifiable, portable credentials',
    body: 'Every certificate carries a unique public URL with a QR code. A recruiter, a college, or another company can verify it without logging in or contacting us.',
  },
  {
    icon: '🤖',
    title: 'AI-generated unique scenarios',
    body: 'Each student gets a distinct scenario and dataset variant generated on enrollment — locked for the life of their certificate. No two portfolios are identical.',
  },
];

export default function AboutPage() {
  return (
    <div>
      {/* Hero */}
      <div className="hero-bg border-b border-line">
        <div className="mx-auto max-w-4xl px-5 pt-16 pb-14">
          <p className="badge badge-teal mb-5">ABOUT</p>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold leading-tight">
            Built by Yuktii AI Labs
          </h1>
          <p className="text-xl text-ink/60 mt-4 max-w-2xl leading-relaxed">
            An active enterprise AI and software company that turned its own project patterns into a
            self-paced internship platform.
          </p>
        </div>
      </div>

      {/* Main */}
      <div className="mx-auto max-w-4xl px-5 py-14">
        {/* Story */}
        <div className="max-w-2xl space-y-5 text-ink/75 leading-relaxed text-base mb-14">
          <p>
            Yuktii AI Labs is an enterprise AI and software solutions company. We build full-stack
            applications, data pipelines, ERP configurations, and applied AI systems for real clients.
          </p>
          <p>
            This platform grew directly out of that work. Instead of inventing classroom exercises,
            we took the actual task patterns — the briefs we'd give an intern or junior engineer on
            a live project — and turned them into a structured, self-paced track any student can
            complete without a live mentor.
          </p>
          <p>
            The result: project work that mirrors what companies actually need, with a certificate
            that reflects a student's demonstrated ability to complete a realistic task from start
            to finish — not just pass a multiple-choice quiz.
          </p>
        </div>

        {/* Values */}
        <h2 className="font-display text-2xl font-semibold mb-8">What drives every design decision</h2>
        <div className="grid sm:grid-cols-2 gap-5 mb-14">
          {VALUES.map((v) => (
            <div key={v.title} className="card-surface p-6">
              <div className="text-2xl mb-3">{v.icon}</div>
              <h3 className="font-display text-base font-semibold mb-2">{v.title}</h3>
              <p className="text-sm text-ink/65 leading-relaxed">{v.body}</p>
            </div>
          ))}
        </div>

        {/* Domains note */}
        <div className="glass rounded-2xl p-8 border border-line">
          <h3 className="font-display text-xl font-semibold mb-3">Why these 8 domains?</h3>
          <p className="text-ink/70 leading-relaxed text-sm max-w-xl">
            Data Science, AI/ML, Data Analysis, IoT, Full Stack (Java), ERP (Odoo), Data Engineering,
            Full Stack (Python) — each is a domain where we've delivered real client work. ERP and
            Data Engineering in particular are underrepresented in existing internship platforms; we
            built them because the demand is real and the teaching quality is low elsewhere.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/#domains" className="btn-primary">
              Browse domains
            </Link>
            <Link href="/faq" className="btn-ghost">
              Read the FAQ
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
