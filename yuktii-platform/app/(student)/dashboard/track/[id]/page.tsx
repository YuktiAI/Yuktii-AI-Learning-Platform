import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import TrackDetailClient from './TrackDetailClient';
import IotModeSelector from '@/components/IotModeSelector';
import RoboticsModeSelector from '@/components/RoboticsModeSelector';

// Note: in-memory track-cache removed (Phase 5.2) — cache is not safe on
// multi-instance deployments (Render/Vercel). Data is fetched fresh per request.

export const dynamic = 'force-dynamic';

export default async function TrackDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { stage?: string; retry?: string };
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const [fetchedEnrollment, fetchedStageContents, fetchedEvaluations] = await Promise.all([
      prisma.enrollment.findUnique({
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
      }),
      prisma.stageGeneratedContent.findMany({
        where: { enrollmentId: params.id },
      }),
      prisma.evaluation.findMany({
        where: { enrollmentId: params.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          stageId: true,
          status: true,
          currentStageLabel: true,
          finalScore: true,
          mentorReport: true,
          categoryScores: true,
          requirementResults: true,
          gitHistoryAnalysis: true,
          deterministicChecks: true,
          aiUsageAnalysis: true,
          modelAnswer: true,
          errorMessage: true,
          scoreDelta: true,
          createdAt: true,
          submissionRecord: {
            select: { submittedUrl: true, commitSha: true, submittedAt: true },
          },
        },
      }),
  ]);

  const rawEnrollment = fetchedEnrollment;
  const allStageGeneratedContents = fetchedStageContents;
  const allEvaluations = fetchedEvaluations;
  const allCompletedEvals = (fetchedEvaluations || [])
    .filter((e) => ['completed', 'needs_review'].includes(e.status) && e.finalScore !== null && e.finalScore >= 0)
    .map((e) => ({ stageId: e.stageId, finalScore: e.finalScore }));

  const enrollment = rawEnrollment;
  if (!enrollment || enrollment.studentId !== session.studentId) return notFound();

  const stages = enrollment.track.stages;


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

  // ── IoT Domain Mandatory Mode Selection ──
  if (enrollment.track.domain.slug === 'iot' && !enrollment.iotMode) {
    return <IotModeSelector enrollmentId={enrollment.id} />;
  }

  // ── Robotics Domain Mandatory Mode Selection ──
  if (enrollment.track.domain.slug === 'robotics' && !enrollment.roboticsMode) {
    return <RoboticsModeSelector enrollmentId={enrollment.id} />;
  }

  // Build stage contents map by stageNumber
  const stageContentsMap: Record<number, any> = {};
  for (const row of allStageGeneratedContents || []) {
    try {
      stageContentsMap[row.stageNumber] = {
        id: row.id,
        enrollmentId: row.enrollmentId,
        stageNumber: row.stageNumber,
        title: row.title || `Stage ${row.stageNumber}`,
        problemStatement: row.problemStatement,
        nonTechnicalExplanation: row.nonTechnicalExplanation || '',
        technicalExplanation: row.technicalExplanation || '',
        requirements: row.requirements ? JSON.parse(row.requirements) : [],
        acceptanceCriteria: row.acceptanceCriteria ? JSON.parse(row.acceptanceCriteria) : [],
        estimatedEffort: row.estimatedEffort || '2-3 hours',
        generationStatus: row.generationStatus,
      };
    } catch {
      stageContentsMap[row.stageNumber] = null;
    }
  }

  // Determine initial stage requested
  const requestedStageNum = searchParams.stage ? parseInt(searchParams.stage, 10) : 1;
  const initialStageNumber = !isNaN(requestedStageNum) && requestedStageNum >= 1 && requestedStageNum <= stages.length
    ? requestedStageNum
    : 1;

  const isTrackComplete = enrollment.status === 'COMPLETED';

  return (
    <TrackDetailClient
      enrollment={enrollment}
      stages={stages}
      initialStageNumber={initialStageNumber}
      initialSubmissions={enrollment.submissions}
      initialCompletedEvals={allCompletedEvals || []}
      allEvaluations={allEvaluations || []}
      allStageContents={stageContentsMap}
      isTrackComplete={isTrackComplete}
    />
  );
}
