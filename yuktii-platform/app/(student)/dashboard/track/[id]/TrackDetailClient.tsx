'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2, Lock, ChevronRight, Award, AlertTriangle, RefreshCw,
  ExternalLink, Cpu, Monitor, Home, Sparkles
} from 'lucide-react';
import SubmissionForm from './SubmissionForm';

interface Stage {
  id: string;
  stageNumber: number;
  title: string;
  plainLanguageIntro: string | null;
  taskTemplate: string;
  learningObjectives: string | null;
  rubricJson: string | any;
  modelAnswer: string;
}

interface TrackDetailClientProps {
  enrollment: {
    id: string;
    studentId: string;
    status: string;
    iotMode?: string | null;
    roboticsMode?: string | null;
    stageUnlockSchedule?: string | null;
    track: {
      duration: number;
      certificateName: string;
      levelName: string;
      domain: {
        name: string;
        slug: string;
      };
    };
    certificate?: {
      publicCertificateId: string;
    } | null;
  };
  stages: Stage[];
  initialStageNumber: number;
  initialSubmissions: any[];
  initialCompletedEvals: { stageId: string; finalScore: number | null }[];
  allEvaluations: any[];
  allStageContents: Record<number, any>;
  isTrackComplete: boolean;
}

export default function TrackDetailClient({
  enrollment,
  stages,
  initialStageNumber,
  initialSubmissions,
  initialCompletedEvals,
  allEvaluations,
  allStageContents,
  isTrackComplete: initialIsTrackComplete,
}: TrackDetailClientProps) {
  const router = useRouter();
  const [activeStageNumber, setActiveStageNumber] = useState<number>(initialStageNumber);
  const [submissions, setSubmissions] = useState<any[]>(initialSubmissions);
  const [completedEvals, setCompletedEvals] = useState(initialCompletedEvals);
  const [isTrackComplete, setIsTrackComplete] = useState(initialIsTrackComplete);
  const [isPending, startTransition] = useTransition();

  // Dynamic AI Stage Content management
  const [stageContents, setStageContents] = useState<Record<number, any>>(allStageContents || {});
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const fetchStageContent = React.useCallback(async (stageNum: number, force: boolean = false) => {
    setIsGenerating(true);
    setGenerationError(null);
    try {
      const url = `/api/enrollments/stage-content?enrollmentId=${enrollment.id}&stageNumber=${stageNum}${force ? '&force=true' : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.ok && data.content) {
        setStageContents((prev) => ({
          ...prev,
          [stageNum]: data.content,
        }));
      } else {
        setGenerationError(data.error || 'Failed to generate stage scenario. Please try again.');
      }
    } catch (e: any) {
      setGenerationError(e?.message || 'Network error while fetching stage scenario.');
    } finally {
      setIsGenerating(false);
    }
  }, [enrollment.id]);

  React.useEffect(() => {
    const existing = stageContents[activeStageNumber];
    if (
      !existing ||
      existing.generationStatus === 'FAILED' ||
      !existing.problemStatement ||
      existing.problemStatement.includes('Your personalised project scenario will appear here')
    ) {
      fetchStageContent(activeStageNumber, false);
    }
  }, [activeStageNumber, fetchStageContent]);

  // Instant stage selection handler — 0ms lag!
  function handleSelectStage(stageNum: number) {
    if (stageNum < 1 || stageNum > stages.length) return;
    setActiveStageNumber(stageNum);
    // Update browser URL without triggering full server roundtrip
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `/dashboard/track/${enrollment.id}?stage=${stageNum}`);
    }
  }

  // Set of completed stage IDs
  const completedStageIds = new Set([
    ...submissions.filter((s) => s.selfCheckCompleted || s.aiEvalPassed !== null || s.aiEvalScore !== null || Boolean(s.contentUrl)).map((s) => s.stageId),
    ...completedEvals.map((e) => e.stageId),
  ]);

  // Current stage object
  const currentStage = stages.find((s) => s.stageNumber === activeStageNumber) || stages[0];
  const nextStage = stages.find((s) => s.stageNumber === activeStageNumber + 1) || null;
  const currentStageComplete = currentStage ? completedStageIds.has(currentStage.id) : false;

  // Active submission for this stage
  const currentSubmission = currentStage
    ? submissions.find((s) => s.stageId === currentStage.id) || null
    : null;

  // Latest evaluation for this stage
  const latestEval = currentStage
    ? allEvaluations.find((e) => e.stageId === currentStage.id) || null
    : null;

  const existingEvaluation = latestEval
    ? {
        id: latestEval.id,
        status: latestEval.status || 'queued',
        currentStageLabel: latestEval.currentStageLabel,
        finalScore: latestEval.finalScore,
        categoryScores: typeof latestEval.categoryScores === 'string' ? JSON.parse(latestEval.categoryScores || '{}') : latestEval.categoryScores,
        requirementResults: typeof latestEval.requirementResults === 'string' ? JSON.parse(latestEval.requirementResults || '[]') : latestEval.requirementResults,
        mentorReport: typeof latestEval.mentorReport === 'string' ? JSON.parse(latestEval.mentorReport || '{}') : latestEval.mentorReport,
        gitHistoryAnalysis: typeof latestEval.gitHistoryAnalysis === 'string' ? JSON.parse(latestEval.gitHistoryAnalysis || '{}') : latestEval.gitHistoryAnalysis,
        deterministicChecks: typeof latestEval.deterministicChecks === 'string' ? JSON.parse(latestEval.deterministicChecks || '{}') : latestEval.deterministicChecks,
        aiUsageAnalysis: typeof latestEval.aiUsageAnalysis === 'string' ? JSON.parse(latestEval.aiUsageAnalysis || '{}') : latestEval.aiUsageAnalysis,
        modelAnswer: latestEval.modelAnswer ?? null,
        submissionRecord: latestEval.submissionRecord ? {
          submittedUrl: latestEval.submissionRecord.submittedUrl,
          commitSha: latestEval.submissionRecord.commitSha,
          submittedAt: new Date(latestEval.submissionRecord.submittedAt).toISOString(),
        } : null,
        errorMessage: latestEval.errorMessage,
        scoreDelta: latestEval.scoreDelta,
        completedAt: latestEval.completedAt ? new Date(latestEval.completedAt).toISOString() : null,
      }
    : null;

  // Currently resolved stage content (real AI-generated only)
  const rawContent = currentStage ? stageContents[currentStage.stageNumber] : null;
  const stageContent = (rawContent && rawContent.generationStatus !== 'FAILED' && rawContent.problemStatement && rawContent.problemStatement.trim().length > 0 && !rawContent.problemStatement.includes('Your personalised project scenario will appear here'))
    ? rawContent
    : null;


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

  // Instant completion handler (called by 1-click test button)
  function handleStageCompleted(completedStageNum: number, newSub?: any) {
    if (newSub && currentStage) {
      setSubmissions((prev) => {
        const filtered = prev.filter((s) => s.stageId !== currentStage.id);
        return [...filtered, newSub];
      });
    } else if (currentStage) {
      setSubmissions((prev) => {
        const filtered = prev.filter((s) => s.stageId !== currentStage.id);
        return [
          ...filtered,
          {
            stageId: currentStage.id,
            selfCheckCompleted: true,
            aiEvalPassed: true,
            aiEvalScore: 100,
            contentUrl: '',
          },
        ];
      });
    }

    // Auto-advance to next stage immediately in 0ms!
    if (completedStageNum < stages.length) {
      handleSelectStage(completedStageNum + 1);
    } else {
      setIsTrackComplete(true);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-ink/40 mb-8 stage-id">
        <Link href="/" className="hover:text-ink transition-colors flex items-center gap-1">
          <Home size={11} />Home
        </Link>
        <span>/</span>
        <Link href="/dashboard" className="hover:text-ink transition-colors">
          Dashboard
        </Link>
        <span>/</span>
        <span>{enrollment.track.domain.name}</span>
        <span>/</span>
        <span>{enrollment.track.duration}-day {enrollment.track.certificateName}</span>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-8">
        {/* ── Stage sidebar ─────────────────────────────────────────────────── */}
        <aside className="hidden lg:block">
          <div className="glass rounded-xl border border-line p-4 sticky top-20">
            <div className="flex items-center justify-between mb-3">
              <p className="stage-id text-xs text-ink/40 tracking-widest">STAGES</p>
            </div>
            <ol className="space-y-1">
              {stages.map((s) => {
                const isDone = completedStageIds.has(s.id);
                const isCurrent = currentStage?.id === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectStage(s.stageNumber)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left ${
                        isCurrent
                          ? 'bg-ink text-paper shadow-sm font-semibold'
                          : isDone
                          ? 'bg-teal/8 text-teal hover:bg-teal/15 font-medium'
                          : 'text-ink/70 hover:bg-ink/5'
                      }`}
                    >
                      <span className="shrink-0">
                        {isDone ? (
                          <CheckCircle2 size={13} className={isCurrent ? "text-teal-300" : "text-teal"} />
                        ) : isCurrent ? (
                          <ChevronRight size={13} />
                        ) : (
                          <span className="stage-id text-xs w-[13px] text-center inline-block">{s.stageNumber}</span>
                        )}
                      </span>
                      <span className="truncate text-xs">{s.title || `Stage ${s.stageNumber}`}</span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="text-xs text-ink/40 space-y-1.5">
              <div className="flex items-center gap-2"><CheckCircle2 size={11} className="text-teal" /> Completed</div>
              <div className="flex items-center gap-2"><ChevronRight size={11} className="text-ink/60" /> Current Stage</div>
            </div>
          </div>
        </aside>

        {/* ── Main content ──────────────────────────────────────────────────── */}
        <div>
          {/* Track header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <p className="stage-id text-xs text-teal tracking-widest mb-1">
                {enrollment.track.domain.name} · Stage {currentStage?.stageNumber ?? '—'} of {stages.length}
              </p>
            </div>
            <h1 className="font-display text-3xl font-semibold">
              {currentStage?.title || enrollment.track.certificateName}
            </h1>

            {/* Mobile stage selector */}
            <div className="flex flex-wrap gap-2 mt-4 lg:hidden">
              {stages.map((s) => {
                const isDone = completedStageIds.has(s.id);
                const isCurrent = currentStage?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectStage(s.stageNumber)}
                    className={`stage-id text-xs px-2.5 py-1.5 rounded-md border transition-all ${
                      isCurrent ? 'bg-ink text-paper border-ink font-bold' :
                      isDone ? 'bg-teal/10 border-teal/30 text-teal' :
                      'border-line text-ink/60 hover:bg-gray-100'
                    }`}
                  >
                    {isDone ? <CheckCircle2 size={11} className="inline mr-1" /> : null}
                    Stage {s.stageNumber}
                  </button>
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
              {currentStage.plainLanguageIntro && (
                <div className="glass rounded-xl border border-line p-6 mb-5">
                  <h2 className="font-medium text-xs stage-id text-ink/40 tracking-widest mb-3">BEFORE YOU START</h2>
                  <p className="text-ink/80 whitespace-pre-wrap leading-relaxed">{currentStage.plainLanguageIntro}</p>
                </div>
              )}

              {/* Learning objectives */}
              {currentStage.learningObjectives && (
                <div className="bg-teal/5 border border-teal/20 rounded-xl p-5 mb-5">
                  <h2 className="font-medium text-xs stage-id text-teal tracking-widest mb-3">LEARNING OBJECTIVES</h2>
                  <p className="text-sm text-ink/75 whitespace-pre-wrap leading-relaxed">
                    {currentStage.learningObjectives}
                  </p>
                </div>
              )}

              {/* Project task & specifications */}
              <div className="rounded-xl border border-marigold/30 bg-marigold/5 p-6 mb-5 transition-all">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-marigold/20">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium text-xs stage-id text-marigold-dark tracking-widest uppercase">
                      STAGE TASK SPECIFICATION
                    </h2>
                    {stageContent && (
                      <span className="text-[10px] stage-id text-marigold-dark/80 bg-marigold/15 border border-marigold/30 rounded px-2 py-0.5 font-semibold">
                        {stageContent.estimatedEffort || '2-3 hours'}
                      </span>
                    )}
                  </div>

                  {/* Manual trigger / regenerate button for every stage */}
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => fetchStageContent(activeStageNumber, true)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition ${
                      isGenerating
                        ? 'bg-amber-100 text-amber-700 border border-amber-300 opacity-80 cursor-wait'
                        : stageContent
                        ? 'bg-white hover:bg-amber-50 text-marigold-dark border border-marigold/40 hover:border-marigold active:scale-[0.98]'
                        : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-amber-500/20 active:scale-[0.98]'
                    }`}
                    title={
                      stageContent
                        ? 'Click to regenerate a fresh custom AI scenario for this stage'
                        : 'Click to generate your custom AI project scenario for this stage'
                    }
                  >
                    {isGenerating ? (
                      <>
                        <RefreshCw size={12} className="animate-spin text-amber-700" />
                        <span>Generating Scenario…</span>
                      </>
                    ) : stageContent ? (
                      <>
                        <RefreshCw size={12} className="text-marigold-dark" />
                        <span>Regenerate Scenario</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={12} />
                        <span>Generate Stage Scenario</span>
                      </>
                    )}
                  </button>
                </div>

                {isGenerating && (
                  <div className="py-12 px-6 text-center">
                    <div className="relative w-12 h-12 mx-auto mb-4">
                      <div className="w-12 h-12 border-3 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center text-amber-600">
                        <Sparkles size={18} className="animate-pulse" />
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-ink">Personalising Stage {activeStageNumber} Scenario</p>
                    <p className="text-xs text-ink/65 mt-1.5 max-w-md mx-auto leading-relaxed">
                      Our multi-provider AI curriculum engine is architecting a concrete, industry-aligned project milestone with requirements and acceptance criteria.
                    </p>
                  </div>
                )}

                {generationError && !isGenerating && (
                  <div className="py-6 px-4 text-center bg-rose-50/80 rounded-lg border border-rose-200">
                    <AlertTriangle className="text-rose-500 mx-auto mb-2" size={24} />
                    <p className="text-sm font-semibold text-rose-900">Custom scenario generation unavailable</p>
                    <p className="text-xs text-rose-700 mt-1 mb-4 max-w-md mx-auto">{generationError}</p>
                    <button
                      type="button"
                      onClick={() => fetchStageContent(activeStageNumber, true)}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition active:scale-[0.98]"
                    >
                      <RefreshCw size={12} /> Retry Generation
                    </button>
                  </div>
                )}

                {!stageContent && !isGenerating && !generationError && (
                  <div className="py-10 px-6 text-center bg-white/60 rounded-xl border border-dashed border-marigold/50">
                    <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
                      <Sparkles size={22} />
                    </div>
                    <p className="text-sm font-semibold text-ink">Project Scenario Not Generated Yet</p>
                    <p className="text-xs text-ink/70 mt-1 mb-4 max-w-md mx-auto leading-relaxed">
                      Your personalized, industry-grade project milestone for Stage {activeStageNumber} hasn&apos;t been synthesized yet. Press the button below to generate it now.
                    </p>
                    <button
                      type="button"
                      onClick={() => fetchStageContent(activeStageNumber, true)}
                      className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-2 shadow-sm transition active:scale-[0.98]"
                    >
                      <Sparkles size={14} /> Generate Stage Specification
                    </button>
                  </div>
                )}

                {stageContent && !isGenerating && (
                  <div className="space-y-5">
                    {/* Plain language / Non-technical overview */}
                    {stageContent.nonTechnicalExplanation && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3.5 text-xs text-amber-950 leading-relaxed">
                        <span className="font-semibold block mb-1 text-amber-900 uppercase tracking-wider text-[11px]">Milestone Overview</span>
                        {stageContent.nonTechnicalExplanation}
                      </div>
                    )}

                    {/* Problem statement */}
                    <div>
                      <p className="text-xs font-semibold text-marigold-dark/70 uppercase tracking-wider mb-2">Problem Statement</p>
                      <p className="text-ink/85 leading-relaxed text-sm whitespace-pre-wrap">{stageContent.problemStatement}</p>
                    </div>

                    {/* Requirements list */}
                    {stageContent.requirements && stageContent.requirements.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-marigold-dark/70 uppercase tracking-wider mb-2">Key Requirements</p>
                        <ul className="space-y-1.5">
                          {stageContent.requirements.map((req: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-ink/80">
                              <span className="w-1.5 h-1.5 rounded-full bg-marigold mt-2 shrink-0" />
                              <span>{req}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Acceptance criteria */}
                    {stageContent.acceptanceCriteria && stageContent.acceptanceCriteria.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-marigold-dark/70 uppercase tracking-wider mb-2">Acceptance Criteria</p>
                        <ul className="space-y-1.5">
                          {stageContent.acceptanceCriteria.map((crit: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-ink/80">
                              <CheckCircle2 size={14} className="text-teal mt-0.5 shrink-0" />
                              <span>{crit}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Interactive Submission Form & Test Mode Completion */}
              <SubmissionForm
                key={currentStage.id}
                enrollmentId={enrollment.id}
                trackEnrollmentId={enrollment.id}
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
                isComplete={currentStageComplete}
                stageNumber={currentStage.stageNumber}
                totalStages={stages.length}
                domainSlug={enrollment.track.domain.slug}
                iotMode={enrollment.iotMode}
                stageUnlockSchedule={enrollment.stageUnlockSchedule}
                existingEvaluation={existingEvaluation}
                nextStageHref={nextStage
                  ? `/dashboard/track/${enrollment.id}?stage=${nextStage.stageNumber}`
                  : null}
                onSelectStage={handleSelectStage}
                onStageCompleted={(num) => handleStageCompleted(num)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
