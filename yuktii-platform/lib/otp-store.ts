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

// ── In-memory fallback (used when DB is unreachable) ──────────────────────────
// Keyed by normalised contact. Cleared on process restart (acceptable for dev).
interface MemEntry {
  codeHash: string;
  type: OtpType;
  expiresAt: number; // epoch ms
  verifiedAt: number | null;
}
const memStore = new Map<string, MemEntry>();

function memSet(contact: string, type: OtpType, otp: string): void {
  memStore.set(contact, {
    codeHash: hashOtp(otp),
    type,
    expiresAt: Date.now() + OTP_TTL_MS,
    verifiedAt: null,
  });
}

/** Generate and persist a new 6-digit OTP. A new request replaces the old code. */
export async function createOtp(contact: string, type: OtpType): Promise<string> {
  const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const key = normalise(contact);
  const data = {
    codeHash: hashOtp(otp),
    type,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    verifiedAt: null,
  };

  try {
    await prisma.otpCode.upsert({
      where: { contact: key },
      update: data,
      create: { contact: key, ...data },
    });
  } catch (dbErr) {
    // DB unreachable — fall back to in-memory store (dev/offline mode)
    console.warn('[otp-store] DB unavailable, using in-memory fallback for OTP storage:', (dbErr as Error).message);
    memSet(key, type, otp);
  }

  return otp;
}

/** Verify an OTP and mark it as verified for the requested action. */
export async function verifyOtp(
  contact: string,
  type: OtpType,
  otp: string
): Promise<{ ok: boolean; error?: string }> {
  const key = normalise(contact);

  // ── Try DB first ────────────────────────────────────────────────────────────
  try {
    const entry = await prisma.otpCode.findUnique({ where: { contact: key } });
    if (entry) {
      if (Date.now() > entry.expiresAt.getTime()) {
        await prisma.otpCode.delete({ where: { contact: key } }).catch(() => {});
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
      await prisma.otpCode.update({ where: { contact: key }, data: { verifiedAt: new Date() } }).catch(() => {});
      return { ok: true };
    }
    // Entry not in DB — fall through to memory check below
  } catch {
    // DB unreachable — fall through to memory check
  }

  // ── In-memory fallback ──────────────────────────────────────────────────────
  const mem = memStore.get(key);
  if (!mem) return { ok: false, error: 'No OTP found for this contact. Please request a new one.' };
  if (Date.now() > mem.expiresAt) {
    memStore.delete(key);
    return { ok: false, error: 'OTP has expired. Please request a new one.' };
  }
  if (mem.type !== type) {
    return { ok: false, error: 'This OTP is for a different action. Please request a new one.' };
  }
  const expected = Buffer.from(mem.codeHash, 'hex');
  const actual = Buffer.from(hashOtp(otp.trim()), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, error: 'Incorrect OTP. Please try again.' };
  }
  mem.verifiedAt = Date.now();
  return { ok: true };
}

/** Check for a verified, unexpired OTP before completing signup/password reset. */
export async function isVerified(contact: string, type: OtpType): Promise<boolean> {
  const key = normalise(contact);

  try {
    const entry = await prisma.otpCode.findUnique({ where: { contact: key } });
    if (entry) {
      return !!(entry.verifiedAt && entry.type === type && Date.now() <= entry.expiresAt.getTime());
    }
  } catch {
    // DB unreachable — check memory
  }

  const mem = memStore.get(key);
  return !!(mem && mem.verifiedAt && mem.type === type && Date.now() <= mem.expiresAt);
}

/** Delete an OTP after the protected action has completed. */
export async function consumeOtp(contact: string): Promise<void> {
  const key = normalise(contact);
  memStore.delete(key);
  try {
    await prisma.otpCode.deleteMany({ where: { contact: key } });
  } catch {
    // DB unreachable — already cleared from memory above
  }
}
