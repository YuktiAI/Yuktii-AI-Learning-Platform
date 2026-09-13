import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import type { Metadata } from 'next';

type Props = { params: { certificateId: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: `Certificate Verification — Yuktii AI Labs`,
    description: `Verify certificate ${params.certificateId} issued by Yuktii AI Labs`,
    robots: 'noindex', // prevent search engines indexing individual cert pages
  };
}

export default async function VerifyCertificatePage({ params }: Props) {
  const cert = await prisma.certificate.findUnique({
    where: { publicCertificateId: params.certificateId.toUpperCase() },
    include: {
      enrollment: {
        include: {
          student: true,
          track: { include: { domain: true } },
        },
      },
    },
  });

  if (!cert) {
    return (
      <div className="mx-auto max-w-lg px-5 py-20 text-center">
        <div className="text-5xl mb-6">❌</div>
        <h1 className="font-display text-2xl font-semibold mb-3">Certificate not found</h1>
        <p className="text-ink/60 text-sm mb-6">
          The certificate ID <span className="stage-id font-semibold">{params.certificateId}</span> was
          not found in our records. Please double-check the ID or QR code.
        </p>
        <Link href="/verify" className="btn-ghost">Try another ID</Link>
      </div>
    );
  }

  const { enrollment } = cert;
  const student = enrollment.student;
  const track = enrollment.track;
  const domain = track.domain;

  const issueDate = new Date(cert.issueDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const LEVEL_COLORS: Record<string, string> = {
    FOUNDATION: 'from-sky-400 to-cyan-500',
    FOUNDATION_PLUS: 'from-indigo-400 to-violet-500',
    PRACTITIONER: 'from-teal-400 to-emerald-500',
    APPLIED_PRACTITIONER: 'from-amber-400 to-orange-500',
    CAPSTONE: 'from-rose-400 to-pink-500',
  };

  const gradient = LEVEL_COLORS[track.levelName] ?? 'from-ink to-ink/80';

  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      {/* Badge */}
      <div className="text-center mb-8">
        <p className="badge badge-teal mx-auto mb-3">VERIFIED CERTIFICATE</p>
      </div>

      {/* Certificate card */}
      <div className="rounded-2xl border-2 border-line bg-white shadow-xl overflow-hidden">
        {/* Gradient header */}
        <div className={`bg-gradient-to-r ${gradient} p-8 text-white text-center`}>
          <div className="text-4xl mb-2">🏅</div>
          <p className="text-white/70 text-xs stage-id tracking-widest mb-2">CERTIFICATE OF COMPLETION</p>
          <h1 className="font-display text-2xl font-semibold">{track.certificateName}</h1>
        </div>

        {/* Certificate body */}
        <div className="p-8">
          <div className="text-center mb-8">
            <p className="text-sm text-ink/50 mb-1">This certifies that</p>
            <h2 className="font-display text-3xl font-semibold text-ink">{student.name}</h2>
            <p className="text-ink/50 text-sm mt-1">{student.email}</p>
          </div>

          <p className="text-center text-ink/70 text-sm mb-8 leading-relaxed">
            has successfully completed all stages of the{' '}
            <strong>{track.duration}-day {domain.name}</strong> internship track
            at Yuktii AI Labs, demonstrating practical proficiency through a
            project-based self-paced program.
          </p>

          {/* Details grid */}
          <div className="grid sm:grid-cols-2 gap-4 mb-8">
            {[
              { label: 'Domain', value: domain.name },
              { label: 'Duration', value: `${track.duration} days` },
              { label: 'Level', value: track.levelName.replace(/_/g, ' ') },
              { label: 'Issue Date', value: issueDate },
            ].map((item) => (
              <div key={item.label} className="glass rounded-xl border border-line p-4 text-center">
                <p className="text-xs stage-id text-ink/40 tracking-widest mb-1">{item.label.toUpperCase()}</p>
                <p className="font-semibold text-sm">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Certificate ID */}
          <div className="text-center border-t border-line pt-6">
            <p className="text-xs text-ink/40 mb-2">Certificate ID</p>
            <p className="stage-id text-xl font-bold text-ink tracking-widest">{cert.publicCertificateId}</p>
            {cert.qrCodeUrl && (
              <div className="mt-4 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cert.qrCodeUrl}
                  alt={`QR code for certificate ${cert.publicCertificateId}`}
                  className="w-28 h-28 rounded-lg border border-line"
                />
              </div>
            )}
            <p className="text-xs text-ink/40 mt-3">
              Issued by Yuktii AI Labs · verify at{' '}
              <span className="stage-id">{process.env.NEXT_PUBLIC_APP_URL ?? 'yuktii.ai'}/verify/{cert.publicCertificateId}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Verification note */}
      <div className="mt-6 glass rounded-xl border border-line p-5 flex items-start gap-3">
        <span className="text-teal text-xl">✓</span>
        <div>
          <p className="font-medium text-sm">This certificate is authentic</p>
          <p className="text-xs text-ink/60 mt-0.5 leading-relaxed">
            This page is the official verification record for certificate{' '}
            <span className="stage-id font-semibold">{cert.publicCertificateId}</span>, issued by
            Yuktii AI Labs on {issueDate}. The QR code on the physical certificate links directly here.
          </p>
        </div>
      </div>

      <div className="mt-6 text-center">
        <Link href="/verify" className="text-sm text-ink/50 hover:text-ink transition-colors">
          Verify another certificate →
        </Link>
      </div>
    </div>
  );
}
