import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionSync } from "@/lib/auth";
import { generateMasterProject } from "@/lib/ai-generator/generateMasterProject";
import { logError } from "@/lib/error-handler";

const schema = z.object({
  enrollmentId: z.string().min(1),
  roboticsMode: z.enum(["hardware", "simulation"]),
});

export async function POST(req: NextRequest) {
  const session = getSessionSync();
  if (!session) return NextResponse.json({ error: "Log in first" }, { status: 401 });

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { enrollmentId, roboticsMode } = parsed.data;

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { track: { include: { domain: true, stages: { orderBy: { stageNumber: "asc" } } } } },
    });

    if (!enrollment || enrollment.studentId !== session.studentId) {
      return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
    }

    // Save roboticsMode
    const updated = await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { roboticsMode },
      include: { track: { include: { domain: true, stages: { orderBy: { stageNumber: "asc" } } } } },
    });

    // Trigger Master Project Generation with selected roboticsMode
    try {
      const { name: domainName, slug: domainSlug } = updated.track.domain;
      const { levelName } = updated.track;

      const masterProject = await generateMasterProject(domainName, levelName, domainSlug);

      await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: {
          aiVariantJson: JSON.stringify(masterProject),
          aiVariantGeneratedAt: new Date(),
          aiVariantLockedAt: new Date(),
        },
      });

      return NextResponse.json({ ok: true, roboticsMode, masterProject });
    } catch (e) {
      // Log Groq generation failure — not critical enough to fail the whole request
      await logError({
        service: 'groq-project-generation',
        error: e,
        context: { enrollmentId, domainSlug: updated.track.domain.slug },
      });
      return NextResponse.json({ ok: true, roboticsMode, message: "Robotics mode saved. Project generation pending." });
    }
  } catch (err: any) {
    const { studentMessage } = await logError({
      service: 'enrollment-set-robotics-mode',
      error: err,
      context: { studentId: session.studentId },
    });
    return NextResponse.json({ error: studentMessage }, { status: 500 });
  }
}
