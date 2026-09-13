import Link from 'next/link';
import { DOMAINS, DURATION_LEVELS } from '@/lib/domains';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing & Durations — Yuktii AI Labs',
  description: 'Compare all 5 duration bundles across 8 domains. Foundation (30 days) to Capstone (90 days). Pricing announced at enrollment.',
};

const LEVEL_COLORS = [
  'bg-sky-50 text-sky-700 border-sky-200',
  'bg-indigo-50 text-indigo-700 border-indigo-200',
  'bg-teal-50 text-teal-700 border-teal-200',
  'bg-amber-50 text-amber-700 border-amber-200',
  'bg-rose-50 text-rose-700 border-rose-200',
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-16">
      {/* Header */}
      <div className="text-center mb-14">
        <p className="stage-id text-xs text-teal mb-3 tracking-widest">PRICING</p>
        <h1 className="font-display text-4xl font-semibold">Same structure, every domain.</h1>
        <p className="text-ink/65 mt-4 max-w-xl mx-auto leading-relaxed">
          All 8 domains use the same five duration bundles. Pick the depth that fits your time and
          goals — longer bundles combine more of the professional workflow into one larger project.
        </p>
      </div>

      {/* Duration tiers */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-16">
        {DURATION_LEVELS.map((d, i) => (
          <div key={d.duration} className={`rounded-xl border border-l-4 p-5 bg-white shadow-sm ${
            i === 0 ? 'border-sky-400' :
            i === 1 ? 'border-indigo-400' :
            i === 2 ? 'border-teal-400' :
            i === 3 ? 'border-amber-400' :
                      'border-rose-400'
          }`}>
            <div className="stage-id text-3xl font-bold text-ink mb-1">{d.duration}</div>
            <div className="text-xs text-ink/40 mb-3 stage-id">days</div>
            <div className={`inline-block text-xs px-2 py-0.5 rounded-md border font-medium mb-2 ${LEVEL_COLORS[i]}`}>
              {d.level}
            </div>
            <p className="text-xs font-semibold mt-2">{d.certificate}</p>
            <p className="text-xs text-ink/40 mt-3 stage-id">Price TBA</p>
          </div>
        ))}
      </div>

      {/* Domain × Duration matrix */}
      <div className="mb-8">
        <h2 className="font-display text-2xl font-semibold mb-2">All domains, all durations</h2>
        <p className="text-ink/60 text-sm mb-6">Every ✓ means a full certification track exists for that domain at that duration.</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line shadow-sm bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-ink text-paper">
              <th className="text-left px-5 py-3.5 font-medium w-48">Domain</th>
              {DURATION_LEVELS.map((d) => (
                <th key={d.duration} className="px-4 py-3.5 font-medium text-center">
                  <div className="stage-id text-sm">{d.duration}d</div>
                  <div className="text-xs text-paper/50 font-normal mt-0.5">{d.level}</div>
                </th>
              ))}
              <th className="px-4 py-3.5 font-medium text-center">More</th>
            </tr>
          </thead>
          <tbody>
            {DOMAINS.map((domain, di) => (
              <tr key={domain.slug} className={di % 2 === 0 ? 'bg-white' : 'bg-ink/[0.02]'}>
                <td className="px-5 py-3.5 font-medium">
                  <Link href={`/domains/${domain.slug}`} className="hover:text-marigold-dark transition-colors">
                    {domain.name}
                  </Link>
                </td>
                {DURATION_LEVELS.map((d) => (
                  <td key={d.duration} className="px-4 py-3.5 text-center">
                    <span className="text-teal font-semibold">✓</span>
                  </td>
                ))}
                <td className="px-4 py-3.5 text-center">
                  <Link
                    href={`/domains/${domain.slug}`}
                    className="text-xs text-marigold-dark hover:underline font-medium"
                  >
                    Details →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div className="mt-8 glass rounded-xl p-5 border border-line">
        <p className="text-sm text-ink/65 leading-relaxed">
          <strong className="text-ink">Pricing is being finalized</strong> and will be shown at checkout
          before any payment is required. Each enrollment covers the full duration with unlimited access
          to all stages, model answers, and the generated certificate — no subscription, no recurring fees.
        </p>
      </div>

      {/* CTA */}
      <div className="mt-10 text-center">
        <p className="text-ink/60 text-sm mb-4">Not sure which domain to pick?</p>
        <Link href="/#domains" className="btn-primary">
          Browse all 8 domains
        </Link>
      </div>
    </div>
  );
}
