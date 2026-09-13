import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { signSession } from '@/lib/auth';
import { isVerified, consumeOtp } from '@/lib/otp-store';
import { logError } from '@/lib/error-handler';

const DEGREE_OPTIONS = ['BSc', 'MSc', 'BE/B.Tech', 'ME/M.Tech', 'BCA/MCA', 'Other'] as const;

const schema = z.object({
  name:               z.string().min(1, 'Full name is required'),
  email:              z.string().email('Enter a valid email address'),
  phone:              z.string()
                       .min(1, 'Phone number is required')
                       .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  college:            z.string().optional(),
  degreeProgram:      z.enum(DEGREE_OPTIONS, { required_error: 'Degree program is required' }),
  degreeProgramOther: z.string().optional(),
  password:           z.string().min(8, 'Password must be at least 8 characters'),
}).refine(
  d => d.degreeProgram !== 'Other' || (d.degreeProgramOther?.trim().length ?? 0) > 0,
  { message: 'Please specify your degree program', path: ['degreeProgramOther'] }
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { name, email, phone, college, degreeProgram, degreeProgramOther, password } = parsed.data;
    const cleanEmail = email.trim().toLowerCase();

    // Require OTP verification before account creation
    if (!(await isVerified(cleanEmail, 'signup'))) {
      return NextResponse.json(
        { error: 'Email not verified. Please complete OTP verification first.' },
        { status: 403 }
      );
    }

    const existing = await prisma.student.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const student = await prisma.student.create({
      data: {
        name,
        email: cleanEmail,
        phone,
        college,
        degreeProgram,
        degreeProgramOther: degreeProgram === 'Other' ? degreeProgramOther : undefined,
        passwordHash,
      },
    });

    await consumeOtp(cleanEmail);

    const token = signSession({ studentId: student.id, role: student.role, email: student.email });

    const response = NextResponse.json({ ok: true, role: student.role });
    response.cookies.set('student_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (err) {
    const { studentMessage } = await logError({ service: 'auth-signup', error: err });
    return NextResponse.json({ error: studentMessage }, { status: 500 });
  }
}
