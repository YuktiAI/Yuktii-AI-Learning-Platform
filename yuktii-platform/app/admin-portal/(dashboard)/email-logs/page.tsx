import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import EmailLogsClient from './EmailLogsClient';

export default async function EmailLogsPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string; page?: string };
}) {
  const statusFilter = searchParams.status ?? '';
  const searchQuery = searchParams.q ?? '';
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const limit = 30;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (statusFilter === 'sent' || statusFilter === 'failed') {
    where.status = statusFilter;
  }
  if (searchQuery) {
    where.OR = [
      { recipientEmail: { contains: searchQuery } },
      { subject: { contains: searchQuery } },
      { errorMessage: { contains: searchQuery } },
    ];
  }

  const [total, sent, failed, logs] = await Promise.all([
    prisma.emailLog.count(),
    prisma.emailLog.count({ where: { status: 'sent' } }),
    prisma.emailLog.count({ where: { status: 'failed' } }),
    prisma.emailLog.findMany({
      where,
      orderBy: { attemptedAt: 'desc' },
      skip,
      take: limit,
      include: {
        enrollment: {
          include: {
            student: { select: { name: true, email: true } },
            track: { select: { certificateName: true } },
          },
        },
      },
    }),
  ]);

  const filteredTotal = await prisma.emailLog.count({ where });
  const totalPages = Math.ceil(filteredTotal / limit);

  const formattedLogs = logs.map((log) => ({
    id: log.id,
    recipientEmail: log.recipientEmail,
    subject: log.subject,
    status: log.status,
    errorMessage: log.errorMessage,
    smtpHost: log.smtpHost,
    attemptedAt: log.attemptedAt.toISOString(),
    enrollment: log.enrollment
      ? {
          student: log.enrollment.student
            ? {
                name: log.enrollment.student.name,
                email: log.enrollment.student.email,
              }
            : null,
          track: log.enrollment.track
            ? {
                certificateName: log.enrollment.track.certificateName,
              }
            : null,
        }
      : null,
  }));

  return (
    <div className="p-8 max-w-[1200px]">
      <div className="mb-7">
        <p className="text-[11px] tracking-widest text-ink/40 uppercase mb-1">Admin Portal</p>
        <h1 className="text-2xl font-bold text-ink flex items-center gap-2.5">
          <Mail size={22} className="text-teal" />
          Email Delivery Logs
        </h1>
        <p className="text-xs text-ink/60 mt-1">
          Monitor certificate delivery emails, diagnose SMTP delivery errors, and retry failed transmissions.
        </p>
      </div>

      <EmailLogsClient
        initialLogs={formattedLogs}
        stats={{
          total,
          sent,
          failed,
        }}
        statusFilter={statusFilter}
        searchQuery={searchQuery}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-1.5 mt-6">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            const queryParams = new URLSearchParams();
            if (statusFilter) queryParams.set('status', statusFilter);
            if (searchQuery) queryParams.set('q', searchQuery);
            queryParams.set('page', String(p));
            return (
              <Link
                key={p}
                href={`?${queryParams.toString()}`}
                className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                  p === page
                    ? 'bg-teal text-white border-teal'
                    : 'bg-white text-ink/70 border-line hover:border-ink/30'
                }`}
              >
                {p}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
