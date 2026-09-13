import { prisma } from "@/lib/prisma";
import { Users, BookOpen, Award, CheckCircle2, BarChart2, ExternalLink } from "lucide-react";
import Link from "next/link";

export default async function AdminDashboardPage() {
  const [totalStudents, totalEnrollments, completed, certs, evals, recentStudents] = await Promise.all([
    prisma.student.count({ where: { role: "STUDENT" } }),
    prisma.enrollment.count(),
    prisma.enrollment.count({ where: { status: "COMPLETED" } }),
    prisma.certificate.count(),
    prisma.evaluation.count({ where: { status: "completed" } }),
    prisma.student.findMany({
      where: { role: "STUDENT" },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, name: true, email: true, degreeProgram: true, createdAt: true, enrollments: { select: { status: true } } },
    }),
  ]);

  const stats = [
    { label: "Total Students",    value: totalStudents,    icon: Users,         color: "#7c3aed" },
    { label: "Total Enrollments", value: totalEnrollments, icon: BookOpen,       color: "#2563eb" },
    { label: "Completed Tracks",  value: completed,        icon: CheckCircle2,   color: "#059669" },
    { label: "Certificates Issued", value: certs,          icon: Award,          color: "#d97706" },
    { label: "Evaluations Done",  value: evals,            icon: BarChart2,      color: "#db2777" },
    { label: "Completion Rate",
      value: `${totalEnrollments ? Math.round(completed / totalEnrollments * 100) : 0}%`,
      icon: CheckCircle2, color: "#0891b2" },
  ];

  return (
    <div className="p-8 max-w-[1100px]">
      {/* Page header */}
      <div className="mb-7">
        <p className="text-[11px] tracking-widest text-ink/40 uppercase mb-1">Admin Portal</p>
        <h1 className="text-2xl font-bold text-ink">Overview</h1>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {stats.map(s => (
          <div key={s.label} className="bg-white border border-line rounded-xl p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: `${s.color}18` }}
              >
                <s.icon size={16} color={s.color} />
              </div>
              <p className="text-xs text-ink/50 font-medium">{s.label}</p>
            </div>
            <p className="text-[30px] font-bold text-ink leading-none">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {[
          { href: "/admin-portal/analytics", label: "View Analytics",   desc: "Charts, time-series, breakdowns" },
          { href: "/admin-portal/students",  label: "Manage Students",  desc: "Browse, search, export" },
          { href: "/api/admin-portal/export?format=csv", label: "Export CSV", desc: "Download all student data" },
        ].map(l => (
          <Link
            key={l.href}
            href={l.href}
            className="flex items-center gap-3 p-4 bg-white border border-line rounded-xl hover:border-ink/25 hover:shadow-sm transition-all text-ink no-underline"
          >
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink mb-0.5">{l.label}</p>
              <p className="text-xs text-ink/40">{l.desc}</p>
            </div>
            <ExternalLink size={13} className="text-ink/30 shrink-0" />
          </Link>
        ))}
      </div>

      {/* Recent signups table */}
      <div className="bg-white border border-line rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex justify-between items-center">
          <p className="font-semibold text-sm text-ink">Recent Signups</p>
          <Link href="/admin-portal/students" className="text-xs text-violet-600 hover:text-violet-800 transition-colors">
            View all
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line">
                {["Name", "Email", "Degree", "Enrollments", "Joined"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] text-ink/40 font-semibold tracking-widest uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentStudents.map(s => (
                <tr key={s.id} className="border-b border-line/60 hover:bg-paper transition-colors">
                  <td className="px-4 py-3 text-sm text-ink font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-xs text-ink/50">{s.email}</td>
                  <td className="px-4 py-3 text-xs text-ink/50">{s.degreeProgram}</td>
                  <td className="px-4 py-3 text-sm text-ink">{s.enrollments.length}</td>
                  <td className="px-4 py-3 text-xs text-ink/40">
                    {s.createdAt.toLocaleDateString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
