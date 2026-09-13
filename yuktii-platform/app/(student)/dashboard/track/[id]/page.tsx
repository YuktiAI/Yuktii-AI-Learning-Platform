import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Lock, ChevronRight, Award, AlertTriangle, RefreshCw, ExternalLink, Cpu, Monitor } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrGenerateStageContent } from '@/lib/ai-generator/getOrGenerateStageContent';
import { AiGenerationError } from '@/lib/ai-generator/AiGenerationError';
import SubmissionForm from './SubmissionForm';
import IotModeSelector from '@/components/IotModeSelector';
import RoboticsModeSelector from '@/components/RoboticsModeSelector';

export default async function TrackDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { stage?: string };
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  let enrollment = await prisma.enrollment.findUnique({
    where: { id: params.id },
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
  });

  if (!enrollment || enrollment.studentId !== session.studentId) return notFound();

  // Auto-upgrade pending payment to active when payment gateway is disabled for testing
  if (enrollment.status === 'PENDING_PAYMENT' && process.env.DISABLE_PAYMENT_GATEWAY !== 'false') {
    enrollment = await prisma.enrollment.update({
      where: { id: params.id },
      data: { status: 'IN_PROGRESS', paymentStatus: 'PAID' },
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
    });
  }

  const stages = enrollment.track.stages;
  const completedStageIds = new Set(
    enrollment.submissions.filter((s) => s.selfCheckCompleted).map((s) => s.stageId)
  );

  // ── Stage gating logic ────────────────────────────────────────────────────
  // Stage 1 is always unlocked. Stage N is unlocked only if stage N-1 is completed.
  // "Active" = highest unlocked, non-completed stage (or last stage if all complete).
  function isStageUnlocked(stageNumber: number): boolean {
    if (stageNumber === 1) return true;
    const prevStage = stages.find((s) => s.stageNumber === stageNumber - 1);
    if (!prevStage) return false;
    return completedStageIds.has(prevStage.id);
  }

  // Find the natural current (active) stage = first unlocked & not yet completed
  const naturalCurrentStage =
    stages.find((s) => isStageUnlocked(s.stageNumber) && !completedStageIds.has(s.id)) ??
    stages[stages.length - 1] ??
    null;

  // Handle ?stage=N query param with server-side redirect on lock violation
  const requestedStageNum = searchParams.stage ? parseInt(searchParams.stage, 10) : null;
  if (requestedStageNum && !isNaN(requestedStageNum)) {
    const requestedStage = stages.find((s) => s.stageNumber === requestedStageNum);
    if (requestedStage && !isStageUnlocked(requestedStageNum)) {
      // Redirect to the active stage instead of showing a locked one
      const activeNum = naturalCurrentStage?.stageNumber ?? 1;
      redirect(`/dashboard/track/${params.id}?stage=${activeNum}`);
    }
  }

  // Displayed stage = query param (if valid & unlocked) or natural current
  const displayedStage = requestedStageNum
    ? (stages.find((s) => s.stageNumber === requestedStageNum) ?? naturalCurrentStage)
    : naturalCurrentStage;

  const currentStage = displayedStage;
  const isTrackComplete = enrollment.status === 'COMPLETED';

  if (stages.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-center">
        <div className="flex justify-center mb-4">
          <Lock size={40} className="text-ink/20" />
        </div>
        <h1 className="font-display text-2xl font-semibold mb-2">Content not yet loaded</h1>
        <p className="text-ink/60 text-sm">
          Stages for this track haven&apos;t been published yet. Check back soon.
        </p>
        <Link href="/dashboard" className="btn-ghost mt-6 inline-flex">← Back to dashboard</Link>
      </div>
    );
  }

  const rubric = (() => {
    try {
      const r = currentStage?.rubricJson;
      if (Array.isArray(r)) return r as string[];
      if (typeof r === 'string') return JSON.parse(r) as string[];
      return [];
    } catch {
      return [];
    }
  })();

  const currentSubmission = currentStage
    ? enrollment.submissions.find((s) => s.stageId === currentStage.id)
    : null;

  // Fetch latest evaluation for this stage (Phase 2 multi-agent evaluation)
  const latestEval = currentStage
    ? await prisma.evaluation.findFirst({
        where: { enrollmentId: enrollment.id, stageId: currentStage.id },
        orderBy: { createdAt: 'desc' },
      })
    : null;

  const existingEvaluation = latestEval
    ? {
        id: latestEval.id,
        status: (latestEval.status as 'queued' | 'running' | 'completed' | 'failed') || 'queued',
        currentStageLabel: latestEval.currentStageLabel,
        finalScore: latestEval.finalScore,
        categoryScores: latestEval.categoryScores ? JSON.parse(latestEval.categoryScores) : null,
        requirementResults: latestEval.requirementResults ? JSON.parse(latestEval.requirementResults) : undefined,
        mentorReport: latestEval.mentorReport ? JSON.parse(latestEval.mentorReport) : null,
        gitHistoryAnalysis: latestEval.gitHistoryAnalysis ? JSON.parse(latestEval.gitHistoryAnalysis) : null,
        deterministicChecks: latestEval.deterministicChecks ? JSON.parse(latestEval.deterministicChecks) : null,
        errorMessage: latestEval.errorMessage,
        scoreDelta: latestEval.scoreDelta,
        completedAt: latestEval.completedAt ? latestEval.completedAt.toISOString() : null,
      }
    : null;

  // ── AI-generated stage content (Call 2) ──────────────────────────────────
  // Check DB first — if a row exists for this enrollment+stage, serve it without calling Groq.
  // If no row, call Groq (Call 2), store result, return it.
  // On any failure, stageContent will be null and stageContentError will be set.
  let stageContent: Awaited<ReturnType<typeof getOrGenerateStageContent>> | null = null;
  let stageContentError: string | null = null;
  let masterPending = false;

  // Only attempt AI content when enrollment has an active master project
  if (currentStage && enrollment.status !== 'PENDING_PAYMENT') {
    // Check if master project is locked yet
    const variantJson = enrollment.aiVariantJson;
    let masterFailed = false;
    if (variantJson) {
      try {
        const v = JSON.parse(variantJson);
        if (v.__failed) masterFailed = true;
      } catch { /* ignore */ }
    }

    if (!enrollment.aiVariantLockedAt) {
      if (masterFailed) {
        stageContentError = 'The AI project generator failed to create your scenario. Please use the Retry button or contact support.';
      } else {
        // Still generating in background
        masterPending = true;
      }
    } else {
      try {
        stageContent = await getOrGenerateStageContent({
          enrollmentId:       enrollment.id,
          stageNumber:        currentStage.stageNumber,
          totalStages:        stages.length,
          domainSlug:         enrollment.track.domain.slug,
          domainName:         enrollment.track.domain.name,
          levelName:          enrollment.track.levelName,
          learningObjectives: currentStage.learningObjectives,
        });
        if (stageContent.generationStatus === 'FAILED') {
          stageContentError = 'Stage content generation failed previously. Click "Retry" to try again.';
          stageContent = null;
        }
      } catch (err) {
        stageContentError = err instanceof AiGenerationError
          ? err.message
          : 'An unexpected error occurred generating your project content.';
      }
    }
  }

  // ── IoT Domain Mandatory Mode Selection (Software Simulation vs Hardware Model) ──
  if (enrollment.track.domain.slug === 'iot' && !enrollment.iotMode) {
    return <IotModeSelector enrollmentId={enrollment.id} />;
  }

  // ── Robotics Domain Mandatory Mode Selection (Software Simulation vs Hardware Model) ──
  if (enrollment.track.domain.slug === 'robotics' && !enrollment.roboticsMode) {
    return <RoboticsModeSelector enrollmentId={enrollment.id} />;
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-ink/40 mb-8 stage-id">
        <Link href="/dashboard" className="hover:text-ink transition-colors">Dashboard</Link>
        <span>/</span>
        <span>{enrollment.track.domain.name}</span>
        <span>/</span>
        <span>{enrollment.track.duration}-day {enrollment.track.certificateName}</span>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-8">
        {/* ── Stage sidebar ─────────────────────────────────────────────────── */}
        <aside className="hidden lg:block">
          <div className="glass rounded-xl border border-line p-4 sticky top-20">
            <p className="stage-id text-xs text-ink/40 tracking-widest mb-3">STAGES</p>
            <ol className="space-y-1">
              {stages.map((s) => {
                const isDone = completedStageIds.has(s.id);
                const isUnlocked = isStageUnlocked(s.stageNumber);
                const isCurrent = currentStage?.id === s.id;
                const isLocked = !isUnlocked;
                return (
                  <li key={s.id}>
                    {isLocked ? (
                      // Locked stage — not clickable
                      <div
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-ink/30 cursor-not-allowed"
                        title="Complete previous stages to unlock"
                      >
                        <Lock size={13} className="shrink-0" />
                        <span className="truncate text-xs font-medium">{s.title || `Stage ${s.stageNumber}`}</span>
                      </div>
                    ) : (
                      <Link
                        href={`/dashboard/track/${params.id}?stage=${s.stageNumber}`}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isCurrent
                            ? 'bg-ink text-paper'
                            : isDone
                            ? 'bg-teal/8 text-teal hover:bg-teal/12'
                            : 'text-ink/60 hover:bg-ink/5'
                        }`}
                      >
                        <span className="shrink-0">
                          {isDone ? (
                            <CheckCircle2 size={13} className="text-teal" />
                          ) : isCurrent ? (
                            <ChevronRight size={13} />
                          ) : (
                            <span className="stage-id text-xs w-[13px] text-center">{s.stageNumber}</span>
                          )}
                        </span>
                        <span className="truncate text-xs font-medium">{s.title || `Stage ${s.stageNumber}`}</span>
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>

            <hr className="divider my-4" />
            <div className="text-xs text-ink/40 space-y-1.5">
              <div className="flex items-center gap-2"><CheckCircle2 size={11} className="text-teal" /> Complete</div>
              <div className="flex items-center gap-2"><ChevronRight size={11} className="text-ink/60" /> Active</div>
              <div className="flex items-center gap-2"><Lock size={11} className="text-ink/30" /> Locked</div>
            </div>
          </div>
        </aside>

        {/* ── Main content ──────────────────────────────────────────────────── */}
        <div>
          {/* Track header */}
          <div className="mb-8">
            <p className="stage-id text-xs text-teal tracking-widest mb-1">
              {enrollment.track.domain.name} · Stage {currentStage?.stageNumber ?? '—'} of {stages.length}
            </p>
            <h1 className="font-display text-3xl font-semibold">
              {currentStage?.title || enrollment.track.certificateName}
            </h1>

            {/* Mobile stage selector */}
            <div className="flex flex-wrap gap-2 mt-4 lg:hidden">
              {stages.map((s) => {
                const isDone = completedStageIds.has(s.id);
                const isCurrent = currentStage?.id === s.id;
                const isLocked = !isStageUnlocked(s.stageNumber);
                if (isLocked) {
                  return (
                    <span key={s.id} className="stage-id text-xs px-2 py-1 rounded-md border border-line text-ink/25 flex items-center gap-1">
                      <Lock size={10} />
                    </span>
                  );
                }
                return (
                  <Link
                    key={s.id}
                    href={`/dashboard/track/${params.id}?stage=${s.stageNumber}`}
                    className={`stage-id text-xs px-2 py-1 rounded-md border ${
                      isDone ? 'bg-teal/10 border-teal/30 text-teal' :
                      isCurrent ? 'bg-ink text-paper border-ink' :
                      'border-line text-ink/40'
                    }`}
                  >
                    {isDone ? <CheckCircle2 size={11} /> : s.stageNumber}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Track completed state */}
          {isTrackComplete && enrollment.certificate && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 mb-6">
              <div className="flex items-start gap-4">
                <Award size={32} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-display text-xl font-semibold text-emerald-800 mb-1">
                    Track complete — certificate issued!
                  </h2>
                  <p className="text-sm text-emerald-700 mb-3">
                    You&apos;ve completed all stages. Your verifiable certificate is ready.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={`/verify/${enrollment.certificate.publicCertificateId}`}
                      target="_blank"
                      className="btn-gold text-sm"
                    >
                      View certificate ↗
                    </Link>
                    <Link href="/dashboard" className="btn-ghost text-sm">
                      Back to dashboard
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStage && (
            <>
              {/* Plain-language intro */}
              <div className="glass rounded-xl border border-line p-6 mb-5">
                <h2 className="font-medium text-xs stage-id text-ink/40 tracking-widest mb-3">BEFORE YOU START</h2>
                <p className="text-ink/80 whitespace-pre-wrap leading-relaxed">{currentStage.plainLanguageIntro}</p>
              </div>

              {/* Learning objectives */}
              {currentStage.learningObjectives && (
                <div className="bg-teal/5 border border-teal/20 rounded-xl p-5 mb-5">
                  <h2 className="font-medium text-xs stage-id text-teal tracking-widest mb-3">LEARNING OBJECTIVES</h2>
                  <p className="text-sm text-ink/75 whitespace-pre-wrap leading-relaxed">
                    {currentStage.learningObjectives}
                  </p>
                </div>
              )}

              {/* IoT Domain Active Mode Banner */}
              {enrollment.track.domain.slug === 'iot' && (
                <div className={`rounded-xl border p-5 mb-5 ${
                  enrollment.iotMode === 'hardware'
                    ? 'border-amber-300 bg-amber-50/80 text-amber-950'
                    : 'border-teal/30 bg-teal/5 text-teal-950'
                }`}>
                  <div className="flex items-start gap-3">
                    {enrollment.iotMode === 'hardware' ? (
                      <Cpu size={22} className="text-amber-700 shrink-0 mt-0.5" />
                    ) : (
                      <Monitor size={22} className="text-teal shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display font-semibold text-sm">
                          {enrollment.iotMode === 'hardware'
                            ? 'IoT Track Mode: Hardware Model Development (Physical Build)'
                            : 'IoT Track Mode: Software Simulation (100% Free Open-Source)'}
                        </h3>
                        <span className="badge text-[10px] bg-white border border-current">
                          {enrollment.iotMode?.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs mt-1 leading-relaxed opacity-90">
                        {enrollment.iotMode === 'hardware'
                          ? 'Students are instructed to purchase their required components from the list below to build their physical model. Follow the step-by-step wiring instructions. (Low-voltage 3.3V–5V only).'
                          : 'Simulate your circuit using 100% free open-source software (Wokwi / Tinkercad Circuits / Proteus). Follow the step-by-step simulator instructions.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* AI-generated project task — structured content */}
              <div className="rounded-xl border border-marigold/30 bg-marigold/5 p-6 mb-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-medium text-xs stage-id text-marigold-dark tracking-widest">YOUR PROJECT TASK</h2>
                  {stageContent && (
                    <span className="text-[10px] stage-id text-marigold-dark/60 bg-marigold/10 border border-marigold/20 rounded px-2 py-0.5">
                      AI-personalised · {stageContent.estimatedEffort || 'varies'}
                    </span>
                  )}
                </div>

                {/* Pending state — master project still being generated */}
                {masterPending && (
                  <div className="flex items-start gap-3 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <RefreshCw size={18} className="shrink-0 mt-0.5 animate-spin" />
                    <div>
                      <p className="font-medium text-sm">Generating your unique project scenario...</p>
                      <p className="text-xs text-amber-600 mt-1">This usually takes 5-15 seconds. Refresh the page in a moment.</p>
                    </div>
                  </div>
                )}

                {/* Error state — generation failed */}
                {stageContentError && (
                  <div className="flex items-start gap-3 text-red-700 bg-red-50 border border-red-200 rounded-lg p-4">
                    <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Project generation failed</p>
                      <p className="text-xs text-red-600 mt-1">{stageContentError}</p>
                      <form
                        action="/api/enrollments/regenerate-stage"
                        method="POST"
                        className="mt-3"
                        onSubmit={undefined}
                      >
                        <Link
                          href={`/dashboard/track/${params.id}?stage=${currentStage.stageNumber}&retry=1`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 underline hover:no-underline"
                        >
                          <RefreshCw size={12} /> Retry generation
                        </Link>
                      </form>
                    </div>
                  </div>
                )}

                {/* Success state — show structured AI content */}
                {stageContent && !stageContentError && (
                  <div className="space-y-5">
                    {/* Problem statement */}
                    <div>
                      <p className="text-xs font-semibold text-marigold-dark/70 uppercase tracking-wider mb-2">Problem Statement</p>
                      <p className="text-ink/85 leading-relaxed text-sm">{stageContent.problemStatement}</p>
                    </div>

                    {/* Requirements */}
                    {stageContent.requirements.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-marigold-dark/70 uppercase tracking-wider mb-2">Requirements</p>
                        <ol className="space-y-1.5">
                          {stageContent.requirements.map((req, i) => (
                            <li key={i} className="flex gap-2.5 text-sm text-ink/80">
                              <span className="stage-id text-marigold-dark font-bold shrink-0">{i + 1}.</span>
                              <span>{req}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Curated resources */}
                    {stageContent.matchedResources.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-marigold-dark/70 uppercase tracking-wider mb-2">Suggested Resources & Tools</p>
                        <ul className="space-y-1.5">
                          {stageContent.matchedResources.map((r) => (
                            <li key={r.id} className="flex items-start gap-2">
                              <ExternalLink size={13} className="text-marigold-dark shrink-0 mt-0.5" />
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-teal hover:underline"
                              >
                                {r.title}
                                <span className="ml-1 text-xs text-ink/40 stage-id">({r.sourceType})</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Acceptance criteria */}
                    {stageContent.acceptanceCriteria.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-marigold-dark/70 uppercase tracking-wider mb-2">Acceptance Criteria</p>
                        <ul className="space-y-1.5">
                          {stageContent.acceptanceCriteria.map((c, i) => (
                            <li key={i} className="flex gap-2 text-sm text-ink/80">
                              <CheckCircle2 size={14} className="text-teal shrink-0 mt-0.5" />
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Fallback: no AI content and not in error — show base stage template */}
                {!stageContent && !stageContentError && !masterPending && (
                  <p className="text-ink/80 whitespace-pre-wrap leading-relaxed text-sm">
                    {currentStage.taskTemplate}
                  </p>
                )}
              </div>

              {/* Submission form + self-check */}
              <SubmissionForm
                enrollmentId={enrollment.id}
                trackEnrollmentId={params.id}
                stageId={currentStage.id}
                modelAnswer={currentStage.modelAnswer}
                rubric={rubric}
                existingSubmission={currentSubmission ? {
                  contentUrl: currentSubmission.contentUrl ?? '',
                  contentNote: currentSubmission.contentNote ?? '',
                  selfCheckCompleted: currentSubmission.selfCheckCompleted,
                  aiEvalPassed: currentSubmission.aiEvalPassed ?? null,
                  aiEvalScore: currentSubmission.aiEvalScore ?? null,
                  aiEvalFeedback: currentSubmission.aiEvalFeedback ?? null,
                } : null}
                isComplete={completedStageIds.has(currentStage.id)}
                stageNumber={currentStage.stageNumber}
                totalStages={stages.length}
                domainSlug={enrollment.track.domain.slug}
                iotMode={enrollment.iotMode}
                stageUnlockSchedule={enrollment.stageUnlockSchedule}
                existingEvaluation={existingEvaluation}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
