import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionSync, clearSessionCookie } from '@/lib/auth';
import { generateMasterProject } from '@/lib/ai-generator/generateMasterProject';
import { AiGenerationError } from '@/lib/ai-generator/AiGenerationError';
import { logError } from '@/lib/error-handler';

/**
 * Compute the stage unlock schedule for a newly enrolled student.
 *
 * Formula (Section 10, 0.4× multiplier):
 *   minHoursPerStage = (trackDays / stageCount) × 0.4 × 24
 *
 * Stage 1 unlocks immediately (enrolledAt). Stage N unlocks at:
 *   enrolledAt + (N - 1) × minHoursPerStage hours
 *
 * Examples:
 *   30-day / 3-stage track: 30/3 × 0.4 × 24 = 96h ≍ 4 days per stage
 *   45-day / 4-stage track: 45/4 × 0.4 × 24 = 108h ≍ 4.5 days per stage
 *   90-day / 8-stage track: 90/8 × 0.4 × 24 = 108h ≍ 4.5 days per stage
 *
 * Returns a JSON string: { "1": ISO, "2": ISO, ... }
 */
function computeStageUnlockSchedule(trackDays: number, stageCount: number, enrolledAt: Date): string {
  if (stageCount <= 0) return '{}';
  const minHoursPerStage = (trackDays / stageCount) * 0.4 * 24; // hours
  const minMsPerStage = minHoursPerStage * 60 * 60 * 1000;      // milliseconds

  const schedule: Record<string, string> = {};
  for (let i = 1; i <= stageCount; i++) {
    // Stage 1 unlocks immediately; Stage N unlocks after (N-1) × minMsPerStage
    const unlockMs = enrolledAt.getTime() + (i - 1) * minMsPerStage;
    schedule[String(i)] = new Date(unlockMs).toISOString();
  }
  return JSON.stringify(schedule);
}

const schema = z.object({
  trackId: z.string().optional(),
  domainSlug: z.string().optional(),
  duration: z.number().optional(),
});

