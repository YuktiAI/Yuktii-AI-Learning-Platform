import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Award, CheckCircle2, Code2, ExternalLink, GitCommit, ShieldCheck } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const PASS_SCORE = 50;

type CategoryScores = Record<string, number>;

function parseScores(value: string | null): CategoryScores {
  if (!value) return {};
  try { return JSON.parse(value) as CategoryScores; } catch { return {}; }
}

function labelForSkill(skill: string): string {
  return skill.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

export default async function PortfolioPage() {
  const session = await getSession();
  if (!session) redirect('/login?returnTo=/dashboard/portfolio');

  const evaluations = await prisma.evaluation.findMany({
    where: {
      enrollment: { studentId: session.studentId },
      status: 'completed',
      finalScore: { gte: PASS_SCORE },
    },
    include: {
      enrollment: { include: { track: { include: { domain: true, stages: true } } } },
      submissionRecord: true,
    },
    orderBy: { completedAt: 'desc' },
  });

  const skillSet = new Set<string>();
  for (const evaluation of evaluations) {
    for (const [skill, score] of Object.entries(parseScores(evaluation.categoryScores))) {
      if (score >= PASS_SCORE) skillSet.add(labelForSkill(skill));
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 space-y-8">
      <section className="rounded-2xl border border-teal/20 bg-gradient-to-br from-teal/10 via-white to-marigold/10 p-7">
        <p className="text-xs font-semibold tracking-widest text-teal uppercase">Verified proof of skill</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Your project evidence portfolio</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink/70">
          Each project below is linked to the evaluated Git commit, requirement evidence, and technical score. This is stronger than a completion-only certificate because it shows what you actually built.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="rounded-full border border-teal/20 bg-white px-3 py-1 text-xs font-semibold text-teal">Pass mark: 50/100</span>
          <span className="rounded-full border border-teal/20 bg-white px-3 py-1 text-xs font-semibold text-teal">{evaluations.length} verified project{evaluations.length === 1 ? '' : 's'}</span>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Code2 size={18} className="text-teal" />
          <h2 className="font-display text-xl font-semibold">Demonstrated skills</h2>
        </div>
        {skillSet.size > 0 ? (
          <div className="flex flex-wrap gap-2">
            {Array.from(skillSet).sort().map((skill) => (
              <span key={skill} className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink">{skill}</span>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-line bg-white p-5 text-sm text-ink/60">Pass a project evaluation to add verified skills here.</p>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-teal" />
          <h2 className="font-display text-xl font-semibold">Verified projects</h2>
        </div>
        {evaluations.length === 0 ? (
          <div className="rounded-xl border border-line bg-white p-8 text-center">
            <Award size={32} className="mx-auto mb-3 text-ink/20" />
            <p className="text-sm text-ink/60">Your passed project evaluations will appear here.</p>
            <Link href="/dashboard" className="mt-4 inline-block text-sm font-semibold text-teal hover:underline">Continue learning</Link>
          </div>
        ) : evaluations.map((evaluation) => {
          const scores = parseScores(evaluation.categoryScores);
          const stage = evaluation.enrollment.track.stages.find((item) => item.id === evaluation.stageId);
          return (
            <article key={evaluation.id} className="rounded-xl border border-line bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-teal">{evaluation.enrollment.track.domain.name}</p>
                  <h3 className="mt-1 font-display text-lg font-semibold text-ink">{stage?.title ?? `Stage ${stage?.stageNumber ?? ''} project`}</h3>
                  <p className="mt-1 text-xs text-ink/55">Completed {evaluation.completedAt?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) ?? 'recently'}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-emerald-800">
                  <p className="text-xl font-bold">{evaluation.finalScore}/100</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider">Verified pass</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                  <p className="font-semibold">Git evidence</p>
                  <p className="mt-1 flex items-center gap-1.5 break-all font-mono text-[11px]"><GitCommit size={13} />{evaluation.submissionRecord.commitSha ?? 'Commit SHA unavailable'}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                  <p className="font-semibold">Repository</p>
                  <a href={evaluation.submissionRecord.submittedUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-teal hover:underline"><ExternalLink size={12} />Open submitted project</a>
                </div>
              </div>

              {Object.keys(scores).length > 0 && (
                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {Object.entries(scores).map(([name, score]) => (
                    <div key={name} className="rounded-lg border border-line px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-ink/45">{labelForSkill(name)}</p>
                      <p className={`mt-0.5 text-sm font-bold ${score >= PASS_SCORE ? 'text-emerald-700' : 'text-red-600'}`}>{score}/100</p>
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
