/**
 * instrumentation.ts — Next.js server instrumentation hook.
 *
 * This file is called by Next.js once when the server starts up (both in
 * dev and production). Use it for startup safety checks that must run before
 * any request is served.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run server-side — this file is bundled for both edge and node runtimes.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertProductionSafety } = await import('./lib/startup-checks');
    assertProductionSafety();
  }
}
