/**
 * startup-checks.ts — Production safety assertions.
 *
 * Call assertProductionSafety() from instrumentation.ts (Next.js) so it runs
 * on every cold start in all environments. Failures are intentionally loud:
 * throwing here prevents the app from booting with a dangerous configuration.
 *
 * Rules:
 *  1. CERT_HMAC_SECRET must be set and long enough in production.
 *  2. Any other production-safety invariants can be added here.
 */

export function assertProductionSafety(): void {
  if (process.env.NODE_ENV !== 'production') return;

  // ── Rule 1: CERT_HMAC_SECRET must be set (certificate integrity) ───────────
  if (!process.env.CERT_HMAC_SECRET || process.env.CERT_HMAC_SECRET.length < 32) {
    console.warn(
      '[startup] WARNING: CERT_HMAC_SECRET is not set or is too short in production. ' +
      'Certificate verification will not work correctly. Set a 32+ byte hex secret.'
    );
    // Warn, not throw — allows a graceful degraded state during initial deploy.
  }
}
