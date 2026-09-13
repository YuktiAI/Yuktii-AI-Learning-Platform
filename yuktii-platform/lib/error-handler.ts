/**
 * lib/error-handler.ts — Centralized Error Handling Utility
 *
 * CORE RULE (enforced here, platform-wide):
 *   Students NEVER see internal error details — no provider names, API codes,
 *   stack traces, rate-limit messages, or any internal state.
 *   Admins get EVERYTHING: service name, raw error, context, stack trace, severity.
 *
 * Usage:
 *   In Next.js API routes:  return await wrapApiRoute(handler, { service: 'groq-project-generation' });
 *   In background jobs:     await logError({ service: 'claude-evaluation', error, context: { evaluationId } });
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import nodemailer from 'nodemailer';

// ── Constants ─────────────────────────────────────────────────────────────────

/** The ONE message students ever see for any internal failure. */
export const STUDENT_SAFE_ERROR =
  'Something went wrong on our end. Our team has been notified and is looking into it. Please try again in a few minutes.';

/** Admin addresses that receive ALL error alerts. */
const ADMIN_ALERT_EMAILS = [
  'connect@yuktiiai.in',
  'sampathkumarna10@gmail.com',
  'nitishrhonnali@gmail.com',
];

/** Throttle window: one alert per (service + errorCode) per this many ms. */
const ALERT_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

// ── Types ─────────────────────────────────────────────────────────────────────

export type ErrorSeverity = 'critical' | 'transient';

export interface LogErrorOptions {
  /** Which integration failed, e.g. "groq-project-generation", "claude-evaluation", "e2b-sandbox" */
  service: string;
  /** The raw Error object or any thrown value */
  error: unknown;
  /** Additional context — student/enrollment IDs, model used, etc. */
  context?: {
    studentId?: string;
    enrollmentId?: string;
    evaluationId?: string;
    [key: string]: unknown;
  };
  /** Override auto-detected severity */
  severityOverride?: ErrorSeverity;
}

export interface LogErrorResult {
  studentMessage: string;
  errorLogId: string | null;
  severity: ErrorSeverity;
}

// ── Severity Detection ────────────────────────────────────────────────────────

/**
 * Auto-detects whether an error is critical (needs immediate human action)
 * or transient (may self-recover on retry).
 */
export function detectSeverity(error: unknown): ErrorSeverity {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();

  const criticalPatterns = [
    'insufficient_quota', 'insufficient balance', 'exceeded your current quota',
    'billing', 'payment required', 'invalid api key', 'api key not found',
    'authentication failed', 'account is not active', 'credit',
    'service unavailable', 'connection refused', 'econnrefused',
  ];
  const transientPatterns = [
    'rate_limit_exceeded', 'too many requests', '429', 'timeout',
    'etimedout', 'socket hang up', 'enotfound', 'econnreset',
    'context_length_exceeded',
  ];

  for (const p of criticalPatterns) if (msg.includes(p)) return 'critical';
  for (const p of transientPatterns) if (msg.includes(p)) return 'transient';
  return 'critical'; // unknown → alert immediately
}

// ── HTML Escape ───────────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Email Alert ───────────────────────────────────────────────────────────────

