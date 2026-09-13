import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';

type OtpType = 'signup' | 'forgot';

/** Normalise contacts so lookup is independent of surrounding spaces/case. */
function normalise(contact: string): string {
  const trimmed = contact.trim();
  return trimmed.includes('@') ? trimmed.toLowerCase() : trimmed;
}

const OTP_TTL_MS = 10 * 60 * 1000;

function hashOtp(otp: string): string {
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('OTP_SECRET or JWT_SECRET must be set');
  return createHash('sha256').update(`${secret}:${otp}`).digest('hex');
}

/** Generate and persist a new 6-digit OTP. A new request replaces the old code. */
export async function createOtp(contact: string, type: OtpType): Promise<string> {
  const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const data = {
    codeHash: hashOtp(otp),
    type,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    verifiedAt: null,
  };

  await prisma.otpCode.upsert({
    where: { contact: normalise(contact) },
    update: data,
    create: { contact: normalise(contact), ...data },
  });

  return otp;
}

/** Verify an OTP and mark it as verified for the requested action. */
export async function verifyOtp(
  contact: string,
  type: OtpType,
  otp: string
): Promise<{ ok: boolean; error?: string }> {
  const key = normalise(contact);
  const entry = await prisma.otpCode.findUnique({ where: { contact: key } });
  if (!entry) return { ok: false, error: 'No OTP found for this contact. Please request a new one.' };

  if (Date.now() > entry.expiresAt.getTime()) {
    await prisma.otpCode.delete({ where: { contact: key } });
    return { ok: false, error: 'OTP has expired. Please request a new one.' };
  }
  if (entry.type !== type) {
    return { ok: false, error: 'This OTP is for a different action. Please request a new one.' };
  }

  const expected = Buffer.from(entry.codeHash, 'hex');
  const actual = Buffer.from(hashOtp(otp.trim()), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, error: 'Incorrect OTP. Please try again.' };
  }

  await prisma.otpCode.update({ where: { contact: key }, data: { verifiedAt: new Date() } });
  return { ok: true };
}

/** Check for a verified, unexpired OTP before completing signup/password reset. */
export async function isVerified(contact: string, type: OtpType): Promise<boolean> {
  const entry = await prisma.otpCode.findUnique({ where: { contact: normalise(contact) } });
  return !!(entry && entry.verifiedAt && entry.type === type && Date.now() <= entry.expiresAt.getTime());
}

/** Delete an OTP after the protected action has completed. */
export async function consumeOtp(contact: string): Promise<void> {
  await prisma.otpCode.deleteMany({ where: { contact: normalise(contact) } });
}
