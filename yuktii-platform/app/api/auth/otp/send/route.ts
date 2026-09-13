import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createOtp } from '@/lib/otp-store';
import { sendMail, otpEmailHtml } from '@/lib/mailer';
import { wrapApiRoute } from '@/lib/error-handler';

const schema = z.object({
  contact: z.string().min(1),
  via: z.enum(['email', 'phone']),
  type: z.enum(['signup', 'forgot']),
});

export async function POST(req: NextRequest) {
  return wrapApiRoute(async () => {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { contact, via, type } = parsed.data;
    const otp = await createOtp(contact, type);

    // Always log OTP to server console for debugging (never to client)
    console.log(`\n[OTP] ${via.toUpperCase()} → ${contact} : ${otp}  (${type})\n`);

    if (via === 'email') {
      await sendMail({
        to: contact,
        subject: type === 'signup'
          ? 'Your Yuktii AI Labs sign-up OTP'
          : 'Your Yuktii AI Labs password-reset OTP',
        html: otpEmailHtml(otp, type),
        text: `Your Yuktii AI Labs OTP is: ${otp}\nExpires in 10 minutes. Do not share it with anyone.`,
      });
    } else {
      console.warn(`[OTP] SMS not yet configured. OTP for ${contact}: ${otp}`);
    }

    return NextResponse.json({ ok: true });
  }, { service: 'smtp-otp', req });
}
