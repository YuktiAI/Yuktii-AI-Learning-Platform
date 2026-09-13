import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET as string;
const STUDENT_COOKIE = 'student_session';
const ADMIN_COOKIE = 'admin_session';

async function verifyToken(token: string): Promise<{ role: string } | null> {
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as { role: string };
  } catch (err) {
    console.error('[middleware verify error]', err);
    return null;
  }
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin-portal/:path*',
    // Redirect old /admin/* paths (not /admin-portal/*) to portal login
    '/admin/:path*',
  ],
};

/**
 * Two-layer authentication protection:
 *
 * Layer 1 — Middleware (this file, runs at the Edge before any page renders):
 *   - Verifies JWT from the appropriate session cookie.
 *   - Redirects unauthenticated users to /login with ?returnTo= so they return
 *     to the page they were trying to reach after successful login.
 *   - Fastest path: no DB call needed.
 *
 * Layer 2 — Server Component / Route Handler (second check in application code):
 *   - Each dashboard page and API route re-checks the session independently.
 *   - This ensures protection even if the middleware edge runtime is bypassed
 *     (e.g. direct API calls without going through the Next.js middleware layer).
 *   - Example: app/dashboard/track/[id]/page.tsx calls getSession() at the top.
 *
 * Public routes (intentionally NOT matched by this middleware):
 *   - / (home), /domains/[slug] (marketing pages), /pricing, /about, /faq
 *   - /login, /signup, /verify/[certificateId]
 *   - All /api/auth/* endpoints (login, signup, OTP)
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Legacy /admin/* paths → redirect to admin-portal login ───────────────
  // The old admin routes were deleted; redirect any bookmarked paths.
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin-portal')) {
    return NextResponse.redirect(new URL('/admin-portal/login', request.url));
  }

  // ── Admin-portal routes ──────────────────────────────────────────────────
  // ONLY reads ADMIN_COOKIE — never touches student session.
  if (pathname.startsWith('/admin-portal')) {
    // Login page is public — no auth check needed.
    if (pathname === '/admin-portal/login') return NextResponse.next();

    const adminToken = request.cookies.get(ADMIN_COOKIE)?.value;
    if (!adminToken) {
      return NextResponse.redirect(new URL('/admin-portal/login', request.url));
    }
    const payload = await verifyToken(adminToken);
    if (!payload || payload.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/admin-portal/login', request.url));
    }
    // Explicit return — never falls through to student block.
    return NextResponse.next();
  }

  // ── Student / dashboard routes ────────────────────────────────────────────
  // ONLY reads STUDENT_COOKIE — never touches admin session.
  if (pathname.startsWith('/dashboard')) {
    const studentToken = request.cookies.get(STUDENT_COOKIE)?.value;

    if (!studentToken) {
      // Preserve the full URL (path + query) so login can redirect back after success.
      const returnTo = encodeURIComponent(pathname + request.nextUrl.search);
      return NextResponse.redirect(new URL(`/login?returnTo=${returnTo}`, request.url));
    }

    const payload = await verifyToken(studentToken);
    if (!payload) {
      const returnTo = encodeURIComponent(pathname + request.nextUrl.search);
      return NextResponse.redirect(new URL(`/login?returnTo=${returnTo}`, request.url));
    }

    // Explicit return — never falls through to admin block.
    return NextResponse.next();
  }

  return NextResponse.next();
}
