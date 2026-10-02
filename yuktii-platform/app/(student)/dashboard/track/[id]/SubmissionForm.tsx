'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Award,
  CheckCircle2,
  XCircle,
  Check,
  X,
  BookOpen,
  Clock,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  Lock,
} from 'lucide-react';
import type { StageAccess } from '@/lib/stage-access';


// ── Full evaluation pipeline types ───────────────────────────────────────────
type RequirementResult = {
  reqId: string;
  reqText: string;
  status: 'PASS' | 'PARTIAL' | 'FAIL';
  evidence: string;
  missing: string;
};

type CategoryScores = {
  requirements: number;
  functionality: number;
  codeQuality: number;
  architecture: number;
  devProcess: number;
  testing: number;
  documentation: number;
  security: number;
  innovation: number;
};

type MentorReport = {
  score: number;
  strengths: string[];
  gaps: string[];
  reasoning: string;
  improvements: string[];
  nextSteps: string[];
};

type FullEvaluation = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'needs_review' | 'failed';
  currentStageLabel?: string | null;
  finalScore?: number | null;
  categoryScores?: CategoryScores | null;
  requirementResults?: RequirementResult[];
  mentorReport?: MentorReport | null;
  gitHistoryAnalysis?: { commitCount: number; durationDays: number; summary: string } | null;
  deterministicChecks?: {
    readmeFound: boolean;
    buildSucceeds: boolean;
    testsRun: boolean;
    testsPassCount: number;
    testsFailCount: number;
  } | null;
  errorMessage?: string | null;
  scoreDelta?: number | null;
  previousEvaluation?: { id: string; finalScore: number | null; completedAt: string; submissionRecord?: { commitSha: string | null } } | null;
  submissionRecord?: { submittedUrl: string; commitSha: string | null; submittedAt: string } | null;
  aiUsageAnalysis?: {
    policy: string;
    status: 'disclosed_or_marked' | 'no_explicit_markers';
    warning: string | null;
    markers: string[];
    suspectedFiles?: string[];
  } | null;
  modelAnswer?: string | null;
  completedAt?: string | null;
};

type Props = {
  enrollmentId: string;
  trackEnrollmentId: string;
  stageId: string;
  modelAnswer: string;
  rubric: string[];
  existingSubmission: {
    contentUrl: string;
    contentNote: string;
    selfCheckCompleted: boolean;
    aiEvalPassed?: boolean | null;
    aiEvalScore?: number | null;
    aiEvalFeedback?: string | null;
  } | null;
  isComplete: boolean;
  stageNumber: number;
  totalStages: number;
  domainSlug?: string;
  iotMode?: string | null;
  stageUnlockSchedule?: string | null; // JSON: { "1": ISO, "2": ISO, ... }
  nextStageHref?: string | null;
  existingEvaluation?: FullEvaluation | null;
  onSelectStage?: (stageNumber: number) => void;
  onStageCompleted?: (stageNumber: number, submission?: any) => void;
  stageAccess?: StageAccess;
};


