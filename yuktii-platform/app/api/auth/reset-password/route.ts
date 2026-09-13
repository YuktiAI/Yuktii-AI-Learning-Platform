import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { isVerified, consumeOtp } from '@/lib/otp-store';
import { logError } from '@/lib/error-handler';

const schema = z.object({
  contact: z.string().min(1),           // email or phone number
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { contact, newPassword } = parsed.data;

    // Check OTP was verified for this contact
    if (!(await isVerified(contact, 'forgot'))) {
      return NextResponse.json(
        { error: 'OTP not verified. Please complete OTP verification first.' },
        { status: 403 }
      );
    }

    // Find student by email or phone
    const isEmail = contact.includes('@');
    const student = isEmail
      ? await prisma.student.findUnique({ where: { email: contact.toLowerCase() } })
      : await prisma.student.findFirst({ where: { phone: contact } });

    if (!student) {
      return NextResponse.json({ error: 'No account found for this contact.' }, { status: 404 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.student.update({
      where: { id: student.id },
      data: { passwordHash },
    });

    await consumeOtp(contact);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { studentMessage } = await logError({ service: 'auth-reset-password', error: err });
    return NextResponse.json({ error: studentMessage }, { status: 500 });
  }
}
