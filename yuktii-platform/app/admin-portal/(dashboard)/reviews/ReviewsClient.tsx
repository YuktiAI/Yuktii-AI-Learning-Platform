'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Award,
  Check,
  X,
  FileCode,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export type ReviewItem = {
  id: string;
  finalScore: number | null;
  sanityScore: number | null;
  sanityDiff: number | null;
  status: string;
  flaggedForHumanReview: boolean;
  humanReviewReason: string | null;
  promptInjectionFlags: string | null;
  agentTrajectory: string | null;
  createdAt: string;
  submissionRecord?: {
    submittedUrl: string;
    normalizedRepoUrl: string;
  } | null;
  enrollment: {
    id: string;
    student: {
      name: string;
      email: string;
      college: string | null;
    };
    track: {
      levelName?: string;
      certificateName?: string;
      domain?: { name: string } | null;
    };
  };
};

export default function ReviewsClient({ reviews }: { reviews: ReviewItem[] }) {
  const router = useRouter();
  const [expandedTrajectoryId, setExpandedTrajectoryId] = useState<string | null>(null);
  const [activeOverride, setActiveOverride] = useState<string | null>(null);
  const [overrideScore, setOverrideScore] = useState<number>(75);
  const [overrideNotes, setOverrideNotes] = useState<string>('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ id: string; msg: string; success: boolean } | null>(null);

  async function handleApprove(reviewId: string) {
    setProcessingId(reviewId);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/admin/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluationId: reviewId,
          action: 'approve',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve review');

      setStatusMsg({
        id: reviewId,
        msg: data.certificateIssued ? 'Approved! Track completed and certificate issued.' : 'Approved successfully.',
        success: true,
      });
      router.refresh();
    } catch (err: any) {
      setStatusMsg({
        id: reviewId,
        msg: err.message || 'Approval failed',
        success: false,
      });
    } finally {
      setProcessingId(null);
    }
  }

  async function handleOverride(reviewId: string) {
    setProcessingId(reviewId);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/admin/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluationId: reviewId,
          action: 'override',
          newScore: Number(overrideScore),
          notes: overrideNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to override review');

      setActiveOverride(null);
      setStatusMsg({
        id: reviewId,
        msg: data.certificateIssued
          ? `Score overridden to ${overrideScore}! Track completed and certificate issued.`
          : `Score overridden to ${overrideScore} successfully.`,
        success: true,
      });
      router.refresh();
    } catch (err: any) {
      setStatusMsg({
        id: reviewId,
        msg: err.message || 'Override failed',
        success: false,
      });
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {reviews.length === 0 ? (
        <div className="bg-white border border-line rounded-xl p-12 text-center">
          <CheckCircle2 size={36} className="text-emerald-500 mx-auto mb-3" />
          <h3 className="font-display font-semibold text-lg text-ink">Review Queue Clear</h3>
          <p className="text-sm text-ink/50 mt-1">
            No evaluations are currently flagged for human review or in boundary status.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => {
            const isExpanding = expandedTrajectoryId === r.id;
            const isOverriding = activeOverride === r.id;
            const isProcessing = processingId === r.id;
            const feedback = statusMsg?.id === r.id ? statusMsg : null;

            let promptFlags: string[] = [];
            if (r.promptInjectionFlags) {
              try {
                promptFlags = JSON.parse(r.promptInjectionFlags);
              } catch {
                promptFlags = [r.promptInjectionFlags];
              }
            }

            return (
              <div
                key={r.id}
                className="bg-white border border-line rounded-xl p-6 shadow-sm space-y-4"
              >
                {/* Header info */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-line">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink text-base">
                        {r.enrollment.student.name}
                      </span>
                      <span className="text-xs text-ink/40">({r.enrollment.student.email})</span>
                      {r.enrollment.student.college && (
                        <span className="text-xs text-ink/60 bg-gray-100 px-2 py-0.5 rounded">
                          {r.enrollment.student.college}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-teal font-medium mt-0.5">
                      {r.enrollment.track.domain?.name} · {r.enrollment.track.certificateName}
                    </p>
                  </div>

                  {/* Score Indicators */}
                  <div className="flex items-center gap-3">
                    <div className="text-center px-3 py-1.5 bg-gray-50 border border-line rounded-lg">
                      <p className="text-[10px] uppercase font-semibold text-ink/40">Final Score</p>
                      <p className="text-lg font-bold text-ink">{r.finalScore ?? '—'}/100</p>
                    </div>
                    {r.sanityScore !== null && (
                      <div className="text-center px-3 py-1.5 bg-gray-50 border border-line rounded-lg">
                        <p className="text-[10px] uppercase font-semibold text-ink/40">Sanity Score</p>
                        <p className="text-lg font-bold text-ink/70">{r.sanityScore}/100</p>
                      </div>
                    )}
                    {r.sanityDiff !== null && r.sanityDiff > 0 && (
                      <div className="text-center px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-[10px] uppercase font-semibold text-amber-700">Diff</p>
                        <p className="text-lg font-bold text-amber-900">Δ {r.sanityDiff}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Flag reason & submission link */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="font-semibold text-ink/60 mb-1 uppercase tracking-wider text-[10px]">
                      Flag Reason
                    </p>
                    <div className="flex items-center gap-1.5 text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg">
                      <AlertTriangle size={13} className="shrink-0" />
                      <span>{r.humanReviewReason || 'Score discrepancy / boundary case'}</span>
                    </div>
                  </div>

                  <div>
                    <p className="font-semibold text-ink/60 mb-1 uppercase tracking-wider text-[10px]">
                      Submitted Repository
                    </p>
                    {r.submissionRecord?.submittedUrl ? (
                      <a
                        href={r.submissionRecord.submittedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-teal font-medium hover:underline bg-teal/5 border border-teal/20 px-2.5 py-1.5 rounded-lg break-all"
                      >
                        <FileCode size={13} className="shrink-0" />
                        <span className="truncate">{r.submissionRecord.submittedUrl}</span>
                        <ExternalLink size={12} className="shrink-0" />
                      </a>
                    ) : (
                      <span className="text-ink/40 italic">No repo URL recorded</span>
                    )}
                  </div>
                </div>

                {/* Prompt injection warning banner if found */}
                {promptFlags.length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-red-900">
                      <ShieldAlert size={14} className="shrink-0" />
                      <span>Potential Prompt Injection Patterns Detected</span>
                    </div>
                    <ul className="list-disc pl-5 space-y-0.5 font-mono text-[11px]">
                      {promptFlags.map((flag, idx) => (
                        <li key={idx}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Agent Trajectory collapsible */}
                {r.agentTrajectory && (
                  <div className="border border-line rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedTrajectoryId(isExpanding ? null : r.id)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 text-xs font-medium text-ink/70 hover:bg-gray-100/70 text-left transition-colors"
                    >
                      <span>Agent Trajectory Log</span>
                      {isExpanding ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    {isExpanding && (
                      <div className="p-3 bg-gray-900 text-gray-100 font-mono text-[11px] max-h-60 overflow-y-auto whitespace-pre-wrap">
                        {r.agentTrajectory}
                      </div>
                    )}
                  </div>
                )}

                {/* Feedback message banner */}
                {feedback && (
                  <div
                    className={`p-3 rounded-lg text-xs font-medium ${
                      feedback.success
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-red-50 text-red-800 border border-red-200'
                    }`}
                  >
                    {feedback.msg}
                  </div>
                )}

                {/* Action buttons / Override form */}
                <div className="pt-2 border-t border-line flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(r.id)}
                      disabled={isProcessing}
                      className="btn-primary text-xs flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Check size={13} />
                      {isProcessing ? 'Processing…' : `Approve Score (${r.finalScore ?? 70}/100)`}
                    </button>

                    <button
                      onClick={() => {
                        setActiveOverride(isOverriding ? null : r.id);
                        setOverrideScore(r.finalScore ?? 75);
                      }}
                      disabled={isProcessing}
                      className="btn-ghost text-xs border border-line bg-white hover:bg-gray-50"
                    >
                      {isOverriding ? 'Cancel Override' : 'Override Score…'}
                    </button>
                  </div>

                  <span className="text-[11px] text-ink/40 font-mono">
                    Flagged: {new Date(r.createdAt).toLocaleString('en-IN')}
                  </span>
                </div>

                {/* Override Score Inline Form */}
                {isOverriding && (
                  <div className="p-4 bg-gray-50 border border-line rounded-lg mt-3 space-y-3 animate-in fade-in">
                    <p className="text-xs font-semibold text-ink">Set Manual Score &amp; Review Decision</p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="w-32">
                        <label className="block text-[10px] uppercase font-semibold text-ink/50 mb-1">
                          Score (0–100)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={overrideScore}
                          onChange={(e) => setOverrideScore(Number(e.target.value))}
                          className="input-field text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] uppercase font-semibold text-ink/50 mb-1">
                          Review Notes / Reason for Override
                        </label>
                        <input
                          type="text"
                          value={overrideNotes}
                          onChange={(e) => setOverrideNotes(e.target.value)}
                          placeholder="e.g. Code passes hidden cases upon manual run, verified hardware circuit diagram"
                          className="input-field text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setActiveOverride(null)}
                        className="btn-ghost text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleOverride(r.id)}
                        disabled={isProcessing}
                        className="btn-primary text-xs flex items-center gap-1.5"
                      >
                        <Award size={13} />
                        {isProcessing ? 'Saving…' : 'Save Override & Finalize'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
