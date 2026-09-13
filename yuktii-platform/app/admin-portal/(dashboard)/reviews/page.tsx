import { prisma } from '@/lib/prisma';
import { ClipboardCheck } from 'lucide-react';
import ReviewsClient, { ReviewItem } from './ReviewsClient';

export default async function ReviewsPage() {
  const evaluations = await prisma.evaluation.findMany({
    where: {
      OR: [
        { status: 'needs_review' },
        { flaggedForHumanReview: true },
      ],
    },
    include: {
      submissionRecord: {
        select: {
          submittedUrl: true,
          normalizedRepoUrl: true,
        },
      },
      enrollment: {
        include: {
          student: {
            select: {
              name: true,
              email: true,
              college: true,
            },
          },
          track: {
            select: {
              levelName: true,
              certificateName: true,
              domain: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const formattedReviews: ReviewItem[] = evaluations.map((e) => ({
    id: e.id,
    finalScore: e.finalScore,
    sanityScore: e.sanityScore,
    sanityDiff: e.sanityDiff,
    status: e.status,
    flaggedForHumanReview: e.flaggedForHumanReview,
    humanReviewReason: e.humanReviewReason,
    promptInjectionFlags: e.promptInjectionFlags,
    agentTrajectory: e.agentTrajectory,
    createdAt: e.createdAt.toISOString(),
    submissionRecord: e.submissionRecord
      ? {
          submittedUrl: e.submissionRecord.submittedUrl,
          normalizedRepoUrl: e.submissionRecord.normalizedRepoUrl,
        }
      : null,
    enrollment: {
      id: e.enrollmentId,
      student: {
        name: e.enrollment.student.name,
        email: e.enrollment.student.email,
        college: e.enrollment.student.college,
      },
      track: {
        levelName: e.enrollment.track.levelName,
        certificateName: e.enrollment.track.certificateName,
        domain: e.enrollment.track.domain ? { name: e.enrollment.track.domain.name } : null,
      },
    },
  }));

  return (
    <div className="p-8 max-w-[1200px]">
      <div className="mb-7">
        <p className="text-[11px] tracking-widest text-ink/40 uppercase mb-1">Admin Portal</p>
        <h1 className="text-2xl font-bold text-ink flex items-center gap-2.5">
          <ClipboardCheck size={22} className="text-teal" />
          Evaluation Review Queue ({evaluations.length})
        </h1>
        <p className="text-xs text-ink/60 mt-1">
          Review borderline submissions, score discrepancies between agents and sanity scorer, and flagged agent trajectories.
        </p>
      </div>

      <ReviewsClient reviews={formattedReviews} />
    </div>
  );
}
