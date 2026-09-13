import Link from 'next/link';
import { Target, Building2, Zap, CheckCircle2, Compass, KeyRound, Check, Bot, BarChart2, TrendingUp, Wifi, Coffee, Wrench, Code2, Lock } from 'lucide-react';
import { DOMAINS, DURATION_LEVELS } from '@/lib/domains';
import { getSession } from '@/lib/auth';

const DOMAIN_ICONS: Record<string, React.ReactNode> = {
  'ai-ml':             <Bot size={20} className="text-violet-600" />,
  'ai-ml-llm-apps':    <Bot size={20} className="text-violet-600" />,
  'llm-generative-ai': <Code2 size={20} className="text-purple-600" />,
  'data-science':      <BarChart2 size={20} className="text-blue-600" />,
  'data-analysis':     <TrendingUp size={20} className="text-sky-600" />,
  'iot':               <Wifi size={20} className="text-emerald-600" />,
  'fullstack-java':    <Coffee size={20} className="text-orange-600" />,
  'erp-odoo':          <Building2 size={20} className="text-rose-600" />,
  'data-engineering':  <Wrench size={20} className="text-indigo-600" />,
  'fullstack-python':  <Code2 size={20} className="text-green-600" />,
};

const DOMAIN_COLORS: Record<string, string> = {
  'ai-ml':             'from-violet-500/10 to-purple-500/5',
  'ai-ml-llm-apps':    'from-violet-500/10 to-purple-500/5',
  'llm-generative-ai': 'from-purple-500/10 to-fuchsia-500/5',
  'data-science':      'from-blue-500/10 to-cyan-500/5',
  'data-analysis':     'from-sky-500/10 to-blue-400/5',
  'iot':               'from-emerald-500/10 to-teal-500/5',
  'fullstack-java':    'from-orange-500/10 to-amber-500/5',
  'erp-odoo':          'from-rose-500/10 to-pink-500/5',
  'data-engineering':  'from-indigo-500/10 to-blue-500/5',
  'fullstack-python':  'from-green-500/10 to-emerald-500/5',
};

const WHY_US = [
  {
    icon: <Target size={22} className="text-marigold" />,
    title: 'No duplicate portfolios',
    body: 'Each student\'s project runs on an AI-generated unique scenario and dataset — not a shared template everyone copies.',
  },
  {
    icon: <Building2 size={22} className="text-marigold" />,
    title: 'Domains competitors skip',
    body: 'ERP and Data Engineering sit next to real agentic AI/LLM tracks — the skills companies are actually hiring for right now.',
  },
  {
    icon: <Zap size={22} className="text-marigold" />,
    title: 'Built from real client work',
    body: 'Task briefs come from an active AI and software company\'s own project patterns, not invented classroom exercises.',
  },
  {
    icon: <CheckCircle2 size={22} className="text-marigold" />,
    title: 'Verifiable, always',
    body: 'Every certificate carries a public, QR/ID-linked verification page — no login required to check it. Share it anywhere.',
  },
  {
    icon: <Compass size={22} className="text-marigold" />,
    title: 'Genuinely beginner-friendly',
    body: 'A plain-language explanation precedes every technical task, at every stage — so you know exactly what you\'re building and why.',
  },
  {
    icon: <KeyRound size={22} className="text-marigold" />,
    title: 'No passwords to forget',
    body: 'Passwordless email OTP signup — or create a password after verification. Either way, you\'re in within seconds.',
  },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Pick a domain & duration', body: 'Choose from 8 domains. Pick the depth that fits your time — 30 to 90 days. No prerequisites, no live mentor required.' },
  { step: '02', title: 'Work through staged tasks', body: 'Each stage starts with a plain-language intro, then a real-world project task. Your unique AI-generated scenario keeps your portfolio original.' },
  { step: '03', title: 'AI evaluates your submission', body: 'After submitting, the AI evaluates your work against the rubric. Pass to unlock the next stage. Feedback tells you exactly what to improve.' },
  { step: '04', title: 'Receive your verifiable certificate', body: 'Complete all stages and your certificate is generated automatically — with a unique ID and QR code anyone can verify instantly.' },
];

