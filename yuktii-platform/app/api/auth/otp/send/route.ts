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

const isDev = process.env.NODE_ENV === 'development';

export async function POST(req: NextRequest) {
  return wrapApiRoute(async () => {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { contact, via, type } = parsed.data;
    const otp = await createOtp(contact, type);

    // Always log OTP to server console for debugging (never to client in prod)
    console.log(`\n[OTP] ${via.toUpperCase()} → ${contact} : ${otp}  (${type})\n`);

    if (via === 'email') {
      const sendResult = await sendMail({
        to: contact,
        subject: type === 'signup'
          ? 'Your Yuktii AI Labs sign-up OTP'
          : 'Your Yuktii AI Labs password-reset OTP',
        html: otpEmailHtml(otp, type),
        text: `Your Yuktii AI Labs OTP is: ${otp}\nExpires in 10 minutes. Do not share it with anyone.`,
      });

      if (!sendResult.success) {
        // Log full internal detail server-side only — never expose to client
        console.error(`[OTP] Email delivery failed for ${contact}: ${sendResult.error}`);

        if (isDev) {
          // In development, surface the OTP on-screen so the flow still works
          // without needing a configured email provider.
          console.warn('[OTP] Dev mode: returning OTP in response because email delivery failed.');
          return NextResponse.json({ ok: true, devOtp: otp });
        }

        return NextResponse.json({
          error: 'Unable to send OTP. Please try again in a few minutes.',
        }, { status: 500 });
      }
    } else {
      console.warn(`[OTP] SMS not yet configured. OTP for ${contact}: ${otp}`);
      if (isDev) {
        return NextResponse.json({ ok: true, devOtp: otp });
      }
    }

    // In dev, always return devOtp even when email succeeded (for convenience)
    return NextResponse.json(isDev ? { ok: true, devOtp: otp } : { ok: true });
  }, { service: 'smtp-otp', req });
}

