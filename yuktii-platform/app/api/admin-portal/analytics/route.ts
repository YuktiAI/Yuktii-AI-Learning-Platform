import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("admin_session")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let session: any = null;
  try {
    session = jwt.verify(token, process.env.JWT_SECRET as string);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session || !["ADMIN", "INSTITUTION_ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "overview";
  const from = searchParams.get("from");
  const to   = searchParams.get("to");
  const gran = searchParams.get("gran") ?? "week"; // day | week | month

  const fromDate = from ? new Date(from) : new Date(Date.now() - 90 * 86400000);
  const toDate   = to   ? new Date(to)   : new Date();

  if (type === "overview") {
    const [totalStudents, totalEnrollments, completedEnrollments, certs, evals] = await Promise.all([
      prisma.student.count({ where: { role: "STUDENT" } }),
      prisma.enrollment.count(),
      prisma.enrollment.count({ where: { status: "COMPLETED" } }),
      prisma.certificate.count(),
      prisma.evaluation.count({ where: { status: "completed" } }),
    ]);
    return NextResponse.json({
      totalStudents, totalEnrollments,
      activeEnrollments: totalEnrollments - completedEnrollments,
      completedEnrollments, certificatesIssued: certs, evaluationsCompleted: evals,
    });
  }

  if (type === "domains") {
    const domains = await prisma.domain.findMany({
      include: { tracks: { include: { enrollments: { include: { evaluations: true } } } } },
    });
    const rows = domains.map(d => {
      const enrollments = d.tracks.flatMap(t => t.enrollments);
      const completed   = enrollments.filter(e => e.status === "COMPLETED").length;
      const scores      = enrollments.flatMap(e => e.evaluations.filter(ev => ev.finalScore !== null).map(ev => ev.finalScore as number));
      const avgScore    = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      return { id: d.id, name: d.name, slug: d.slug, total: enrollments.length, completed, inProgress: enrollments.length - completed, completionRate: enrollments.length ? Math.round(completed / enrollments.length * 100) : 0, avgEvalScore: avgScore };
    });
    return NextResponse.json(rows);
  }

  if (type === "time-series") {
    const enrollments = await prisma.enrollment.findMany({
      where: { enrolledAt: { gte: fromDate, lte: toDate } },
      select: { enrolledAt: true, completedAt: true, status: true },
    });
    const bucket = (d: Date) => {
      if (gran === "day")   return d.toISOString().slice(0, 10);
      if (gran === "month") return d.toISOString().slice(0, 7);
      // week — ISO week
      const day = new Date(d); day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - day.getDay());
      return day.toISOString().slice(0, 10);
    };
    const enrolMap = new Map<string, number>();
    const compMap  = new Map<string, number>();
    for (const e of enrollments) {
      const k = bucket(e.enrolledAt);
      enrolMap.set(k, (enrolMap.get(k) ?? 0) + 1);
      if (e.completedAt && e.status === "COMPLETED") {
        const ck = bucket(e.completedAt);
        compMap.set(ck, (compMap.get(ck) ?? 0) + 1);
      }
    }
    const keys = Array.from(new Set([...enrolMap.keys(), ...compMap.keys()])).sort();
    return NextResponse.json(keys.map(k => ({ date: k, enrollments: enrolMap.get(k) ?? 0, completions: compMap.get(k) ?? 0 })));
  }

  if (type === "by-degree") {
    const students = await prisma.student.groupBy({ by: ["degreeProgram"], _count: { id: true } });
    return NextResponse.json(students.map(s => ({ degree: s.degreeProgram || "Unknown", count: s._count.id })));
  }

  if (type === "by-duration") {
    const tracks = await prisma.track.findMany({
      select: { duration: true, _count: { select: { enrollments: true } } },
    });
    const map = new Map<number, number>();
    for (const t of tracks) map.set(t.duration, (map.get(t.duration) ?? 0) + t._count.enrollments);
    return NextResponse.json(Array.from(map.entries()).sort((a, b) => a[0] - b[0]).map(([d, c]) => ({ duration: d, count: c })));
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
