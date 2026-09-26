import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Compass,
  Award,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Layers,
  Terminal,
} from 'lucide-react';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function StudentHomePage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [student, rawEnrollments] = await Promise.all([
    prisma.student.findUnique({ where: { id: session.studentId } }),
    prisma.enrollment.findMany({
      where: { studentId: session.studentId },
      include: {
        track: {
          include: {
            domain: true,
            stages: { orderBy: { stageNumber: 'asc' } },
          },
        },
        submissions: true,
        certificate: true,
      },
      orderBy: { enrolledAt: 'desc' },
    }),
  ]);

  const enrollments = rawEnrollments;


  const activeEnrollment = enrollments.find((e) => e.status === 'IN_PROGRESS');
  const completedCount = enrollments.filter((e) => e.status === 'COMPLETED').length;

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      {/* Welcome Banner */}
      <div className="mb-10">
        <div className="flex items-center gap-2 text-xs font-semibold text-teal uppercase tracking-widest mb-2">
          <Sparkles size={14} />
          <span>Student Learning Hub</span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-ink">
          Welcome back, {student?.name?.split(' ')[0] ?? 'Learner'} 👋
        </h1>
        <p className="text-ink/60 text-sm mt-2 max-w-2xl leading-relaxed">
          Select what you would like to do today. Continue your active engineering track, explore new technical domains, or view your verified certifications.
        </p>
      </div>

      {/* Active Track Highlight (if enrolled) */}
      {activeEnrollment && (
        <div className="mb-10 rounded-2xl border border-teal/30 bg-teal/5 p-6 sm:p-8 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="badge text-[11px] bg-teal text-white border-none font-medium">
                  In Progress
                </span>
                <span className="text-xs text-teal-dark font-medium">
                  {activeEnrollment.track.duration}-Day {activeEnrollment.track.certificateName}
                </span>
              </div>
              <h2 className="font-display text-xl sm:text-2xl font-semibold text-ink">
                {activeEnrollment.track.domain.name}
              </h2>
              <p className="text-xs text-ink/60 mt-1">
                Stage {activeEnrollment.submissions.filter((s) => s.selfCheckCompleted).length + 1} of {activeEnrollment.track.stages.length}
              </p>
            </div>
            <Link
              href={`/dashboard/track/${activeEnrollment.id}`}
              className="btn-teal inline-flex items-center gap-2 shrink-0 text-sm"
            >
              <span>Resume Project</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      )}

      {/* Choice Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
        {/* Card 1: My Dashboard */}
        <Link
          href="/dashboard"
          className="group rounded-2xl border border-line bg-white p-6 hover:border-ink/30 hover:shadow-sm transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center mb-4">
              <Layers size={20} />
            </div>
            <h3 className="font-display font-semibold text-lg text-ink group-hover:text-violet-700 transition-colors">
              My Tracks &amp; Dashboard
            </h3>
            <p className="text-xs text-ink/60 mt-1.5 leading-relaxed">
              View all your enrolled tracks, track project milestones, and monitor evaluation statuses across stages.
            </p>
          </div>
          <div className="mt-6 flex items-center gap-1.5 text-xs font-semibold text-violet-700">
            <span>Go to Dashboard</span>
            <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* Card 2: Explore Domains */}
        <Link
          href="/#domains"
          className="group rounded-2xl border border-line bg-white p-6 hover:border-ink/30 hover:shadow-sm transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-teal/10 text-teal flex items-center justify-center mb-4">
              <Compass size={20} />
            </div>
            <h3 className="font-display font-semibold text-lg text-ink group-hover:text-teal transition-colors">
              Explore Domains
            </h3>
            <p className="text-xs text-ink/60 mt-1.5 leading-relaxed">
              Discover industry-focused tracks in AI/ML, LLMs, Fullstack, Data Science, IoT, and Robotics.
            </p>
          </div>
          <div className="mt-6 flex items-center gap-1.5 text-xs font-semibold text-teal">
            <span>Browse Domains</span>
            <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* Card 3: Profile & Certifications */}
        <Link
          href="/dashboard/profile"
          className="group rounded-2xl border border-line bg-white p-6 hover:border-ink/30 hover:shadow-sm transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-marigold/20 text-marigold-dark flex items-center justify-center mb-4">
              <Award size={20} />
            </div>
            <h3 className="font-display font-semibold text-lg text-ink group-hover:text-marigold-dark transition-colors">
              Profile &amp; Certifications
            </h3>
            <p className="text-xs text-ink/60 mt-1.5 leading-relaxed">
              Manage your student profile, view earned verifiable credentials, and share certificates on LinkedIn.
            </p>
          </div>
          <div className="mt-6 flex items-center gap-1.5 text-xs font-semibold text-marigold-dark">
            <span>View Certifications ({completedCount})</span>
            <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* Card 4: Public Certificate Verification */}
        <Link
          href="/verify"
          className="group rounded-2xl border border-line bg-white p-6 hover:border-ink/30 hover:shadow-sm transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4">
              <ShieldCheck size={20} />
            </div>
            <h3 className="font-display font-semibold text-lg text-ink group-hover:text-emerald-700 transition-colors">
              Public Credential Verification
            </h3>
            <p className="text-xs text-ink/60 mt-1.5 leading-relaxed">
              Verify the authenticity of any Yuktii AI Labs completion certificate using its cryptographic ID or QR code.
            </p>
          </div>
          <div className="mt-6 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <span>Verify Credential</span>
            <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
      </div>

      {/* Platform Features Summary */}
      <div className="rounded-2xl border border-line bg-surface/50 p-6 sm:p-8">
        <h3 className="font-display font-semibold text-sm text-ink mb-4">
          How Yuktii AI Labs Works
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs text-ink/70">
          <div>
            <div className="font-semibold text-ink mb-1 flex items-center gap-1.5">
              <Terminal size={14} className="text-teal" />
              <span>1. Code Real Projects</span>
            </div>
            <p className="leading-relaxed">
              Build domain-specific systems using your preferred local environment and publish code to public GitHub repos.
            </p>
          </div>
          <div>
            <div className="font-semibold text-ink mb-1 flex items-center gap-1.5">
              <Sparkles size={14} className="text-violet-600" />
              <span>2. Multi-Agent Evaluation</span>
            </div>
            <p className="leading-relaxed">
              Submissions undergo deterministic checks, test executions, and LLM mentor reviews in under 2 minutes.
            </p>
          </div>
          <div>
            <div className="font-semibold text-ink mb-1 flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span>3. Cryptographic Proof</span>
            </div>
            <p className="leading-relaxed">
              Earn tamper-proof QR certificates with embedded evaluation evidence and verifiable GitHub commit logs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
