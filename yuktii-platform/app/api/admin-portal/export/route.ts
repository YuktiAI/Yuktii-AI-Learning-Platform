import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

// TODO: For large student counts (>5000), convert this to a BullMQ background job
// that emails a download link when the file is ready, to avoid request timeouts.

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

  const format = new URL(req.url).searchParams.get("format") ?? "csv"; // csv | xlsx

  const students = await prisma.student.findMany({
    where: { role: "STUDENT" },
    include: {
      enrollments: {
        include: {
          track: { include: { domain: true } },
          certificate: true,
          evaluations: { where: { status: "completed" }, orderBy: { completedAt: "desc" }, take: 1 },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Build flat rows (one per enrollment; students appear multiple times)
  const rows: string[][] = [];
  for (const s of students) {
    if (s.enrollments.length === 0) {
      rows.push([s.id, s.name, s.email, s.phone, s.college ?? "", s.degreeProgram, s.degreeProgramOther ?? "", "", "", "", "", "", "", "", ""]);
    } else {
      for (const e of s.enrollments) {
        const eval_ = e.evaluations[0];
        rows.push([
          s.id, s.name, s.email, s.phone, s.college ?? "",
          s.degreeProgram, s.degreeProgramOther ?? "",
          e.track.domain.name, `${e.track.duration}-day`, e.track.levelName,
          e.enrolledAt.toISOString().slice(0, 10),
          e.status,
          eval_?.finalScore?.toString() ?? "",
          e.certificate?.issueDate?.toISOString().slice(0, 10) ?? "",
          e.certificate?.publicCertificateId ?? "",
        ]);
      }
    }
  }

  const headers = [
    "Student ID", "Name", "Email", "Phone", "College",
    "Degree Program", "Degree (Other)",
    "Domain", "Duration", "Level",
    "Enrollment Date", "Status",
    "Eval Score", "Certificate Issued", "Certificate ID",
  ];

  const dateStr = new Date().toISOString().slice(0, 10);

  if (format === "xlsx") {
    // Dynamic import to avoid loading exceljs in every request
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Yuktii AI Labs";

    // Sheet 1: All Enrollments
    const ws1 = wb.addWorksheet("Enrollments");
    ws1.addRow(headers);
    ws1.getRow(1).font = { bold: true };
    ws1.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1A2E" } };
    ws1.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    for (const r of rows) ws1.addRow(r);
    ws1.columns.forEach(c => { c.width = 20; });

    // Sheet 2: Summary (students, one row)
    const ws2 = wb.addWorksheet("Students Summary");
    ws2.addRow(["Student ID", "Name", "Email", "Phone", "College", "Degree Program", "Total Enrollments", "Completed"]);
    ws2.getRow(1).font = { bold: true };
    for (const s of students) {
      const completed = s.enrollments.filter(e => e.status === "COMPLETED").length;
      ws2.addRow([s.id, s.name, s.email, s.phone, s.college ?? "", s.degreeProgram, s.enrollments.length, completed]);
    }
    ws2.columns.forEach(c => { c.width = 22; });

    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="yuktii-export-${dateStr}.xlsx"`,
      },
    });
  }

  // CSV
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csvLines = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))];
  return new NextResponse(csvLines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="yuktii-export-${dateStr}.csv"`,
    },
  });
}

