/**
 * startup-checks.ts — Production safety assertions.
 *
 * Call assertProductionSafety() from instrumentation.ts (Next.js) so it runs
 * on every cold start in all environments. Failures are intentionally loud:
 * throwing here prevents the app from booting with a dangerous configuration.
 *
 * Rules:
 *  1. DISABLE_PAYMENT_GATEWAY must be explicitly set to "false" in production.
 *     Leaving it unset is treated as an unsafe default and will abort startup.
 *  2. Any other production-safety invariants can be added here.
 */

export function assertProductionSafety(): void {
  if (process.env.NODE_ENV !== 'production') return;

  // ── Rule 1: Payment gateway must never be disabled in production ────────────
  const payGw = process.env.DISABLE_PAYMENT_GATEWAY;
  if (payGw === 'true' || payGw === undefined || payGw === null || payGw === '') {
    throw new Error(
      '[FATAL] DISABLE_PAYMENT_GATEWAY is not explicitly set to "false" in production. ' +
      'Set DISABLE_PAYMENT_GATEWAY=false in your production environment variables. ' +
      'Leaving it unset or set to "true" allows students to bypass payment — this is a billing security risk.'
    );
  }

  // ── Rule 2: CERT_HMAC_SECRET must be set (Phase 7 — certificate integrity) ──
  if (!process.env.CERT_HMAC_SECRET || process.env.CERT_HMAC_SECRET.length < 32) {
    console.warn(
      '[startup] WARNING: CERT_HMAC_SECRET is not set or is too short in production. ' +
      'Certificate verification will not work correctly. Set a 32+ byte hex secret.'
    );
    // Warn, not throw — certificate signing is a Phase 7 feature not yet fully deployed.
  }
}
