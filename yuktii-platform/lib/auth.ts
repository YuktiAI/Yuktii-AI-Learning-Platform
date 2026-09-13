import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET as string;

// Two distinct cookie names — one per role.
// This prevents admin logins in one tab from overwriting the student session in another.
const STUDENT_COOKIE = 'student_session';
const ADMIN_COOKIE = 'admin_session';

export type SessionPayload = {
  studentId: string;
  role: string; // STUDENT | ADMIN | INSTITUTION_ADMIN
  email: string;
};

export function signSession(payload: SessionPayload) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

// ── Student cookie helpers ─────────────────────────────────────────────────

export function setStudentSessionCookie(token: string) {
  cookies().set(STUDENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearStudentSessionCookie() {
  cookies().delete(STUDENT_COOKIE);
}

// ── Admin cookie helpers ───────────────────────────────────────────────────

export function setAdminSessionCookie(token: string) {
  cookies().set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearAdminSessionCookie() {
  cookies().delete(ADMIN_COOKIE);
}

// ── Legacy alias — kept for backward compat on routes not yet updated ──────
// clearSessionCookie now clears the STUDENT cookie (most callers are student routes)
export function clearSessionCookie() {
  clearStudentSessionCookie();
}

// Legacy setSessionCookie — used only by signup (student). Login route now uses role-split helpers.
export function setSessionCookie(token: string) {
  setStudentSessionCookie(token);
}

// ── Session readers ────────────────────────────────────────────────────────

function verifyToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

/** Read the student session cookie. Use in server components & route handlers for student routes. */
export async function getStudentSession(): Promise<SessionPayload | null> {
  const token = cookies().get(STUDENT_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** Sync version for use in route handlers only (not server components). */
export function getStudentSessionSync(): SessionPayload | null {
  const token = cookies().get(STUDENT_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** Read the admin session cookie. Use in admin layout and admin API routes. */
export async function getAdminSession(): Promise<SessionPayload | null> {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || !['ADMIN', 'INSTITUTION_ADMIN'].includes(payload.role)) return null;
  return payload;
}

/** Sync version of getAdminSession for use in API route handlers. */
export function getAdminSessionSync(): SessionPayload | null {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || !['ADMIN', 'INSTITUTION_ADMIN'].includes(payload.role)) return null;
  return payload;
}

// ── Backward-compatible aliases (student-scoped) ───────────────────────────
// Existing student routes that import getSession / getSessionSync will continue
// to work unchanged — they now read student_session only.

export async function getSession(): Promise<SessionPayload | null> {
  return getStudentSession();
}

export function getSessionSync(): SessionPayload | null {
  return getStudentSessionSync();
}

// ── Admin guard helpers ────────────────────────────────────────────────────

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getAdminSession();
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}

export function requireAdminSync(): SessionPayload {
  const session = getAdminSessionSync();
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}
