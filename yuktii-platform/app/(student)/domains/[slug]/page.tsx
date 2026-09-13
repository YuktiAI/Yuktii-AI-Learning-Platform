import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Check, Bot, BarChart2, TrendingUp, Wifi, Coffee,
  Building2, Wrench, Code2, Lock,
} from 'lucide-react';
import { DOMAINS, DURATION_LEVELS } from '@/lib/domains';
import CertLevelCards from '@/components/CertLevelCards';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { Metadata } from 'next';

export function generateStaticParams() {
  return DOMAINS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const domain = DOMAINS.find((d) => d.slug === params.slug);
  if (!domain) return {};
  return {
    title: `${domain.name} Internship & Certification — Yuktii AI Labs`,
    description: `${domain.tagline} Earn a verifiable certificate in ${domain.name} with a real project-based internship. Choose from 5 durations (30–90 days). No live mentor required.`,
  };
}

const DOMAIN_ICONS: Record<string, React.ReactNode> = {
  'ai-ml-llm-apps':    <Bot size={24} className="text-violet-600" />,
  'ai-ml':             <Bot size={24} className="text-violet-600" />,
  'llm-generative-ai': <Code2 size={24} className="text-purple-600" />,
  'data-science':      <BarChart2 size={24} className="text-blue-600" />,
  'data-analysis':     <TrendingUp size={24} className="text-sky-600" />,
  'iot':               <Wifi size={24} className="text-emerald-600" />,
  'fullstack-java':    <Coffee size={24} className="text-orange-600" />,
  'erp-odoo':          <Building2 size={24} className="text-rose-600" />,
  'data-engineering':  <Wrench size={24} className="text-indigo-600" />,
  'fullstack-python':  <Code2 size={24} className="text-green-600" />,
  'robotics':          <Bot size={24} className="text-rose-600" />,
};

const DOMAIN_COLORS: Record<string, string> = {
  'ai-ml-llm-apps':    'from-violet-500/15 via-purple-500/8 to-transparent',
  'ai-ml':             'from-violet-500/15 via-purple-500/8 to-transparent',
  'llm-generative-ai': 'from-purple-500/15 via-fuchsia-500/8 to-transparent',
  'data-science':      'from-blue-500/15 via-cyan-500/8 to-transparent',
  'data-analysis':     'from-sky-500/15 via-blue-400/8 to-transparent',
  'iot':               'from-emerald-500/15 via-teal-500/8 to-transparent',
  'fullstack-java':    'from-orange-500/15 via-amber-500/8 to-transparent',
  'erp-odoo':          'from-rose-500/15 via-pink-500/8 to-transparent',
  'data-engineering':  'from-indigo-500/15 via-blue-500/8 to-transparent',
  'fullstack-python':  'from-green-500/15 via-emerald-500/8 to-transparent',
  'robotics':          'from-rose-500/15 via-red-500/8 to-transparent',
};