export async function POST(req: NextRequest) {
  const session = getSessionSync();
  if (!session) return NextResponse.json({ error: 'Log in first' }, { status: 401 });

  const student = await prisma.student.findUnique({ where: { id: session.studentId } });
  if (!student) {
    clearSessionCookie();
    return NextResponse.json({ error: 'Session expired or user not found. Please log in again.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    let track = null;
    if (parsed.data.trackId) {
      track = await prisma.track.findUnique({ where: { id: parsed.data.trackId }, include: { domain: true } });
    } else if (parsed.data.domainSlug && parsed.data.duration) {
      const domain = await prisma.domain.findUnique({ where: { slug: parsed.data.domainSlug } });
      if (domain) {
        track = await prisma.track.findUnique({
          where: { domainId_duration: { domainId: domain.id, duration: parsed.data.duration } },
          include: { domain: true },
        });
      }
    }

    if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    if (!track.isPublished) return NextResponse.json({ error: 'This track is not yet published' }, { status: 400 });

    // ── Prerequisite Domain Gating (LLM & Generative AI requires completed AI/ML track) ──
    if (track.domain.slug === 'llm-generative-ai' || track.domain.prerequisiteDomainId) {
      const prerequisiteDomainId = track.domain.prerequisiteDomainId;
      const completedPrerequisite = await prisma.enrollment.findFirst({
        where: {
          studentId: session.studentId,
          status: 'COMPLETED',
          track: prerequisiteDomainId
            ? { domainId: prerequisiteDomainId }
            : { domain: { slug: 'ai-ml' } },
        },
      });

      if (!completedPrerequisite) {
        return NextResponse.json(
          { error: 'Prerequisite Required: You must complete at least one track in the AI/ML domain before enrolling in LLM & Generative AI.' },
          { status: 403 }
        );
      }
    }

    // Check for existing enrollment
    const existing = await prisma.enrollment.findUnique({
      where: { studentId_trackId: { studentId: session.studentId, trackId: track.id } },
    });
    if (existing && (existing.paymentStatus === 'PAID' || existing.status === 'IN_PROGRESS' || existing.status === 'COMPLETED')) {
      return NextResponse.json({ enrollmentId: existing.id, alreadyEnrolled: true });
    }

    // ── PAYMENT GATEWAY DISABLING FOR TESTING ──────────────────────────────
    // Automatically mark all new/existing enrollments as PAID & IN_PROGRESS so the complete system can be tested.
    // Set DISABLE_PAYMENT_GATEWAY=false in .env.local to re-enable Razorpay payment gateway.
    const disablePayment = process.env.DISABLE_PAYMENT_GATEWAY !== 'false';

    const enrollment = existing
      ? await prisma.enrollment.update({
          where: { id: existing.id },
          data: { paymentStatus: 'PAID', status: 'IN_PROGRESS' },
          include: { track: { include: { domain: true, stages: { orderBy: { stageNumber: 'asc' } } } } },
        })
      : await prisma.enrollment.create({
          data: {
            studentId: session.studentId,
            trackId: track.id,
            paymentStatus: disablePayment ? 'PAID' : 'PENDING',
            status: disablePayment ? 'IN_PROGRESS' : 'PENDING_PAYMENT',
          },
          include: { track: { include: { domain: true, stages: { orderBy: { stageNumber: 'asc' } } } } },
        });

    if (disablePayment) {
      // Compute and store the stage unlock schedule for this enrollment.
      // Uses the 0.4× formula from Section 10.
      const stageCount = enrollment.track.stages.length;
      const trackDays = enrollment.track.duration;
      if (stageCount > 0 && !enrollment.stageUnlockSchedule) {
        const schedule = computeStageUnlockSchedule(trackDays, stageCount, enrollment.enrolledAt);
        await prisma.enrollment.update({
          where: { id: enrollment.id },
          data: { stageUnlockSchedule: schedule },
        });
        console.log(`[enrollments] Stage unlock schedule set for ${enrollment.id}: ${schedule}`);
      }

      // Trigger master project generation asynchronously — does not block enrollment response
      triggerMasterProjectGeneration(enrollment).catch((e) =>
        console.error('[enrollments] triggerMasterProjectGeneration threw:', e)
      );
      return NextResponse.json({
        enrollmentId: enrollment.id,
        bypassedPayment: true,
        message: 'Enrolled directly with payment gateway disabled for system testing.',
      });
    }

    // ── PRODUCTION: create Razorpay order if payment gateway enabled ─────────
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return NextResponse.json({ error: 'Payment gateway configuration missing' }, { status: 500 });
    }

    const Razorpay = (await import('razorpay')).default;
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await (razorpay.orders as any).create({
      amount: track.price,
      currency: 'INR',
      receipt: enrollment.id,
    });

    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { razorpayOrderId: order.id },
    });

    return NextResponse.json({
      enrollmentId: enrollment.id,
      order,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    const { studentMessage } = await logError({
      service: 'enrollment-razorpay',
      error: err,
      context: { studentId: session.studentId },
    });
    return NextResponse.json({ error: studentMessage }, { status: 500 });
  }
}

// ── Master project locking ───────────────────────────────────────────
// Triggered asynchronously after enrollment is confirmed as IN_PROGRESS.
// Calls Groq to generate the master project scenario (Call 1) and locks it.
async function triggerMasterProjectGeneration(enrollment: {
  id: string;
  aiVariantLockedAt: Date | null;
  track: {
    domain: { slug: string; name: string };
    levelName: string;
    stages: { id: string; stageNumber: number; taskTemplate: string }[];
  };
}) {
  // Only generate if variant is not already locked
  if (enrollment.aiVariantLockedAt) return;

  const { name: domainName, slug: domainSlug } = enrollment.track.domain;
  const { levelName } = enrollment.track;

  try {
    const masterProject = await generateMasterProject(domainName, levelName, domainSlug);

    // Lock the master project — this JSON is now READ-ONLY for the life of the enrollment
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        aiVariantJson:        JSON.stringify(masterProject),
        aiVariantGeneratedAt: new Date(),
        aiVariantLockedAt:    new Date(),
      },
    });

    // Log success
    await prisma.aiGenerationLog.create({
      data: {
        enrollmentId:  enrollment.id,
        stageId:       'master',
        promptVersion: 'master-v2.0',
        modelName:     'llama-3.3-70b-versatile',
        rawResponse:   JSON.stringify(masterProject),
        status:        'SUCCESS',
        scenario:      masterProject.scenario,
      },
    });

    console.log(`[enrollments] Master project locked for enrollment ${enrollment.id}: ${masterProject.scenario}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[enrollments] Master project generation FAILED for enrollment ${enrollment.id}:`, msg);

    // Store failure marker so track page can show error card instead of fake template
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        aiVariantJson: JSON.stringify({ __failed: true }),
      },
    });

    // Log failure to AiGenerationLog
    await prisma.aiGenerationLog.create({
      data: {
        enrollmentId:  enrollment.id,
        stageId:       'master',
        promptVersion: 'master-v1.0',
        modelName:     'llama-3.3-70b-versatile',
        rawResponse:   msg,
        status:        'FAILED',
      },
    }).catch(() => {});

    // Report to centralized error handler (fires admin alert email)
    await logError({
      service: 'groq-project-generation',
      error: err,
      context: { enrollmentId: enrollment.id, domainSlug: enrollment.track.domain.slug },
    });
  }
}
