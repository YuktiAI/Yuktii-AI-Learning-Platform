'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const DOMAINS = [
  { slug: 'ai-ml-llm-apps', name: 'AI/ML & LLM Apps' },
  { slug: 'data-science', name: 'Data Science' },
  { slug: 'data-analysis', name: 'Data Analysis' },
  { slug: 'iot', name: 'IoT' },
  { slug: 'fullstack-java', name: 'Full Stack (Java)' },
  { slug: 'erp-odoo', name: 'ERP (Odoo)' },
  { slug: 'data-engineering', name: 'Data Engineering' },
  { slug: 'fullstack-python', name: 'Full Stack (Python)' },
];

export default function Footer() {
  const pathname = usePathname();
  if (pathname?.startsWith('/admin-portal')) return null;

  return (
    <footer className="bg-ink text-paper mt-20">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-md bg-paper/10 flex items-center justify-center border border-paper/10">
                <span className="text-marigold font-display font-bold text-sm">Y</span>
              </div>
              <span className="font-display text-base font-semibold">
                Yuktii<span className="text-marigold">.</span>AI Labs
              </span>
            </div>
            <p className="text-sm text-paper/60 leading-relaxed max-w-[220px]">
              Real project-based internships. No live mentor. Verifiable certificates.
            </p>
            <p className="mt-4 text-xs text-paper/40 stage-id">
              connect@yuktiiai.in
            </p>
          </div>

          {/* Domains */}
          <div>
            <h3 className="text-xs stage-id text-paper/40 mb-4 tracking-widest">DOMAINS</h3>
            <ul className="space-y-2">
              {DOMAINS.slice(0, 4).map((d) => (
                <li key={d.slug}>
                  <Link href={`/domains/${d.slug}`} className="text-sm text-paper/70 hover:text-marigold transition-colors">
                    {d.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs stage-id text-paper/40 mb-4 tracking-widest">&nbsp;</h3>
            <ul className="space-y-2">
              {DOMAINS.slice(4).map((d) => (
                <li key={d.slug}>
                  <Link href={`/domains/${d.slug}`} className="text-sm text-paper/70 hover:text-marigold transition-colors">
                    {d.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Links */}
          <div>
            <h3 className="text-xs stage-id text-paper/40 mb-4 tracking-widest">PLATFORM</h3>
            <ul className="space-y-2">
              {[
                { href: '/pricing', label: 'Pricing & Durations' },
                { href: '/about', label: 'About Us' },
                { href: '/faq', label: 'FAQ' },
                { href: '/verify', label: 'Verify a Certificate' },
                { href: '/login', label: 'Log In' },
                { href: '/login?mode=signup', label: 'Start a Track' },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-paper/70 hover:text-marigold transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-paper/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-paper/40">
            © {new Date().getFullYear()} Yuktii AI Labs. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <span className="badge badge-gold">Phase 1 Build</span>
            <span className="text-xs text-paper/30">India · Remote</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