// Duration overview table shown to guests
function GuestDurationTable({ domainSlug }: { domainSlug: string }) {
  return (
    <div className="space-y-3">
      {DURATION_LEVELS.map((d) => (
        <div
          key={d.duration}
          className="rounded-xl border border-line bg-white p-4 flex items-center gap-4"
        >
          <div className="text-center min-w-[52px]">
            <div className="stage-id text-xl font-bold text-ink">{d.duration}</div>
            <div className="stage-id text-[10px] text-ink/40 leading-tight">days</div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-sm sm:text-base">{d.certificate}</p>
            <p className="text-xs text-ink/50 mt-0.5">{d.level}</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-ink/40">
            <Lock size={11} />
            <span>Login to enroll</span>
          </div>
        </div>
      ))}

      {/* Login CTA card */}
      <div className="rounded-xl border-2 border-dashed border-marigold/40 bg-marigold/5 p-6 text-center mt-6">
        <Lock size={24} className="text-marigold-dark mx-auto mb-3" />
        <h3 className="font-display font-semibold text-base mb-1">Log in to see full details</h3>
        <p className="text-sm text-ink/60 mb-4">
          View what&apos;s covered at each level, deliverables, and enroll directly.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Link
            href={`/login?mode=signup&returnTo=${encodeURIComponent('/domains/' + domainSlug)}`}
            className="btn-primary text-sm"
          >
            Create free account
          </Link>
          <Link
            href={`/login?returnTo=${encodeURIComponent('/domains/' + domainSlug)}`}
            className="btn-ghost text-sm"
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function DomainPage({ params }: { params: { slug: string } }) {
  const domain = DOMAINS.find((d) => d.slug === params.slug);
  if (!domain) return notFound();

  const session = await getSession();
  const isLoggedIn = !!session;

  // Prerequisite check for LLM domain (only relevant when logged in)
  let isLlmLocked = false;
  if (domain.slug === 'llm-generative-ai') {
    if (!isLoggedIn) {
      isLlmLocked = true;
    } else {
      const completedAiMl = await prisma.enrollment.findFirst({
        where: {
          studentId: session.studentId,
          status: 'COMPLETED',
          track: { domain: { slug: 'ai-ml' } },
        },
      });
      if (!completedAiMl) isLlmLocked = true;
    }
  }

  return (
    <div>
      {/* ── Domain Hero ──────────────────────────────────────────────────────── */}
      <div className={`bg-gradient-to-b ${DOMAIN_COLORS[domain.slug] || 'from-ink/5 to-transparent'} border-b border-line`}>
        <div className="mx-auto max-w-5xl px-5 pt-14 pb-12">
          <Link
            href="/#domains"
            className="inline-flex items-center gap-1 text-xs text-ink/50 hover:text-ink transition-colors mb-6 stage-id"
          >
            ← All domains
          </Link>

          <div className="flex items-start gap-5">
            <div className="w-14 h-14 rounded-2xl bg-white border border-line shadow-sm flex items-center justify-center shrink-0">
              {DOMAIN_ICONS[domain.slug]}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="badge badge-teal">DOMAIN</span>
                {isLlmLocked && (
                  <span className="badge border-purple-300 bg-purple-100 text-purple-800 flex items-center gap-1">
                    <Lock size={10} /> LOCKED — PREREQUISITE REQUIRED
                  </span>
                )}
                {!isLoggedIn && (
                  <span className="badge border-amber-300 bg-amber-50 text-amber-800 flex items-center gap-1">
                    <Lock size={10} /> Login to enroll
                  </span>
                )}
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-semibold leading-tight">
                {domain.name}
              </h1>
              <p className="text-lg italic text-ink/55 mt-2">{domain.tagline}</p>
            </div>
          </div>

          <p className="text-ink/70 mt-6 max-w-2xl leading-relaxed text-base">
            {domain.description}
          </p>
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-5 py-12">
        <div className="grid lg:grid-cols-[1fr_280px] gap-10">
          {/* Left: Cert level cards or guest teaser */}
          <div>
            {/* LLM prerequisite warning (logged-in users only) */}
            {isLoggedIn && isLlmLocked && (
              <div className="rounded-xl border border-purple-200 bg-purple-50 p-6 mb-8">
                <div className="flex items-start gap-4">
                  <div className="p-2.5 rounded-xl bg-purple-100 text-purple-700 shrink-0">
                    <Lock size={24} />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-lg text-purple-950">
                      Prerequisite Required: Complete any AI/ML Domain Track
                    </h3>
                    <p className="text-sm text-purple-800 mt-1 leading-relaxed">
                      Enrollment in the LLM &amp; Generative AI domain is gated. You must complete at least one track in the AI/ML domain before unlocking these advanced RAG pipeline and agentic workflow tracks.
                    </p>
                    <Link
                      href="/domains/ai-ml"
                      className="btn-gold text-xs mt-4 inline-flex items-center gap-1.5 font-medium"
                    >
                      Explore AI/ML Tracks →
                    </Link>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-6">
              <h2 className="font-display text-2xl font-semibold">Choose your certification level</h2>
              <p className="text-ink/60 mt-2 text-sm">
                {isLoggedIn
                  ? 'All 5 durations are available independently. Each longer bundle folds more of the professional workflow into one larger project. Click any level to see what\'s included.'
                  : 'Log in to see what\'s covered at each level and enroll directly.'}
              </p>
            </div>

            {isLoggedIn ? (
              <CertLevelCards domainSlug={domain.slug} domainName={domain.name} />
            ) : (
              <GuestDurationTable domainSlug={domain.slug} />
            )}
          </div>

          {/* Right: Sticky info sidebar */}
          <div className="space-y-4">
            {/* How it works */}
            <div className="glass rounded-xl p-5 border border-line sticky top-20">
              <h3 className="font-display text-base font-semibold mb-4">How this works</h3>
              <ol className="space-y-3">
                {[
                  { n: '1', text: 'Pick a duration above and click Enroll' },
                  { n: '2', text: 'Create an account (email OTP — takes 30 seconds)' },
                  { n: '3', text: 'Work through each stage at your own pace' },
                  { n: '4', text: 'AI evaluates your submission automatically' },
                  { n: '5', text: 'Receive your verifiable certificate on completion' },
                ].map((item) => (
                  <li key={item.n} className="flex items-start gap-3 text-sm text-ink/70">
                    <span className="w-5 h-5 rounded-full bg-teal/10 border border-teal/20 flex items-center justify-center text-teal text-xs font-bold shrink-0 mt-0.5">
                      {item.n}
                    </span>
                    {item.text}
                  </li>
                ))}
              </ol>

              <hr className="divider my-4" />

              <div className="space-y-2">
                {[
                  'No live mentor required',
                  'AI-generated unique scenario per student',
                  'Public certificate verification (QR code)',
                  'Self-paced — complete at your own schedule',
                ].map((text) => (
                  <div key={text} className="flex items-center gap-2 text-xs text-ink/60">
                    <Check size={13} className="text-teal shrink-0" />
                    {text}
                  </div>
                ))}
              </div>

              {isLoggedIn ? (
                <span className="btn-primary w-full text-center mt-5 block cursor-default opacity-70">
                  ↑ Pick a level above
                </span>
              ) : (
                <>
                  <Link
                    href={`/login?mode=signup&returnTo=${encodeURIComponent('/domains/' + domain.slug)}`}
                    className="btn-primary w-full text-center mt-5 block"
                  >
                    Get started — it&apos;s free
                  </Link>
                  <Link
                    href={`/login?returnTo=${encodeURIComponent('/domains/' + domain.slug)}`}
                    className="btn-ghost w-full text-center mt-2 block text-sm"
                  >
                    Already have an account? Log in
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