async function sendAdminAlertEmail(opts: {
  service: string;
  errorMessage: string;
  errorCode: string | null;
  stackTrace: string | null;
  context: Record<string, unknown>;
  severity: ErrorSeverity;
  alertCount: number;
  errorLogId: string;
  timestamp: Date;
}): Promise<void> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.error('[error-handler] Cannot send admin alert — SMTP not configured');
    return;
  }

  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const from = process.env.SMTP_FROM || `"Yuktii AI Labs Alerts" <${user}>`;
  const isCritical = opts.severity === 'critical';
  const subjectPrefix = isCritical ? '🚨 CRITICAL ALERT' : '⚠️  Error Alert';
  const subject = `${subjectPrefix}: ${opts.service}${opts.alertCount > 1 ? ` [${opts.alertCount}× in 5 min]` : ''}`;

  const contextJson = JSON.stringify(opts.context, null, 2);
  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin-portal/error-logs`;
  const borderColor = isCritical ? '#ef4444' : '#f59e0b';
  const headerBg = isCritical ? '#ef4444' : '#f59e0b';

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>${escHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f6f3;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f3;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:2px solid ${borderColor};overflow:hidden;">
<tr><td style="background:${headerBg};padding:20px 32px;">
  <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">${escHtml(subjectPrefix)}</p>
  <p style="margin:4px 0 0;color:#fff;opacity:0.85;font-size:13px;">
    Yuktii AI Labs &nbsp;·&nbsp; ${opts.timestamp.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
  </p>
</td></tr>
<tr><td style="padding:28px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#374151;border-collapse:collapse;">
    <tr>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700;width:160px;">Service</td>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;font-family:monospace;color:#dc2626;">${escHtml(opts.service)}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700;">Severity</td>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;">
        <span style="background:${isCritical ? '#fee2e2' : '#fef3c7'};color:${isCritical ? '#dc2626' : '#92400e'};padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:700;">${opts.severity.toUpperCase()}</span>
      </td>
    </tr>
    ${opts.alertCount > 1 ? `<tr>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#fee2e2;font-weight:700;">Occurrences</td>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#fee2e2;color:#dc2626;font-weight:700;">${opts.alertCount} times in 5 min — throttled to 1 alert</td>
    </tr>` : ''}
    <tr>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700;">Error Log ID</td>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;font-family:monospace;font-size:11px;">${escHtml(opts.errorLogId)}</td>
    </tr>
    ${opts.errorCode ? `<tr>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700;">Error Code</td>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;font-family:monospace;">${escHtml(opts.errorCode)}</td>
    </tr>` : ''}
    ${opts.context.studentId ? `<tr>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700;">Student ID</td>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;font-family:monospace;">${escHtml(String(opts.context.studentId))}</td>
    </tr>` : ''}
    ${opts.context.enrollmentId ? `<tr>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700;">Enrollment ID</td>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;font-family:monospace;">${escHtml(String(opts.context.enrollmentId))}</td>
    </tr>` : ''}
    ${opts.context.evaluationId ? `<tr>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700;">Evaluation ID</td>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;font-family:monospace;">${escHtml(String(opts.context.evaluationId))}</td>
    </tr>` : ''}
  </table>
  <div style="margin-top:20px;">
    <p style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Error Message</p>
    <pre style="background:#fee2e2;border:1px solid #fca5a5;border-radius:6px;padding:14px;font-size:12px;color:#991b1b;white-space:pre-wrap;word-break:break-all;margin:0;">${escHtml(opts.errorMessage)}</pre>
  </div>
  <div style="margin-top:16px;">
    <p style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Context</p>
    <pre style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:14px;font-size:12px;color:#374151;white-space:pre-wrap;word-break:break-all;margin:0;">${escHtml(contextJson)}</pre>
  </div>
  ${opts.stackTrace ? `<div style="margin-top:16px;">
    <p style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Stack Trace</p>
    <pre style="background:#1e1e2e;border-radius:6px;padding:14px;font-size:11px;color:#cdd6f4;white-space:pre-wrap;word-break:break-all;margin:0;">${escHtml(opts.stackTrace.slice(0, 3000))}</pre>
  </div>` : ''}
  <div style="margin-top:24px;padding:14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
    <p style="margin:0;font-size:13px;color:#166534;">
      <strong>View &amp; resolve in Admin Portal:</strong>
      <a href="${escHtml(portalUrl)}" style="color:#16a34a;">${escHtml(portalUrl)}</a>
    </p>
  </div>
</td></tr>
<tr><td style="background:#f5f6f3;padding:14px 32px;border-top:1px solid #e5e7eb;">
  <p style="margin:0;font-size:11px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Yuktii AI Labs — Automated Error Alert &nbsp;&middot;&nbsp; Do not reply</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  try {
    const transporter = nodemailer.createTransport({
      host, port, secure: port === 465, auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });
    await transporter.sendMail({ from, to: ADMIN_ALERT_EMAILS.join(', '), subject, html });
    console.log(`[error-handler] Admin alert sent to ${ADMIN_ALERT_EMAILS.length} addresses — service="${opts.service}" severity="${opts.severity}"`);
  } catch (mailErr) {
    console.error('[error-handler] Failed to send admin alert email:', mailErr);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as Record<string, unknown>;
  const code = e.code ?? e.status ?? e.statusCode ?? e.type ?? e.error_code;
  if (code !== undefined) return String(code);
  const msg = typeof e.message === 'string' ? e.message : '';
  const match = msg.match(/\b(4\d\d|5\d\d)\b/);
  return match ? match[1] : undefined;
}

function safeParseJson(str: string | null | undefined): Record<string, unknown> {
  if (!str) return {};
  try { return JSON.parse(str); } catch { return {}; }
}

// ── Core logError Function ────────────────────────────────────────────────────

/**
 * The single entrypoint for ALL internal failures.
 *
 * 1. Extracts full error detail
 * 2. Auto-detects severity (critical vs transient)
 * 3. Writes/updates an ErrorLog row in DB (for throttling + admin portal visibility)
 * 4. Sends admin alert email with full detail (throttled: max 1 per 5 min per service+code)
 * 5. Returns student-safe generic message — always the same string
 */
export async function logError(opts: LogErrorOptions): Promise<LogErrorResult> {
  const { service, error, context = {}, severityOverride } = opts;

  const isError = error instanceof Error;
  const errorMessage = isError ? error.message : String(error);
  const stackTrace = isError && error.stack ? error.stack : null;
  const errorCode = extractErrorCode(error);
  const severity = severityOverride ?? detectSeverity(error);

  // Always console.error immediately — visible in server logs regardless of DB state
  console.error(
    `[error-handler] service="${service}" severity="${severity}" code="${errorCode ?? 'none'}" msg="${errorMessage.slice(0, 300)}"`,
    { context, stack: stackTrace?.slice(0, 500) }
  );

  let errorLogId: string | null = null;
  let shouldSendAlert = false;
  let alertCount = 1;

  try {
    const throttleWindow = new Date(Date.now() - ALERT_THROTTLE_MS);
    const existing = await prisma.errorLog.findFirst({
      where: {
        service,
        errorCode: errorCode ?? null,
        resolvedAt: null,
        alertSentAt: { gte: throttleWindow },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      // Same error pattern alerted recently — increment count, suppress email
      const updated = await prisma.errorLog.update({
        where: { id: existing.id },
        data: {
          alertCount: { increment: 1 },
          context: JSON.stringify({
            ...safeParseJson(existing.context),
            ...context,
            latestOccurrence: new Date().toISOString(),
          }),
        },
      });
      errorLogId = updated.id;
      alertCount = updated.alertCount;
      shouldSendAlert = false;
    } else {
      // New error pattern or throttle window elapsed
      const log = await prisma.errorLog.create({
        data: {
          service,
          errorMessage: errorMessage.slice(0, 5000),
          errorCode: errorCode?.slice(0, 200) ?? null,
          stackTrace: stackTrace?.slice(0, 10000) ?? null,
          context: Object.keys(context).length > 0 ? JSON.stringify(context) : null,
          studentId:    context.studentId    as string | undefined,
          enrollmentId: context.enrollmentId as string | undefined,
          evaluationId: context.evaluationId as string | undefined,
          severity,
          alertCount: 1,
        },
      });
      errorLogId = log.id;
      shouldSendAlert = true;
    }

    if (shouldSendAlert && errorLogId) {
      // Stamp alertSentAt before sending to prevent concurrent-request race
      await prisma.errorLog.update({
        where: { id: errorLogId },
        data: { alertSentAt: new Date() },
      });

      // Fire-and-forget — never block route response on email
      sendAdminAlertEmail({
        service,
        errorMessage,
        errorCode: errorCode ?? null,
        stackTrace,
        context: { ...context, timestamp: new Date().toISOString() },
        severity,
        alertCount,
        errorLogId,
        timestamp: new Date(),
      }).catch((e) => console.error('[error-handler] Alert email fire-and-forget failed:', e));
    }
  } catch (dbErr) {
    // If DB itself is down, just console.error — never let error logging crash the app
    console.error('[error-handler] Failed to write ErrorLog to DB:', dbErr);
  }

  return { studentMessage: STUDENT_SAFE_ERROR, errorLogId, severity };
}

// ── Route Wrapper ─────────────────────────────────────────────────────────────

/**
 * Wraps a Next.js API route handler with centralized error handling.
 * Any unhandled throw inside handler() is caught, logged, alerted, and
 * replaced with the generic student-safe error response.
 *
 * Example:
 *   export async function POST(req: NextRequest) {
 *     return wrapApiRoute(async () => {
 *       // ... your route logic ...
 *       return NextResponse.json({ ok: true });
 *     }, { service: 'groq-project-generation', req });
 *   }
 */
export async function wrapApiRoute(
  handler: () => Promise<NextResponse>,
  opts: {
    service: string;
    req?: NextRequest;
    studentId?: string;
    enrollmentId?: string;
    evaluationId?: string;
    context?: Record<string, unknown>;
  }
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    const { studentMessage } = await logError({
      service: opts.service,
      error,
      context: {
        ...(opts.context ?? {}),
        ...(opts.studentId    ? { studentId: opts.studentId }       : {}),
        ...(opts.enrollmentId ? { enrollmentId: opts.enrollmentId } : {}),
        ...(opts.evaluationId ? { evaluationId: opts.evaluationId } : {}),
        ...(opts.req ? { path: opts.req.nextUrl.pathname, method: opts.req.method } : {}),
      },
    });
    return NextResponse.json({ error: studentMessage }, { status: 500 });
  }
}

/**
 * Worker-side wrapper for BullMQ pipeline stages.
 * Returns the student-safe message so it can be set as evaluation.errorMessage.
 */
export async function logWorkerError(opts: LogErrorOptions): Promise<string> {
  const result = await logError(opts);
  return result.studentMessage;
}