// Duration teaser shown on guest hover — always visible info
function DurationTeaser() {
  return (
    <div className="absolute inset-0 bg-paper/97 backdrop-blur-sm rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 flex flex-col p-4 border border-marigold/20">
      <p className="text-[10px] font-bold text-ink/40 tracking-widest mb-2 stage-id">DURATIONS & CERTIFICATES</p>
      <div className="flex-1 space-y-1.5">
        {DURATION_LEVELS.map((d) => (
          <div key={d.duration} className="flex items-center justify-between text-xs">
            <span className="font-semibold text-ink">{d.duration} days</span>
            <span className="text-ink/55 text-right max-w-[130px] leading-tight">{d.certificate}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-line">
        <div className="flex items-center gap-2 text-xs text-marigold-dark font-medium">
          <Lock size={11} />
          <span>Log in to enroll</span>
        </div>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const session = await getSession();
  const isLoggedIn = !!session;

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="hero-bg">
        <div className="mx-auto max-w-6xl px-5 pt-20 pb-24 grid md:grid-cols-[1.15fr_0.85fr] gap-16 items-center">
          <div className="animate-fade-up">
            <div className="badge badge-teal mb-5">
              NO LIVE MENTOR · AI-EVALUATED · VERIFIABLE
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl leading-[1.05] font-semibold">
              Work like an intern.
              <br />
              <span className="text-gradient-gold">Prove it</span> like a professional.
            </h1>
            <p className="mt-6 text-lg text-ink/65 max-w-lg leading-relaxed">
              Pick a domain, pick a duration, and complete a real project-style track — built by an
              active AI &amp; software company. Get AI-evaluated. Earn a verifiable certificate.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="#domains" className="btn-primary">
                Browse 8 domains →
              </Link>
              <Link href="/pricing" className="btn-ghost">
                See durations &amp; pricing
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-6 text-sm text-ink/50">
              <span className="flex items-center gap-2"><Check size={14} className="text-teal" /> 8 technical domains</span>
              <span className="flex items-center gap-2"><Check size={14} className="text-teal" /> 5 duration options</span>
              <span className="flex items-center gap-2"><Check size={14} className="text-teal" /> Publicly verifiable cert</span>
            </div>
          </div>

          {/* Duration ladder */}
          <div className="animate-fade-up-delay">
            <div className="glass rounded-2xl p-6 shadow-xl shadow-ink/5">
              <p className="stage-id text-xs text-ink/40 mb-5 tracking-widest">TRACK LENGTH → CERTIFICATE</p>
              <ol className="space-y-0">
                {DURATION_LEVELS.map((d) => (
                  <li
                    key={d.duration}
                    className="flex items-center justify-between py-3.5 border-t border-line/60 first:border-t-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-8 rounded-md bg-marigold/10 border border-marigold/20 flex items-center justify-center">
                        <span className="stage-id text-xs text-marigold-dark font-semibold">{d.duration}d</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-ink">{d.level}</p>
                      </div>
                    </div>
                    <span className="text-xs text-ink/45 max-w-[120px] text-right">{d.certificate}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-5 text-xs text-ink/40 leading-relaxed border-t border-line/60 pt-4">
                Every duration is independently selectable — no prerequisite track required.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Domain Grid ─────────────────────────────────────────────────────── */}
      <section id="domains" className="mx-auto max-w-6xl px-5 py-20">
        <div className="text-center mb-12">
          <p className="stage-id text-xs text-teal mb-3 tracking-widest">8 DOMAINS</p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold">Including two nobody else teaches.</h2>
          <p className="text-ink/60 mt-3 max-w-xl mx-auto">
            ERP configuration and Data Engineering sit alongside Data Science and AI/ML — the skills
            companies are actually hiring for, not just the ones everyone covers.
          </p>
          {!isLoggedIn && (
            <p className="mt-4 text-sm text-ink/50 flex items-center justify-center gap-1.5">
              <Lock size={13} className="text-marigold-dark" />
              <span>
                <Link href="/login" className="text-marigold-dark font-medium hover:underline">Log in</Link>
                {' '}or{' '}
                <Link href="/login?mode=signup" className="text-marigold-dark font-medium hover:underline">create a free account</Link>
                {' '}to explore full track details and enroll
              </span>
            </p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {DOMAINS.map((d) =>
            isLoggedIn ? (
              // ── Logged-in: full clickable card ────────────────────────────
              <Link
                key={d.slug}
                href={`/domains/${d.slug}`}
                className="group card-surface p-5 flex flex-col"
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${DOMAIN_COLORS[d.slug] || 'from-ink/10 to-ink/5'} border border-line flex items-center justify-center mb-4`}>
                  {DOMAIN_ICONS[d.slug]}
                </div>
                <h3 className="font-display text-base font-semibold group-hover:text-marigold-dark transition-colors">
                  {d.name}
                </h3>
                <p className="text-xs text-ink/50 mt-1 italic mb-3">{d.tagline}</p>
                <p className="text-sm text-ink/65 leading-relaxed mt-auto">{d.description}</p>
                <span className="mt-4 text-xs font-medium text-marigold-dark group-hover:underline">
                  View certifications →
                </span>
              </Link>
            ) : (
              // ── Guest: locked card with hover duration preview ────────────
              <Link
                key={d.slug}
                href={`/login?mode=signup&returnTo=${encodeURIComponent('/domains/' + d.slug)}`}
                className="group card-surface p-5 flex flex-col relative overflow-hidden cursor-pointer"
              >
                {/* Domain content (always visible) */}
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${DOMAIN_COLORS[d.slug] || 'from-ink/10 to-ink/5'} border border-line flex items-center justify-center mb-4`}>
                  {DOMAIN_ICONS[d.slug]}
                </div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-base font-semibold text-ink">
                    {d.name}
                  </h3>
                  <Lock size={13} className="text-ink/30 mt-1 shrink-0" />
                </div>
                <p className="text-xs text-ink/50 mt-1 italic mb-3">{d.tagline}</p>
                <p className="text-sm text-ink/55 leading-relaxed mt-auto line-clamp-2">{d.description}</p>
                <span className="mt-4 text-xs font-medium text-marigold-dark/70">
                  Log in to explore →
                </span>

                {/* Hover overlay: duration / cert teaser */}
                <DurationTeaser />
              </Link>
            )
          )}
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────────── */}
      <section className="bg-ink/[0.03] border-y border-line py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="text-center mb-12">
            <p className="stage-id text-xs text-teal mb-3 tracking-widest">THE PROCESS</p>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold">How it works</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="relative">
                <div className="stage-id text-4xl font-bold text-ink/8 mb-3 select-none">{item.step}</div>
                <h3 className="font-display text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-ink/65 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Us ──────────────────────────────────────────────────────────── */}
      <section className="section-dark py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="text-center mb-12">
            <p className="stage-id text-xs text-marigold mb-3 tracking-widest">WHY YUKTII AI LABS</p>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold text-paper">
              Six things we do differently.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {WHY_US.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-paper/10 bg-paper/5 p-6 hover:bg-paper/8 hover:border-marigold/40 transition-all duration-200"
              >
                <div className="mb-3">{item.icon}</div>
                <h3 className="font-display text-lg font-semibold text-marigold mb-2">{item.title}</h3>
                <p className="text-sm text-paper/70 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ──────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="glass rounded-2xl p-10 sm:p-14 text-center border border-line shadow-xl shadow-ink/5">
          <p className="stage-id text-xs text-teal mb-4 tracking-widest">GET STARTED TODAY</p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold mb-4">
            Ready to start your track?
          </h2>
          <p className="text-ink/65 max-w-md mx-auto mb-8 leading-relaxed">
            Pick any domain, pick any duration. No live mentor, no class schedule — just real project
            work at your own pace, with a certificate at the end.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {isLoggedIn ? (
              <>
                <Link href="#domains" className="btn-primary">
                  Browse 8 domains
                </Link>
                <Link href="/dashboard" className="btn-ghost">
                  Go to dashboard
                </Link>
              </>
            ) : (
              <>
                <Link href="/login?mode=signup" className="btn-primary">
                  Create free account →
                </Link>
                <Link href="/login" className="btn-ghost">
                  Log in
                </Link>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
