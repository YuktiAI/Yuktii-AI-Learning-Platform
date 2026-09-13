import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { signSession } from '@/lib/auth';
import { logError } from '@/lib/error-handler';

const schema = z.object({
  email: z.string().transform((v) => v.trim().toLowerCase()).pipe(z.string().email('Please enter a valid email address')),
  password: z.string().min(1, 'Password is required'),
});

const STUDENT_COOKIE = 'student_session';
const ADMIN_COOKIE   = 'admin_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid email or password' },
        { status: 400 }
      );
    }

    const { email: cleanEmail, password } = parsed.data;

    const student = await prisma.student.findUnique({ where: { email: cleanEmail } });
    if (!student) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, student.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const token = signSession({ studentId: student.id, role: student.role, email: student.email });

    const isAdmin = student.role === 'ADMIN' || student.role === 'INSTITUTION_ADMIN';
    const cookieName = isAdmin ? ADMIN_COOKIE : STUDENT_COOKIE;

    // ── Set cookie ONLY on the Response object ──────────────────────────────
    // cookies().set() from 'next/headers' does NOT work inside Route Handlers.
    // The only correct way in a Route Handler is response.cookies.set().
    const response = NextResponse.json({ ok: true, role: student.role });
    response.cookies.set(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });

    return response;
  } catch (err) {
    const { studentMessage } = await logError({ service: 'auth-login', error: err });
    return NextResponse.json({ error: studentMessage }, { status: 500 });
  }
}
