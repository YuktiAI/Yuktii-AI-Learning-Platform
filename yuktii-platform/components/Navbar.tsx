'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

const navLinks = [
  { href: '/#domains', label: 'Domains' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
];

type SessionInfo = {
  loggedIn: boolean;
  name?: string;
  email?: string;
  role?: string;
};

function UserAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div className="w-8 h-8 rounded-full bg-marigold/20 border border-marigold/40 flex items-center justify-center shrink-0">
      <span className="text-xs font-bold text-marigold-dark">{initials}</span>
    </div>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [session, setSession] = useState<SessionInfo>({ loggedIn: false });
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Fetch session status on mount and on every route change
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setSession(data);
          setSessionLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setSessionLoaded(true);
      });
    return () => { cancelled = true; };
  }, [pathname]); // re-check on every page navigation

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setSession({ loggedIn: false });
      router.push('/');
      router.refresh();
    } catch {
      // ignore
    } finally {
      setLoggingOut(false);
    }
  }

  if (pathname?.startsWith('/admin-portal')) return null;

  const isAdmin = session.role === 'ADMIN' || session.role === 'INSTITUTION_ADMIN';

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-200 ${
        scrolled
          ? 'bg-paper/95 backdrop-blur-md border-b border-line shadow-sm'
          : 'bg-paper/80 backdrop-blur border-b border-transparent'
      }`}
    >
      <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group" aria-label="Yuktii AI Labs Home">
          <div className="w-8 h-8 rounded-md bg-ink flex items-center justify-center">
            <span className="text-marigold font-display font-bold text-sm">Y</span>
          </div>
          <span className="font-display text-base font-semibold tracking-tight">
            Yuktii<span className="text-marigold">.</span>AI Labs
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm" aria-label="Main navigation">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-ink/70 hover:text-ink transition-colors font-medium"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/verify"
            className="stage-id text-xs text-teal hover:text-teal/80 transition-colors"
          >
            Verify cert ↗
          </Link>
        </nav>

        {/* Desktop CTAs — conditional on auth */}
        <div className="hidden md:flex items-center gap-3">
          {!sessionLoaded ? (
            // Loading skeleton — prevent layout shift
            <div className="w-24 h-8 rounded-md bg-ink/5 animate-pulse" />
          ) : session.loggedIn ? (
            // ── Logged-in state ──────────────────────────────────────────────
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Link
                  href="/admin-portal"
                  className="text-sm font-medium text-ink/70 hover:text-ink transition-colors px-3 py-2"
                >
                  Admin Portal
                </Link>
              )}
              <Link
                href="/dashboard"
                className="text-sm font-medium text-ink/70 hover:text-ink transition-colors px-3 py-2"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/profile"
                className="text-sm font-medium text-ink/70 hover:text-ink transition-colors px-3 py-2"
              >
                Profile
              </Link>
              <div className="flex items-center gap-2 pl-2 border-l border-line">
                <UserAvatar name={session.name ?? 'U'} />
                <span className="text-sm font-medium text-ink max-w-[120px] truncate hidden lg:block">
                  {session.name}
                </span>
              </div>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="text-sm text-ink/50 hover:text-ink transition-colors px-3 py-2 disabled:opacity-50"
              >
                {loggingOut ? 'Logging out…' : 'Log out'}
              </button>
            </div>
          ) : (
            // ── Guest state ──────────────────────────────────────────────────
            <>
              <Link href="/login" className="text-sm font-medium text-ink/70 hover:text-ink transition-colors px-3 py-2">
                Log in
              </Link>
              <Link href="/login?mode=signup" className="btn-primary text-sm">
                Start a track
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden flex flex-col gap-1.5 p-2 rounded-md hover:bg-ink/5 transition-colors"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          <span className={`block w-5 h-0.5 bg-ink rounded-full transition-all duration-200 ${open ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`block w-5 h-0.5 bg-ink rounded-full transition-all duration-200 ${open ? 'opacity-0' : ''}`} />
          <span className={`block w-5 h-0.5 bg-ink rounded-full transition-all duration-200 ${open ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-line bg-paper/98 backdrop-blur-md px-5 py-4 space-y-1 animate-fade-up">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block py-3 text-sm font-medium text-ink/80 hover:text-ink border-b border-line/50 last:border-0"
            >
              {l.label}
            </Link>
          ))}
          <Link href="/verify" className="block py-3 text-sm stage-id text-teal border-b border-line/50">
            Verify a certificate ↗
          </Link>

          {/* Mobile auth section */}
          <div className="pt-3 flex flex-col gap-2">
            {session.loggedIn ? (
              <>
                {/* User info */}
                <div className="flex items-center gap-2 py-2 px-1 border-b border-line/50 mb-1">
                  <UserAvatar name={session.name ?? 'U'} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{session.name}</p>
                    <p className="text-xs text-ink/50 truncate">{session.email}</p>
                  </div>
                </div>
                {isAdmin && (
                  <Link href="/admin" className="btn-ghost text-center w-full">
                    Admin Panel
                  </Link>
                )}
                <Link href="/dashboard" className="btn-primary text-center w-full">
                  Go to Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="btn-ghost text-center w-full text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50"
                >
                  {loggingOut ? 'Logging out…' : 'Log out'}
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="btn-ghost text-center w-full">
                  Log in
                </Link>
                <Link href="/login?mode=signup" className="btn-primary text-center w-full">
                  Start a track
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
