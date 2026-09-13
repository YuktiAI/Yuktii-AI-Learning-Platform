import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyOtp } from '@/lib/otp-store';
import { logError } from '@/lib/error-handler';

const schema = z.object({
  contact: z.string().min(1),
  otp: z.string().length(6),
  type: z.enum(['signup', 'forgot']),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { contact, otp, type } = parsed.data;
    const result = await verifyOtp(contact, type, otp);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ verified: true });
  } catch (err) {
    const { studentMessage } = await logError({ service: 'smtp-otp-verify', error: err });
    return NextResponse.json({ error: studentMessage }, { status: 500 });
  }
}
