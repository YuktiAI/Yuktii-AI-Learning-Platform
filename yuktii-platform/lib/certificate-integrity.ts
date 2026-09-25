/**
 * certificate-integrity.ts — A-3 Revised: Full-payload HMAC-SHA256 certificate signing.
 *
 * A-3 PATCH — what changed from the previous Phase 7 implementation:
 *
 *   OLD: Sign only `enrollmentId`, truncate HMAC to 6 chars, embed in the ID itself.
 *        Problem: 6 chars = 24-bit space; doesn't bind to score/track/date so
 *        tampering with stored certificate data wouldn't be caught.
 *
 *   NEW: Sign the full payload (studentId|trackId|completionDate|finalScore) with
 *        full-length HMAC-SHA256 (64 hex chars). Store it as a separate DB column
 *        `verificationHash`, not embedded in the ID. The `publicCertificateId` is
 *        now a plain UUID — collision-free, no truncated HMAC contaminating it.
 *
 * Verification model:
 *   - Re-derive the HMAC from currently-stored DB data and compare with stored hash.
 *   - If any of studentId / trackId / completionDate / finalScore is changed in the DB,
 *     the hash won't match even if the UUID is intact → tamper evident.
 *
 * Backward compatibility:
 *   - Legacy IDs (YUKTII-YEAR-XX-XX) pass through without HMAC check.
 *   - Old Phase-7 IDs (UUID.XXXXXX) are detected and warned — they lack a separate
 *     verificationHash column entry so they can only be verified by DB lookup.
 */

import { randomUUID, createHmac, timingSafeEqual as nodeTimingSafeEqual } from 'crypto';

// ── Key management ────────────────────────────────────────────────────────────

function getHmacSecret(): string {
  const secret = process.env.CERT_HMAC_SECRET;
  if (!secret || secret.length < 16) {
    if (process.env.NODE_ENV !== 'production') {
      // Predictable dev-only fallback — harmless in dev, fatal in prod below
      return 'dev-only-cert-secret-not-for-production-use-at-all';
    }
    throw new Error(
      '[certificate-integrity] CERT_HMAC_SECRET must be at least 16 bytes in production. ' +
      'Generate one with: openssl rand -hex 32'
    );
  }
  return secret;
}

// ── Certificate payload type ──────────────────────────────────────────────────

export interface CertificatePayload {
  studentId:      string;
  trackId:        string;
  completionDate: string; // ISO 8601 date string, e.g. "2026-09-25"
  finalScore:     number;
}

// ── Generation ────────────────────────────────────────────────────────────────

/**
 * Generate a UUID certificate ID + a full-length HMAC-SHA256 verification hash.
 *
 * The verification hash is stored separately in `Certificate.verificationHash`.
 * The publicCertificateId is a plain UUID — the hash is NOT embedded in it.
 *
 * @returns { publicCertificateId, verificationHash }
 */
export function generateCertificate(data: CertificatePayload): {
  publicCertificateId: string;
  verificationHash:    string;
} {
  const publicCertificateId = randomUUID();
  const verificationHash    = computeHash(data);
  return { publicCertificateId, verificationHash };
}

/**
 * Compute the HMAC-SHA256 of the certificate payload.
 * Canonical format: "studentId|trackId|completionDate|finalScore"
 * The pipe separator is safe because none of these fields contain pipes.
 */
function computeHash(data: CertificatePayload): string {
  const secret  = getHmacSecret();
  const payload = `${data.studentId}|${data.trackId}|${data.completionDate}|${data.finalScore}`;
  return createHmac('sha256', secret).update(payload).digest('hex'); // 64-char hex, full length
}

// ── Verification ──────────────────────────────────────────────────────────────

/**
 * Re-derive the HMAC from currently stored DB values and compare to the stored hash.
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 *
 * @param storedData - The four data fields currently stored in the DB
 * @param storedHash - The verificationHash column from the DB
 * @returns true if the hash matches; false if tampered or key mismatch
 */
export function verifyCertificate(
  storedData: CertificatePayload,
  storedHash: string
): boolean {
  try {
    const expected = computeHash(storedData);
    // Both buffers must be the same length for timingSafeEqual
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (a.length !== b.length) return false;
    return nodeTimingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ── Legacy ID detection ───────────────────────────────────────────────────────

/**
 * Legacy certificate IDs issued before Phase 7 — YUKTII-YEAR-XX-XX format.
 * These don't have a verificationHash and are checked by DB lookup only.
 */
export function isLegacyCertificateId(certId: string): boolean {
  return /^YUKTII-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(certId);
}

/**
 * Phase 7 (old) IDs: UUID.XXXXXX format with embedded 6-char HMAC.
 * These have a verificationHash column if migrated, otherwise rely on DB lookup.
 */
export function isOldHybridId(certId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-F0-9]{6}$/.test(certId);
}

/**
 * A-3 (current) IDs: plain UUID v4.
 */
export function isCurrentFormatId(certId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(certId);
}