export default function SubmissionForm({
  enrollmentId,
  trackEnrollmentId,
  stageId,
  modelAnswer,
  existingSubmission,
  isComplete,
  stageNumber,
  totalStages,
  domainSlug,
  iotMode,
  stageUnlockSchedule,
  existingEvaluation,
  nextStageHref,
  onSelectStage,
  onStageCompleted,
  stageAccess,
}: Props) {
  const router = useRouter();
  const isLast = stageNumber >= totalStages;


  // ── Stage Access & Unlock Pacing State ──────────────────
  const [unlockCountdown, setUnlockCountdown] = useState<string | null>(null);

  // Compute unlocksAt from stageAccess (authoritative) or schedule JSON fallback
  const unlocksAt: Date | null = (() => {
    if (stageAccess?.submissionOpensAt) {
      const d = new Date(stageAccess.submissionOpensAt);
      if (!isNaN(d.getTime())) return d;
    }
    if (!stageUnlockSchedule) return null;
    try {
      const schedule = JSON.parse(stageUnlockSchedule) as Record<string, string>;
      const iso = schedule[String(stageNumber)];
      if (!iso) return null;
      const d = new Date(iso);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  })();

  const isPassed = stageAccess ? stageAccess.isPassed : isComplete;
  const canSubmit = stageAccess ? stageAccess.canSubmit : (!unlocksAt || new Date() >= unlocksAt || isPassed);
  const isLockedPrereq = stageAccess?.state === 'LOCKED_PREREQUISITE';
  const isLockedPacing = stageAccess ? stageAccess.state === 'SCENARIO_OPEN_SUBMISSION_LOCKED' : (!canSubmit && unlocksAt && new Date() < unlocksAt);
  const isUnlocked = canSubmit || isPassed;

  useEffect(() => {
    if (!unlocksAt || !isLockedPacing) {
      setUnlockCountdown(null);
      return;
    }
    function update() {
      const now = Date.now();
      const diff = unlocksAt!.getTime() - now;
      if (diff <= 0) {
        setUnlockCountdown(null);
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      if (d > 0) setUnlockCountdown(`${d}d ${h}h`);
      else if (h > 0) setUnlockCountdown(`${h}h ${m}m`);
      else setUnlockCountdown(`${m}m`);
    }
    update();
    const t = setInterval(update, 30_000);
    return () => clearInterval(t);
  }, [unlocksAt, isUnlocked]);

  // ── Form & Submission Phase State ──────────────────────────────────────────
  // If the stage is passed (isComplete) but NOT in the done phase yet because
  // the student hit "View full breakdown", keep them in evaluate phase.
  // Phase progression: submit → evaluate → done.
  // For passed stages we keep them in 'evaluate' so they can resubmit.
  const [phase, setPhase] = useState<'submit' | 'evaluate' | 'done'>(
    isComplete && existingEvaluation
      ? 'evaluate'
      : isComplete
      ? 'done'
      : existingSubmission
      ? 'evaluate'
      : 'submit'
  );

  const [url, setUrl] = useState(existingSubmission?.contentUrl ?? '');
  const [note, setNote] = useState(existingSubmission?.contentNote ?? '');
  const [urlErr, setUrlErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState('');

  // ── Evaluation Pipeline State ──────────────────────────────────────────────
  const [repoUrl, setRepoUrl] = useState(
    existingSubmission?.contentUrl && existingSubmission.contentUrl.includes('github.com')
      ? existingSubmission.contentUrl
      : ''
  );
  const [repoUrlErr, setRepoUrlErr] = useState('');
  const [submittingEval, setSubmittingEval] = useState(false);
  const [evalSubmitErr, setEvalSubmitErr] = useState('');
  const [fullEval, setFullEval] = useState<FullEvaluation | null>(existingEvaluation ?? null);
  const [showMentorDetails, setShowMentorDetails] = useState(false);
  const [showRequirements, setShowRequirements] = useState(true);

  // Poll for evaluation updates while status is queued/running
  const pollEvaluation = useCallback(async (evalId: string) => {
    try {
      const res = await fetch(`/api/evaluations/${evalId}`);
      if (!res.ok) return;
      const data: FullEvaluation = await res.json();
      setFullEval(data);
      if ((data.status === 'completed' || data.status === 'needs_review') && (data.finalScore ?? 0) >= 0) {
        setPhase('done');
        // Trigger a server-side refresh so the stage sidebar updates with the new completion
        router.refresh();
      }
      return data.status;
    } catch {
      return null;
    }
  }, [router]);


  useEffect(() => {
    if (!fullEval?.id) return;
    if (fullEval.status !== 'queued' && fullEval.status !== 'running') return;
    const interval = setInterval(async () => {
      const status = await pollEvaluation(fullEval.id);
      if (status === 'completed' || status === 'needs_review' || status === 'failed') {
        clearInterval(interval);
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [fullEval?.id, fullEval?.status, pollEvaluation]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr('');

    let targetUrl = url.trim();
    if (!targetUrl) {
      setUrlErr('Please enter a link to your work');
      return;
    }
    try {
      new URL(targetUrl);
      setUrlErr('');
    } catch {
      setUrlErr('Please enter a valid URL');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollmentId,
          stageId,
          contentUrl: targetUrl,
          contentNote: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit');

      if (url.trim().includes('github.com')) {
        setRepoUrl(url.trim());
      }
      setPhase('evaluate');
    } catch (err: any) {
      setSubmitErr(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitForEvaluation() {
    setRepoUrlErr('');
    setEvalSubmitErr('');
    const targetUrl = repoUrl.trim() || url.trim();

    if (!targetUrl) {
      setRepoUrlErr('Please enter your GitHub repository URL');
      return;
    }
    if (!targetUrl.includes('github.com')) {
      setRepoUrlErr('Please enter a public GitHub repository URL (e.g. https://github.com/username/repo)');
      return;
    }
    setSubmittingEval(true);
    try {
      const res = await fetch('/api/evaluations/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId, stageId, repoUrl: targetUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to submit for evaluation');

      if (data.cached) {
        setEvalSubmitErr(data.message || 'No new GitHub commit was found. Pushing new commits is required to improve your score.');
        setSubmittingEval(false);
        return;
      }

      const initialEval: FullEvaluation = {
        id: data.evaluationId,
        status: (data.status as 'queued' | 'running') || 'queued',
        currentStageLabel:
          data.status === 'running'
            ? 'Evaluation started — fetching repository…'
            : 'Queued — waiting to start…',
      };
      setFullEval(initialEval);
      setTimeout(() => pollEvaluation(data.evaluationId), 3000);
    } catch (err: any) {
      setEvalSubmitErr(err.message);
    } finally {
      setSubmittingEval(false);
    }
  }

  // ── Prerequisite locked state ───────────────────────────────────────────────
  if (isLockedPrereq) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 flex items-start gap-3">
        <Lock size={20} className="text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-amber-900">
            Stage {stageNumber} Locked
          </h3>
          <p className="text-xs text-amber-700 mt-1 leading-relaxed">
            {stageAccess?.reason || `Complete Stage ${stageNumber - 1} before submitting Stage ${stageNumber}.`}
          </p>
        </div>
      </div>
    );
  }

  // ── Pacing locked state (Scenario is open, submission locked until date) ─────
  if (isLockedPacing) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 flex items-start gap-3">
          <Clock size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-amber-900">
              Stage {stageNumber} scenario is ready! Submissions open {unlockCountdown ? `in ${unlockCountdown}` : 'soon'}
            </h3>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              {stageAccess?.reason || `Submissions open on ${unlocksAt?.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}. Use these days to understand the scenario and build your solution.`}
            </p>
          </div>
        </div>
        <ModelAnswerSection
          modelAnswer={fullEval?.modelAnswer || modelAnswer}
          isDynamic={Boolean(fullEval?.modelAnswer)}
        />
      </div>
    );
  }

  /* ── DONE STATE (Section 8) ───────────────────────────────────────────────── */
  if (phase === 'done') {
    return (
      <div className="space-y-6">
        <div
          className={`rounded-xl border p-6 ${
            isLast ? 'border-emerald-200 bg-emerald-50' : 'border-teal/30 bg-teal/5'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5">
              {isLast ? <Award size={24} className="text-emerald-600" /> : <CheckCircle2 size={24} className="text-teal" />}
            </div>
            <div className="flex-1">
              <h3 className="font-display text-lg font-semibold mb-1">
                {isLast ? 'Track Complete! 🎓' : `Stage ${stageNumber} complete — you scored ${fullEval?.finalScore ?? '50+'}/100`}
              </h3>
              {isLast ? (
                <>
                  <p className="text-sm text-ink/70 mb-4">
                    All stages passed! Your official certificate has been generated and is ready in your profile.
                  </p>
                  <a
                    href="/dashboard/profile"
                    className="btn-primary inline-flex items-center gap-2"
                  >
                    <Award size={15} /> View Certificate in Profile →
                  </a>
                </>
              ) : (
                <>
                  <p className="text-sm text-ink/70 mb-3">
                    You scored <strong>{fullEval?.finalScore ?? '50+'}/100</strong> — the next stage is now unlocked.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (onSelectStage) {
                        onSelectStage(stageNumber + 1);
                      } else if (nextStageHref) {
                        router.push(nextStageHref);
                      } else {
                        router.push(`/dashboard/track/${trackEnrollmentId}?stage=${stageNumber + 1}`);
                      }
                    }}
                    className="btn-teal text-sm inline-flex items-center gap-1.5"
                  >
                    Continue to Stage {stageNumber + 1} <ChevronRight size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {fullEval && fullEval.finalScore !== null && fullEval.finalScore !== undefined && (
          <div className="rounded-xl border border-line bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-ink/60 uppercase tracking-wider">Evaluation Score</h4>
              <span className="text-sm font-bold text-emerald-700">{fullEval.finalScore}/100</span>
            </div>
            {fullEval.mentorReport?.reasoning && (
              <p className="text-xs text-ink/70 leading-relaxed bg-gray-50 p-3 rounded-lg border border-line/60">
                {fullEval.mentorReport.reasoning}
              </p>
            )}
            <button
              type="button"
              onClick={() => setPhase('evaluate')}
              className="text-xs text-teal hover:underline font-medium"
            >
              View full multi-agent breakdown →
            </button>
          </div>
        )}

        {/* Resubmit form directly accessible after passing */}
        {canSubmit && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-violet-900">Improve Your Score</h4>
                <p className="text-xs text-violet-700/80 mt-0.5">
                  Push new commits to your GitHub repository and resubmit anytime. Your pass and best score ({fullEval?.finalScore ?? '50+'}/100) are permanently preserved.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPhase('evaluate')}
                className="text-xs text-teal font-medium hover:underline shrink-0 ml-4"
              >
                View full breakdown →
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={repoUrl || url}
                onChange={(e) => { setRepoUrl(e.target.value); setUrl(e.target.value); setEvalSubmitErr(''); }}
                placeholder="https://github.com/username/repo"
                className="input-field text-sm flex-1"
              />
              <button
                type="button"
                onClick={handleSubmitForEvaluation}
                disabled={submittingEval}
                className="btn-primary text-xs shrink-0"
              >
                {submittingEval ? 'Submitting…' : 'Resubmit with new commit →'}
              </button>
            </div>
            {evalSubmitErr && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{evalSubmitErr}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ── SUBMIT PHASE ─────────────────────────────────────────────────────────── */
  if (phase === 'submit') {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        {isPassed && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <p className="text-xs font-medium text-emerald-800">
                Stage already completed with score <strong>{fullEval?.finalScore ?? '50+'}/100</strong>. Resubmitting with new commits will update your score if improved, and will never lower or revoke your pass.
              </p>
            </div>
          </div>
        )}
        <div className="rounded-xl border border-line bg-white p-6">
          {domainSlug === 'iot' && (
            <div className="rounded-xl border border-teal/30 bg-teal/5 p-5 mb-6 space-y-3">
              <div className="flex items-center gap-2 text-teal font-semibold text-sm">
                <Clock size={18} />
                <span>IoT Domain Submission Requirements ({iotMode === 'hardware' ? 'Hardware Model Path' : 'Software Simulation Path'})</span>
              </div>
              <ul className="space-y-2 text-xs text-ink/80 list-disc pl-5 leading-relaxed">
                <li><strong>Circuit Design Documentation:</strong> Attach or include circuit schematic diagram or simulator layout documentation.</li>
                <li><strong>Working &amp; Component Explanation:</strong> Include written details explaining {iotMode === 'hardware' ? 'your physical model components, wiring & hardware operation' : 'your software simulation setup & virtual component operation'}.</li>
                <li><strong>3–5 Minute Video Demonstration:</strong> Record a 3 to 5 minute video demonstrating your working {iotMode === 'hardware' ? 'physical hardware model' : 'software simulation'}, upload to Google Drive, and provide the public link below.</li>
                <li><strong>Mandatory 5–6 Day Evaluation Wait Period:</strong> All IoT submissions are subject to a mandatory 5 to 6 day evaluation wait period before AI/admin review release.</li>
              </ul>
            </div>
          )}

          <h2 className="font-medium text-xs stage-id text-ink/40 tracking-widest mb-4">SUBMIT YOUR WORK</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" htmlFor="submit-url">
                Link to your work
              </label>
              <input
                id="submit-url"
                type="url"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setUrlErr(''); }}
                placeholder="https://github.com/username/repo (optional)"
                className="input-field"
              />
              {urlErr && <p className="text-xs text-red-600 mt-1">{urlErr}</p>}
              <p className="text-xs text-ink/40 mt-1.5">
                Public GitHub repository URL is required for automated multi-agent code evaluation.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" htmlFor="submit-note">
                Describe your work <span className="text-ink/40 font-normal">(optional notes for review)</span>
              </label>
              <textarea
                id="submit-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What you built, design decisions, libraries used, or setup instructions…"
                rows={4}
                className="input-field"
              />
            </div>
          </div>

          {submitErr && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2 mt-4">
              {submitErr}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !isUnlocked}
            className="btn-primary mt-5 disabled:opacity-50"
            title={!isUnlocked ? `Submission opens in ${unlockCountdown ?? 'soon'}` : undefined}
          >
            {submitting ? 'Saving…' : !isUnlocked ? `Locked — opens in ${unlockCountdown ?? 'soon'}` : 'Save & proceed to evaluation →'}
          </button>
        </div>
      </form>
    );
  }

  /* ── EVALUATE PHASE ──────────────────────────────────────────────────────── */
  const finalScore = fullEval?.finalScore ?? null;
  const needsHumanReview = fullEval?.status === 'needs_review';
  const evaluationFinished = fullEval?.status === 'completed' || needsHumanReview;
  const evalPassed = (fullEval?.status === 'completed' || needsHumanReview) && finalScore !== null && finalScore >= 0;

  return (
    <div className="space-y-6">
      {/* Submission link banner */}
      <div className="rounded-xl border border-line bg-white p-6">
        <div className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-line">
          <div>
            <h2 className="font-medium text-xs stage-id text-ink/40 tracking-widest">SUBMISSION RECORDED</h2>
            <p className="text-xs text-ink/60 mt-0.5">Ready for AI evaluation</p>
          </div>
          <button
            onClick={() => setPhase('submit')}
            className="text-xs text-teal hover:underline font-medium shrink-0"
          >
            Edit link
          </button>
        </div>

        <div className="mb-2">
          <p className="text-xs text-ink/50 mb-1">Submitted URL:</p>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-teal font-medium hover:underline break-all"
          >
            {url}
          </a>
        </div>
      </div>

      {/* ── Multi-Agent Evaluation Panel ── */}
      <div className="rounded-xl border border-violet-200 bg-violet-50/40 overflow-hidden">
        <div className="px-6 py-4 border-b border-violet-200 flex items-center justify-between">
          <div>
            <h3 className="font-display font-semibold text-sm text-violet-900">AI Code Evaluation</h3>
            <p className="text-xs text-violet-700/80 mt-0.5">
              Multi-agent pipeline (deterministic checks, execution tests &amp; code analysis)
            </p>
          </div>
          {evaluationFinished && finalScore !== null && (
            <div
              className={`w-14 h-14 rounded-full flex flex-col items-center justify-center border-2 font-bold ${
                finalScore >= 0 ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-red-400 bg-red-50 text-red-700'
              }`}
            >
              <span className="text-lg leading-none">{finalScore}</span>
              <span className="text-[9px] font-normal opacity-70">/100</span>
            </div>
          )}
        </div>

        <div className="p-6 space-y-5">
          {/* Case 1: No evaluation yet */}
          {!fullEval && (
            <div className="space-y-4">
              <p className="text-sm text-violet-900/80 leading-relaxed">
                Submit your public GitHub repository URL for AI evaluation. The pipeline will run automated tests, check repository structure, and generate a detailed mentor assessment.
              </p>
              <div>
                <label htmlFor="repo-url" className="block text-sm font-medium text-violet-900 mb-1.5">
                  GitHub Repository URL <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <ExternalLink size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-400" />
                    <input
                      id="repo-url"
                      type="url"
                      value={repoUrl}
                      onChange={(e) => { setRepoUrl(e.target.value); setRepoUrlErr(''); }}
                      placeholder="https://github.com/username/your-project"
                      className="input-field pl-9 text-sm"
                    />
                  </div>
                  <button
                    onClick={handleSubmitForEvaluation}
                    disabled={submittingEval || !isUnlocked}
                    className="shrink-0 px-4 py-2 bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {submittingEval ? 'Submitting…' : 'Evaluate →'}
                  </button>
                </div>
                {repoUrlErr && <p className="text-xs text-red-600 mt-1">{repoUrlErr}</p>}
                {evalSubmitErr && <p className="text-xs text-red-600 mt-1">{evalSubmitErr}</p>}
                {!isUnlocked && (
                  <p className="text-xs text-amber-700 mt-1.5">
                    Evaluation is locked until the minimum stage wait period ends.
                  </p>
                )}
                <p className="text-xs text-violet-700/60 mt-1.5">
                  Must be a public GitHub repository. Private repositories cannot be evaluated.
                </p>
              </div>
            </div>
          )}

          {/* Case 2: In progress (queued or running) */}
          {fullEval && (fullEval.status === 'queued' || fullEval.status === 'running') && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-violet-100 border border-violet-200 px-4 py-3">
                <RefreshCw size={18} className="text-violet-600 animate-spin shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-violet-900">
                    {fullEval.status === 'queued' ? 'Queued — starting soon…' : 'Evaluation in progress'}
                  </p>
                  <p className="text-xs text-violet-700 mt-0.5">
                    {fullEval.currentStageLabel ?? 'Preparing evaluation environment…'}
                  </p>
                </div>
              </div>
              <div className="text-xs text-violet-700/70 space-y-1 pl-1">
                <p>Multi-agent evaluation typically takes <strong>1–3 minutes</strong>.</p>
                <p>This page updates automatically — you do not need to stay here.</p>
                <button
                  onClick={() => fullEval.id && pollEvaluation(fullEval.id)}
                  className="text-violet-600 hover:text-violet-800 underline mt-1"
                >
                  Refresh status now
                </button>
              </div>

              {fullEval.deterministicChecks && (
                <div className="rounded-lg border border-violet-200 bg-white p-4">
                  <p className="text-xs font-semibold text-violet-800 uppercase tracking-widest mb-2">Early checks (completed)</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <CheckItem label="README" ok={fullEval.deterministicChecks.readmeFound} />
                    <CheckItem label="Build succeeds" ok={fullEval.deterministicChecks.buildSucceeds} />
                    <CheckItem label="Tests run" ok={fullEval.deterministicChecks.testsRun} />
                    <span className="text-ink/60">
                      Tests: {fullEval.deterministicChecks.testsPassCount} passed · {fullEval.deterministicChecks.testsFailCount} failed
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Case 3: Failed */}
          {fullEval?.status === 'failed' && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">Evaluation failed</p>
                <p className="text-xs text-red-700 mt-0.5">
                  {fullEval.errorMessage ?? 'An unexpected error occurred during evaluation. Please try again.'}
                </p>
                <button
                  onClick={() => setFullEval(null)}
                  className="text-xs text-red-700 underline mt-2 font-medium"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Case 4: Awaiting human review */}
          {needsHumanReview && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
              <Clock size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Evaluation awaiting human review</p>
                <p className="text-xs text-amber-800 mt-0.5">
                  Your score has been calculated, but a reviewer must confirm it before this stage can be completed.
                </p>
              </div>
            </div>
          )}

          {/* Case 5: Completed or awaiting review */}
          {evaluationFinished && finalScore !== null && (
            <div className="space-y-5">
              {/* Score + delta */}
              <div className="flex items-center gap-4">
                <div className={`text-center ${
                  finalScore >= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}>
                  <div className="text-3xl font-bold">{finalScore}<span className="text-lg font-normal opacity-60">/100</span></div>
                  <div className="text-xs mt-0.5 font-semibold">
                    {finalScore >= 0 ? '✓ Completed' : '✗ Incomplete'}
                  </div>
                </div>
                {fullEval.scoreDelta !== null && fullEval.scoreDelta !== undefined && (
                  <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold ${
                    fullEval.scoreDelta > 0 ? 'bg-emerald-100 text-emerald-700' :
                    fullEval.scoreDelta < 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {fullEval.scoreDelta > 0 ? <TrendingUp size={14} /> : fullEval.scoreDelta < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
                    <span>{fullEval.scoreDelta > 0 ? '+' : ''}{fullEval.scoreDelta} from previous</span>
                  </div>
                )}
              </div>

              {fullEval.submissionRecord?.commitSha && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
                  <p className="font-semibold uppercase tracking-wider text-slate-800">Evaluation evidence</p>
                  <p className="mt-1">Evaluated Git commit: <code className="font-mono">{fullEval.submissionRecord.commitSha}</code></p>
                  {fullEval.previousEvaluation?.submissionRecord?.commitSha === fullEval.submissionRecord.commitSha && (
                    <p className="mt-1 text-amber-700">No new Git commit was detected compared with the previous evaluation, so a similar score is expected.</p>
                  )}
                </div>
              )}

              {(fullEval.aiUsageAnalysis?.warning || (fullEval.aiUsageAnalysis?.suspectedFiles && fullEval.aiUsageAnalysis.suspectedFiles.length > 0)) && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-800 mb-1">
                    <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                    <span>AI-Generated Code Notice</span>
                  </div>
                  <p className="mt-1">
                    {fullEval.aiUsageAnalysis?.warning ?? 'Sections of code appear AI-generated.'}
                  </p>
                  {fullEval.aiUsageAnalysis?.suspectedFiles && fullEval.aiUsageAnalysis.suspectedFiles.length > 0 && (
                    <p className="mt-1 text-amber-700 font-mono text-[11px]">
                      Flagged files: {fullEval.aiUsageAnalysis.suspectedFiles.join(', ')}
                    </p>
                  )}
                  <p className="mt-1 text-amber-700">
                    Note: Suspected AI-assisted code was not counted towards your score. Review the flagged files and ensure your submission reflects your own engineering.
                  </p>
                </div>
              )}

              {/* Pass / Fail result banner */}
              <div className="rounded-xl border p-4 bg-emerald-50 border-emerald-200">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                    <p className="text-sm font-semibold text-emerald-900">
                      {isLast ? 'Final stage completed! Track complete 🎓' : `Stage ${stageNumber} completed! 🎉`}
                    </p>
                  </div>
                  <p className="text-xs text-emerald-700 mb-3">
                    Evaluation completed with score <strong>{finalScore}/100</strong>. {isLast ? 'Your certificate is ready.' : 'The next stage is unlocked.'}
                  </p>
                  {isLast ? (
                    <a href="/dashboard/profile" className="btn-primary text-xs inline-flex items-center gap-1.5">
                      <Award size={14} /> View Certificate in Profile →
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (onSelectStage) {
                          onSelectStage(stageNumber + 1);
                        } else if (nextStageHref) {
                          router.push(nextStageHref);
                        } else {
                          router.push(`/dashboard/track/${trackEnrollmentId}?stage=${stageNumber + 1}`);
                        }
                      }}
                      className="btn-teal text-xs inline-flex items-center gap-1.5"
                    >
                      Continue to Stage {stageNumber + 1} <ChevronRight size={13} />
                    </button>
                  )}
                </div>
              </div>


              {/* Category breakdown */}
              {fullEval.categoryScores && (
                <div className="rounded-lg border border-violet-200 bg-white p-4">
                  <p className="text-xs font-semibold text-violet-800 uppercase tracking-widest mb-3">Category Breakdown</p>
                  <div className="space-y-2">
                    {([
                      ['Requirements', fullEval.categoryScores.requirements, 25],
                      ['Functionality', fullEval.categoryScores.functionality, 20],
                      ['Code Quality', fullEval.categoryScores.codeQuality, 15],
                      ['Architecture', fullEval.categoryScores.architecture, 10],
                      ['Dev Process', fullEval.categoryScores.devProcess, 10],
                      ['Testing', fullEval.categoryScores.testing, 5],
                      ['Documentation', fullEval.categoryScores.documentation, 5],
                      ['Security', fullEval.categoryScores.security, 5],
                      ['Innovation', fullEval.categoryScores.innovation, 5],
                    ] as [string, number, number][]).map(([label, score, weight]) => (
                      <div key={label} className="flex items-center gap-3">
                        <span className="text-xs text-ink/60 w-28 shrink-0">{label} <span className="text-ink/30">({weight}%)</span></span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              score >= 50 ? 'bg-emerald-500' : 'bg-red-400'
                            }`}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-ink/70 w-8 text-right">{score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Requirement-by-requirement table */}
              {fullEval.requirementResults && fullEval.requirementResults.length > 0 && (
                <div className="rounded-lg border border-violet-200 bg-white overflow-hidden">
                  <button
                    onClick={() => setShowRequirements((s) => !s)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                  >
                    <p className="text-xs font-semibold text-violet-800 uppercase tracking-widest">
                      Requirements ({fullEval.requirementResults.filter((r) => r.status === 'PASS').length}/{fullEval.requirementResults.length} passed)
                    </p>
                    {showRequirements ? <ChevronUp size={14} className="text-violet-600" /> : <ChevronDown size={14} className="text-violet-600" />}
                  </button>
                  {showRequirements && (
                    <div className="border-t border-violet-100 divide-y divide-violet-100">
                      {fullEval.requirementResults.map((r, i) => (
                        <div key={i} className="px-4 py-3 flex items-start gap-3">
                          <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded mt-0.5 ${
                            r.status === 'PASS' ? 'bg-emerald-100 text-emerald-700' :
                            r.status === 'PARTIAL' ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          }`}>{r.status}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-ink/80">{r.reqText}</p>
                            {r.evidence && <p className="text-xs text-ink/50 mt-0.5">↳ {r.evidence}</p>}
                            {r.missing && r.status !== 'PASS' && (
                              <p className="text-xs text-red-600/80 mt-0.5">Missing: {r.missing}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Mentor report */}
              {fullEval.mentorReport && (
                <div className="rounded-lg border border-violet-200 bg-white overflow-hidden">
                  <button
                    onClick={() => setShowMentorDetails((s) => !s)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                  >
                    <p className="text-xs font-semibold text-violet-800 uppercase tracking-widest">Mentor Report</p>
                    {showMentorDetails ? <ChevronUp size={14} className="text-violet-600" /> : <ChevronDown size={14} className="text-violet-600" />}
                  </button>
                  {showMentorDetails && (
                    <div className="border-t border-violet-100 px-4 pb-4 pt-3 space-y-4">
                      <div>
                        <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1.5">Strengths</p>
                        <ul className="space-y-1">
                          {fullEval.mentorReport.strengths.map((s, i) => (
                            <li key={i} className="text-xs text-ink/80 flex gap-2">
                              <Check size={12} className="text-emerald-600 shrink-0 mt-0.5" />{s}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-1.5">Gaps</p>
                        <ul className="space-y-1">
                          {fullEval.mentorReport.gaps.map((g, i) => (
                            <li key={i} className="text-xs text-ink/80 flex gap-2">
                              <X size={12} className="text-red-500 shrink-0 mt-0.5" />{g}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-violet-700 uppercase tracking-wider mb-1.5">Why this score</p>
                        <p className="text-xs text-ink/75 leading-relaxed">{fullEval.mentorReport.reasoning}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1.5">Improvements</p>
                        <ol className="space-y-1 list-decimal pl-4">
                          {fullEval.mentorReport.improvements.map((imp, i) => (
                            <li key={i} className="text-xs text-ink/80">{imp}</li>
                          ))}
                        </ol>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-teal uppercase tracking-wider mb-1.5">Next Steps</p>
                        <ol className="space-y-1 list-decimal pl-4">
                          {fullEval.mentorReport.nextSteps.map((ns, i) => (
                            <li key={i} className="text-xs text-ink/80">{ns}</li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Git history */}
              {fullEval.gitHistoryAnalysis && (
                <div className="rounded-lg border border-violet-100 bg-violet-50/50 px-4 py-3">
                  <p className="text-xs font-semibold text-violet-800 uppercase tracking-widest mb-1.5">Development Process</p>
                  <p className="text-xs text-violet-900/70 leading-relaxed">{fullEval.gitHistoryAnalysis.summary}</p>
                  <p className="text-xs text-violet-700/50 mt-1">
                    {fullEval.gitHistoryAnalysis.commitCount} commits · {fullEval.gitHistoryAnalysis.durationDays} days
                  </p>
                </div>
              )}

              {/* Resubmit / Improve score button — always shown after eval, locked or not */}
              <button
                onClick={() => setPhase('submit')}
                disabled={!isUnlocked}
                className="w-full px-4 py-2.5 border border-violet-300 text-violet-800 text-sm font-medium rounded-lg hover:bg-violet-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title={!isUnlocked ? `Next submission unlocks in ${unlockCountdown ?? 'soon'}` : undefined}
              >
                {finalScore !== null && finalScore >= 50
                  ? isUnlocked
                    ? 'Improve your score — resubmit with new commits →'
                    : `Score improvement locked — opens in ${unlockCountdown ?? 'soon'}`
                  : 'Fix issues and resubmit →'}
              </button>
            </div>
          )}
        </div>
      </div>

      <ModelAnswerSection
        modelAnswer={fullEval?.modelAnswer || modelAnswer}
        isDynamic={Boolean(fullEval?.modelAnswer)}
      />
    </div>
  );
}

function ModelAnswerSection({ modelAnswer, isDynamic }: { modelAnswer: string; isDynamic?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-white overflow-hidden mt-6">
      <button
        onClick={() => setShow((s) => !s)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <BookOpen size={18} className="text-ink/50 shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm">Model Answer</p>
              {isDynamic && (
                <span className="badge text-[10px] bg-violet-100 text-violet-700 border border-violet-200">
                  Tailored to your submission
                </span>
              )}
            </div>
            <p className="text-xs text-ink/50">See how this stage should be approached</p>
          </div>
        </div>
        <span
          className={`text-xs px-3 py-1 rounded-full border transition-all ${
            show ? 'bg-ink text-paper border-ink' : 'border-line text-ink/60 hover:border-ink/40'
          }`}
        >
          {show ? 'Hide' : 'Reveal answer'}
        </span>
      </button>
      {show && (
        <div className="px-5 pb-5 border-t border-line">
          <pre className="text-sm text-ink/80 whitespace-pre-wrap leading-relaxed mt-4 font-sans">
            {modelAnswer}
          </pre>
        </div>
      )}
    </div>
  );
}

function CheckItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`flex items-center gap-1 ${ok ? 'text-emerald-700' : 'text-red-600'}`}>
      {ok ? <Check size={11} className="shrink-0" /> : <X size={11} className="shrink-0" />}
      {label}
    </span>
  );
}
