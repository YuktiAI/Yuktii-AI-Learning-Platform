import { NextResponse } from 'next/server';

const STUDENT_COOKIE = 'student_session';
const ADMIN_COOKIE = 'admin_session';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  // Clear both cookies on the response object (works in Route Handlers)
  response.cookies.set(STUDENT_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set(ADMIN_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
