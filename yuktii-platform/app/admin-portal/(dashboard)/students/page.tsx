import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Download, Search, Users } from 'lucide-react';
import StudentTableClient from './StudentTableClient';

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  const q = searchParams.q ?? '';
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const take = 30;
  const skip = (page - 1) * take;

  const where = q
    ? {
        role: 'STUDENT',
        OR: [
          { name: { contains: q } },
          { email: { contains: q } },
          { college: { contains: q } },
          { phone: { contains: q } },
        ],
      }
    : { role: 'STUDENT' };

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        enrollments: {
          include: {
            certificate: true,
          },
        },
      },
    }),
    prisma.student.count({ where }),
  ]);

  const totalPages = Math.ceil(total / take);

  const formattedStudents = students.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    phone: s.phone ?? '',
    college: s.college,
    degreeProgram: s.degreeProgram,
    enrollmentsCount: s.enrollments.length,
    certsCount: s.enrollments.filter((e) => e.certificate).length,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <div className="p-8 max-w-[1200px]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-7">
        <div>
          <p className="text-[11px] tracking-widest text-ink/40 uppercase mb-1">Admin Portal</p>
          <h1 className="text-2xl font-bold text-ink flex items-center gap-2.5">
            <Users size={22} className="text-teal" />
            Students ({total})
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/admin-portal/export?format=csv"
            className="btn-ghost text-xs inline-flex items-center gap-1.5 border border-line bg-white"
          >
            <Download size={13} /> CSV
          </a>
          <a
            href="/api/admin-portal/export?format=xlsx"
            className="btn-ghost text-xs inline-flex items-center gap-1.5 border border-line bg-white"
          >
            <Download size={13} /> Excel
          </a>
        </div>
      </div>

      {/* Search Bar */}
      <form method="GET" className="flex items-center gap-2 mb-6">
        <div className="relative max-w-sm w-full">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, email, phone, college…"
            className="input-field pl-9 text-sm"
          />
        </div>
        <button type="submit" className="btn-primary text-xs">
          Search
        </button>
        {q && (
          <Link href="/admin-portal/students" className="btn-ghost text-xs">
            Clear
          </Link>
        )}
      </form>

      {/* Table Component */}
      <StudentTableClient students={formattedStudents} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-1.5 mt-6">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`?q=${encodeURIComponent(q)}&page=${p}`}
              className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                p === page
                  ? 'bg-teal text-white border-teal'
                  : 'bg-white text-ink/70 border-line hover:border-ink/30'
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
