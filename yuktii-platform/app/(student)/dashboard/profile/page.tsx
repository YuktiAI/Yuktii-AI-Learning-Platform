import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  User, Phone, GraduationCap, Building2, Mail,
  Award, Download, ExternalLink, CheckCircle2, Clock, AlertCircle,
} from "lucide-react";
import { ProfileEditor } from "./ProfileEditor";

function initials(name: string) {
  return name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
}
function formatDate(date: Date | string | null | undefined) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "In Progress", PENDING_PAYMENT: "Pending Payment",
  SUBMITTED: "Submitted", COMPLETED: "Completed",
};
const STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: "bg-teal-50 text-teal-700 border-teal-200",
  PENDING_PAYMENT: "bg-amber-50 text-amber-700 border-amber-200",
  SUBMITTED: "bg-blue-50 text-blue-700 border-blue-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
const DURATION_LABELS: Record<number, string> = {
  30: "30-day Foundation", 45: "45-day Foundation+", 60: "60-day Practitioner",
  75: "75-day Applied Practitioner", 90: "90-day Capstone",
};

function ProfileField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <span className="text-ink/40 mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-xs text-ink/40 uppercase tracking-wide font-medium">{label}</p>
        <p className="text-ink font-medium mt-0.5">{value}</p>
      </div>
    </div>
  );
}

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login?returnTo=/dashboard/profile");

  const student = await prisma.student.findUnique({
    where: { id: session.studentId },
    include: {
      enrollments: {
        include: { track: { include: { domain: true } }, certificate: true },
        orderBy: { enrolledAt: "desc" },
      },
    },
  });
  if (!student) redirect("/login");

  const profileIncomplete = !student.phone || student.degreeProgram === "Other";
  const disablePayment = process.env.DISABLE_PAYMENT_GATEWAY !== "false";

  const domainMap = new Map<string, { domainName: string; domainSlug: string; enrollments: any[] }>();
  for (const e of student.enrollments) {
    const effectiveStatus = disablePayment && e.status === "PENDING_PAYMENT" ? "IN_PROGRESS" : e.status;
    const key = e.track.domain.id;
    if (!domainMap.has(key)) {
      domainMap.set(key, { domainName: e.track.domain.name, domainSlug: e.track.domain.slug, enrollments: [] });
    }
    domainMap.get(key)!.enrollments.push({ ...e, status: effectiveStatus });
  }

  const certificates = student.enrollments
    .filter((e: any) => e.certificate && e.certificate.pdfUrl)
    .map((e: any) => ({
      certId: e.certificate!.publicCertificateId,
      pdfUrl: e.certificate!.pdfUrl!,
      issuedAt: e.certificate!.issueDate,
      domainName: e.track.domain.name,
      trackLabel: DURATION_LABELS[e.track.duration as number] ?? `${e.track.duration}-day`,
      certName: e.track.certificateName,
    }));

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 space-y-8">

      {profileIncomplete && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex gap-3 items-start">
          <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18} />
          <div className="text-sm">
            <p className="font-medium text-amber-800">Complete your profile</p>
            <p className="text-amber-700 mt-0.5">
              Your {!student.phone ? "phone number" : "degree program"}{" "}
              {!student.phone && student.degreeProgram === "Other" ? "and degree program are" : "is"} missing or set to a placeholder.
              This affects certificate delivery and analytics accuracy.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-white shadow-sm overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-ink via-ink/80 to-marigold/60" />
        <div className="px-6 pb-6">
          <div className="-mt-10 mb-4 inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-marigold text-white text-2xl font-bold shadow-lg border-4 border-white">
            {initials(student.name)}
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink">{student.name}</h1>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ProfileField icon={<Mail size={14} />} label="Email" value={student.email} />
            <ProfileField icon={<Phone size={14} />} label="Phone" value={student.phone || "-"} />
            <ProfileField icon={<Building2 size={14} />} label="Institution" value={student.college || "-"} />
            <ProfileField
              icon={<GraduationCap size={14} />}
              label="Degree"
              value={student.degreeProgram === "Other" && student.degreeProgramOther ? student.degreeProgramOther : (student.degreeProgram || "-")}
            />
          </div>
          <ProfileEditor
            student={{ phone: student.phone, college: student.college, degreeProgram: student.degreeProgram, degreeProgramOther: student.degreeProgramOther }}
            studentName={student.name}
            studentEmail={student.email}
          />
        </div>
      </div>

      <section>
        <h2 className="font-display text-xl font-semibold text-ink mb-4 flex items-center gap-2">
          <User size={18} className="text-marigold" /> Enrolled Domains
        </h2>
        {domainMap.size === 0 ? (
          <div className="rounded-xl border border-line bg-white p-8 text-center">
            <p className="text-ink/50 text-sm">No enrollments yet.</p>
            <Link href="/domains" className="inline-block mt-3 text-sm font-medium text-marigold-dark hover:underline">Browse domains</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(domainMap.values()).map((group) => (
              <div key={group.domainSlug} className="rounded-xl border border-line bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-ink/5 border-b border-line flex items-center justify-between">
                  <span className="font-semibold text-sm text-ink">{group.domainName}</span>
                  <span className="text-xs text-ink/40">{group.enrollments.length} track{group.enrollments.length !== 1 ? "s" : ""}</span>
                </div>
                {group.enrollments.map((e: any) => (
                  <div key={e.id} className="px-5 py-4 flex items-center justify-between gap-4 border-b border-line/50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-ink">{DURATION_LABELS[e.track.duration as number] ?? `${e.track.duration}-day`}</p>
                      <p className="text-xs text-ink/50 mt-0.5">Enrolled {formatDate(e.enrolledAt)}</p>
                      {e.completedAt && <p className="text-xs text-emerald-600 mt-0.5">Completed {formatDate(e.completedAt)}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[e.status] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                        {e.status === "COMPLETED" ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                        {STATUS_LABELS[e.status] ?? e.status}
                      </span>
                      {e.status === "IN_PROGRESS" && (
                        <Link href={`/dashboard/track/${e.id}`} className="text-xs font-medium text-marigold-dark hover:underline">Continue</Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold text-ink mb-4 flex items-center gap-2">
          <Award size={18} className="text-marigold" /> Certificates
        </h2>
        {certificates.length === 0 ? (
          <div className="rounded-xl border border-line bg-white p-8 text-center">
            <Award size={32} className="mx-auto text-ink/20 mb-3" />
            <p className="text-ink/50 text-sm">No certificates yet. Complete a track to earn one.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {certificates.map((cert: any) => (
              <div key={cert.certId} className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 flex flex-col gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Award size={16} className="text-emerald-600" />
                    <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Certificate</span>
                  </div>
                  <p className="font-semibold text-ink text-sm">{cert.certName}</p>
                  <p className="text-xs text-ink/60 mt-0.5">{cert.domainName} · {cert.trackLabel}</p>
                  <p className="text-xs text-ink/50 mt-1">Issued {formatDate(cert.issuedAt)}</p>
                </div>
                <div className="flex items-center gap-2 mt-auto pt-3 border-t border-emerald-200">
                  <a href={cert.pdfUrl} target="_blank" rel="noopener noreferrer" download
                    className="inline-flex items-center gap-1.5 text-xs font-medium bg-emerald-700 text-white px-3 py-2 rounded-lg hover:bg-emerald-800 transition-colors">
                    <Download size={12} /> Download PDF
                  </a>
                  <a href={`/verify/${cert.certId}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 border border-emerald-300 px-3 py-2 rounded-lg hover:bg-emerald-100 transition-colors">
                    <ExternalLink size={12} /> Verify Online
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

