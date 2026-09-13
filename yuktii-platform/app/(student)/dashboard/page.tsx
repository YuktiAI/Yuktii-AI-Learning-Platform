import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Clock, Award, ClipboardList } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: 'bg-teal/10 text-teal border-teal/20',
  PENDING_PAYMENT: 'bg-amber/10 text-amber-700 border-amber-200',
  SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: 'In Progress',
  PENDING_PAYMENT: 'Pending Payment',
  SUBMITTED: 'Submitted',
  COMPLETED: 'Completed',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  IN_PROGRESS: <Clock size={11} />,
  PENDING_PAYMENT: <Clock size={11} />,
  SUBMITTED: <Clock size={11} />,
  COMPLETED: <CheckCircle2 size={11} />,
};

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const student = await prisma.student.findUnique({ where: { id: session.studentId } });

  const rawEnrollments = await prisma.enrollment.findMany({
    where: { studentId: session.studentId },
    include: {
      track: { include: { domain: true, stages: true } },
      submissions: true,
      certificate: true,
    },
    orderBy: { enrolledAt: 'desc' },
  });

  // When payment gateway is disabled for testing, auto-treat pending payment as in progress
  const disablePayment = process.env.DISABLE_PAYMENT_GATEWAY !== 'false';
  const enrollments = rawEnrollments.map((e) => {
    if (disablePayment && e.status === 'PENDING_PAYMENT') {
      return { ...e, status: 'IN_PROGRESS', paymentStatus: 'PAID' };
    }
    return e;
  });

  const completedCount = enrollments.filter((e) => e.status === 'COMPLETED').length;
  const inProgressCount = enrollments.filter((e) => e.status === 'IN_PROGRESS').length;

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      {/* Header */}
      <div className="flex items-start justify-between mb-10">
        <div>
          <p className="stage-id text-xs text-ink/40 mb-1 tracking-widest">DASHBOARD</p>
          <h1 className="font-display text-3xl font-semibold">
            {student?.name ? `Hey, ${student.name.split(' ')[0]}` : 'Your tracks'}
          </h1>
          <p className="text-ink/55 text-sm mt-1">{session.email}</p>
        </div>
        <div className="hidden sm:flex items-center gap-3">
          {completedCount > 0 && (
            <div className="text-center px-4 py-2 glass rounded-lg border border-line">
              <div className="font-display text-2xl font-semibold text-teal">{completedCount}</div>
              <div className="text-xs text-ink/50">completed</div>
            </div>
          )}
          {inProgressCount > 0 && (
            <div className="text-center px-4 py-2 glass rounded-lg border border-line">
              <div className="font-display text-2xl font-semibold text-marigold-dark">{inProgressCount}</div>
              <div className="text-xs text-ink/50">in progress</div>
            </div>
          )}
        </div>
      </div>

      {/* Empty state */}
      {enrollments.length === 0 && (
        <div className="glass rounded-2xl p-12 text-center border border-line">
          <div className="flex justify-center mb-4">
            <ClipboardList size={40} className="text-ink/20" />
          </div>
          <h2 className="font-display text-xl font-semibold mb-2">No tracks yet</h2>
          <p className="text-ink/60 text-sm mb-6 max-w-sm mx-auto">
            Browse our 8 domains and pick a certification track to start your first internship project.
          </p>
          <Link href="/#domains" className="btn-primary">
            Browse 8 domains →
          </Link>
        </div>
      )}

      {/* Enrollment cards */}
      <div className="space-y-4">
        {enrollments.map((e) => {
          const totalStages = e.track.stages.length;
          const completedStages = e.submissions.filter((s) => s.selfCheckCompleted).length;
          const pct = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;
          const isComplete = e.status === 'COMPLETED';

          return (
            <div key={e.id} className={`rounded-xl border bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow ${isComplete ? 'border-emerald-200' : 'border-line'}`}>
              <div className="p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="stage-id text-xs text-ink/40 mb-1 tracking-wide">{e.track.domain.name}</p>
                    <h2 className="font-display text-xl font-semibold">
                      {e.track.duration}-day {e.track.certificateName}
                    </h2>
                    <p className="text-sm text-ink/50 mt-1 stage-id">{e.track.levelName.replace(/_/g, ' ')}</p>
                  </div>
                  <span className={`badge text-xs shrink-0 inline-flex items-center gap-1 ${STATUS_COLORS[e.status] || 'bg-line text-ink/50 border-line'}`}>
                    {STATUS_ICONS[e.status]}
                    {STATUS_LABELS[e.status] || e.status}
                  </span>
                </div>

                {/* Progress bar */}
                {totalStages > 0 && (
                  <div className="mt-5">
                    <div className="flex justify-between items-center mb-1.5 text-xs text-ink/50">
                      <span>Stage progress</span>
                      <span className="stage-id">{completedStages} / {totalStages} stages</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}

                {/* Certificate issued */}
                {e.certificate && (
                  <div className="mt-4 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    <Award size={14} className="shrink-0" />
                    <span className="font-medium">Certificate issued</span>
                    <span className="text-emerald-500">·</span>
                    <Link
                      href={`/verify/${e.certificate.publicCertificateId}`}
                      className="hover:underline font-semibold stage-id"
                      target="_blank"
                    >
                      {e.certificate.publicCertificateId}
                    </Link>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-5 flex flex-wrap gap-3">
                  {e.status === 'PENDING_PAYMENT' ? (
                    <span className="text-xs text-ink/50 italic">Payment required to begin</span>
                  ) : (
                    <Link
                      href={`/dashboard/track/${e.id}`}
                      className={`${isComplete ? 'btn-ghost' : 'btn-primary'} text-sm`}
                    >
                      {isComplete ? 'View track' : completedStages === 0 ? 'Start track →' : 'Continue track →'}
                    </Link>
                  )}
                  {e.certificate && (
                    <Link
                      href={`/verify/${e.certificate.publicCertificateId}`}
                      className="btn-ghost text-sm"
                      target="_blank"
                    >
                      View certificate ↗
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Browse more */}
      {enrollments.length > 0 && (
        <div className="mt-8 text-center">
          <p className="text-ink/50 text-sm mb-3">Want to start another track?</p>
          <Link href="/#domains" className="btn-ghost text-sm">
            Browse all 8 domains
          </Link>
        </div>
      )}
    </div>
  );
}
