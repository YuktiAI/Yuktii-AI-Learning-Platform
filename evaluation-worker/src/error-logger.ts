/**
 * error-logger.ts — Worker-side centralized error logger
 *
 * Mirrors lib/error-handler.ts for the evaluation-worker process.
 * Every pipeline stage failure routes through here:
 *   1. Logs full technical detail to ErrorLog DB table
 *   2. Fires admin alert email (throttled 1 per 5 min per service+code)
 *   3. Returns STUDENT_SAFE_ERROR for writing to evaluation.errorMessage
 *
 * Never exposes provider names, API error codes, or stack traces to students.
 */

import { getPrisma } from './db.js';
import nodemailer from 'nodemailer';
import { logger } from './logger.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const STUDENT_SAFE_ERROR =
  'Something went wrong on our end. Our team has been notified and is looking into it. Please try again in a few minutes.';

const ADMIN_ALERT_EMAILS = [
  'connect@yuktiiai.in',
  'sampathkumarna10@gmail.com',
  'nitishrhonnali@gmail.com',
];

const ALERT_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

// ── Types ─────────────────────────────────────────────────────────────────────

export type ErrorSeverity = 'critical' | 'transient';

export interface WorkerLogErrorOptions {
  service: string;
  error: unknown;
  context?: {
    evaluationId?: string;
    enrollmentId?: string;
    studentId?: string;
    [key: string]: unknown;
  };
  severityOverride?: ErrorSeverity;
}

// ── Severity Detection ────────────────────────────────────────────────────────

export function detectSeverity(error: unknown): ErrorSeverity {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const criticalPatterns = [
    'insufficient_quota', 'insufficient balance', 'exceeded your current quota',
    'billing', 'payment required', 'invalid api key', 'authentication failed',
    'account is not active', 'credit', 'service unavailable',
    'connection refused', 'econnrefused',
  ];
  const transientPatterns = [
    'rate_limit_exceeded', 'too many requests', '429', 'timeout',
    'etimedout', 'socket hang up', 'enotfound', 'econnreset',
    'context_length_exceeded',
  ];
  for (const p of criticalPatterns) if (msg.includes(p)) return 'critical';
  for (const p of transientPatterns) if (msg.includes(p)) return 'transient';
  return 'critical';
}

// ── HTML Escape ───────────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Email Alert ───────────────────────────────────────────────────────────────

async function sendAdminAlert(opts: {
  service: string;
  errorMessage: string;
  errorCode: string | null;
  stackTrace: string | null;
  context: Record<string, unknown>;
  severity: ErrorSeverity;
  alertCount: number;
  errorLogId: string;
}): Promise<void> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    logger.warn('Cannot send admin alert — SMTP not configured');
    return;
  }
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const from = process.env.SMTP_FROM || `"Yuktii AI Labs Alerts" <${user}>`;
  const isCritical = opts.severity === 'critical';
  const subjectPrefix = isCritical ? '🚨 CRITICAL ALERT [Worker]' : '⚠️  Error Alert [Worker]';
  const subject = `${subjectPrefix}: ${opts.service}${opts.alertCount > 1 ? ` [${opts.alertCount}× in 5 min]` : ''}`;

  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin-portal/error-logs`;
  const borderColor = isCritical ? '#ef4444' : '#f59e0b';
  const headerBg = isCritical ? '#ef4444' : '#f59e0b';
  const contextJson = JSON.stringify(opts.context, null, 2);
  const now = new Date();

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f5f6f3;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f3;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:2px solid ${borderColor};overflow:hidden;">
<tr><td style="background:${headerBg};padding:20px 32px;">
  <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">${escHtml(subjectPrefix)}</p>
  <p style="margin:4px 0 0;color:#fff;opacity:0.85;font-size:13px;">
    Yuktii AI Labs · Evaluation Worker · ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
  </p>
</td></tr>
<tr><td style="padding:28px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#374151;border-collapse:collapse;">
    <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700;width:160px;">Service</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-family:monospace;color:#dc2626;">${escHtml(opts.service)}</td></tr>
    <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700;">Severity</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;">
          <span style="background:${isCritical ? '#fee2e2' : '#fef3c7'};color:${isCritical ? '#dc2626' : '#92400e'};padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:700;">${opts.severity.toUpperCase()}</span>
        </td></tr>
    ${opts.alertCount > 1 ? `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;background:#fee2e2;font-weight:700;">Occurrences</td>
        <td style="padding:8px 12px;border:1px solid #fee2e2;color:#dc2626;font-weight:700;">${opts.alertCount} times in 5 min</td></tr>` : ''}
    <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700;">Error Log ID</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-family:monospace;font-size:11px;">${escHtml(opts.errorLogId)}</td></tr>
    ${opts.context.evaluationId ? `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700;">Evaluation ID</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-family:monospace;">${escHtml(String(opts.context.evaluationId))}</td></tr>` : ''}
    ${opts.context.enrollmentId ? `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700;">Enrollment ID</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-family:monospace;">${escHtml(String(opts.context.enrollmentId))}</td></tr>` : ''}
    ${opts.context.studentId ? `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700;">Student ID</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-family:monospace;">${escHtml(String(opts.context.studentId))}</td></tr>` : ''}
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
    <p style="margin:0;font-size:13px;color:#166534;"><strong>Admin Portal:</strong>
      <a href="${escHtml(portalUrl)}" style="color:#16a34a;">${escHtml(portalUrl)}</a>
    </p>
  </div>
</td></tr>
<tr><td style="background:#f5f6f3;padding:14px 32px;border-top:1px solid #e5e7eb;">
  <p style="margin:0;font-size:11px;color:#9ca3af;">&copy; ${now.getFullYear()} Yuktii AI Labs — Automated Error Alert · Do not reply</p>
</td></tr>
</table></td></tr></table></body></html>`;

  try {
    const transporter = nodemailer.createTransport({
      host, port, secure: port === 465, auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });
    await transporter.sendMail({ from, to: ADMIN_ALERT_EMAILS.join(', '), subject, html });
    logger.info('Admin alert sent', { service: opts.service, severity: opts.severity });
  } catch (mailErr) {
    logger.error('Failed to send admin alert', { err: String(mailErr) });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as Record<string, unknown>;
  const code = e.code ?? e.status ?? e.statusCode ?? e.type;
  if (code !== undefined) return String(code);
  return undefined;
}

function safeParseJson(str: string | null | undefined): Record<string, unknown> {
  if (!str) return {};
  try { return JSON.parse(str); } catch { return {}; }
}

// ── Core Function ─────────────────────────────────────────────────────────────

/**
 * Log a worker pipeline error:
 * 1. Writes ErrorLog to DB (shared with platform DB)
 * 2. Sends admin alert email (throttled)
 * 3. Returns STUDENT_SAFE_ERROR for evaluation.errorMessage
 */
export async function logWorkerError(opts: WorkerLogErrorOptions): Promise<string> {
  const { service, error, context = {}, severityOverride } = opts;

  const isError = error instanceof Error;
  const errorMessage = isError ? error.message : String(error);
  const stackTrace = isError && error.stack ? error.stack : null;
  const errorCode = extractErrorCode(error);
  const severity = severityOverride ?? detectSeverity(error);

  logger.error(`[error-logger] service="${service}" severity="${severity}" msg="${errorMessage.slice(0, 300)}"`, {
    context, stack: stackTrace?.slice(0, 500),
  });

  try {
    const prisma = getPrisma();
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

    let errorLogId: string;
    let alertCount = 1;
    let shouldSendAlert = false;

    if (existing) {
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

    if (shouldSendAlert) {
      await prisma.errorLog.update({
        where: { id: errorLogId },
        data: { alertSentAt: new Date() },
      });

      sendAdminAlert({
        service,
        errorMessage,
        errorCode: errorCode ?? null,
        stackTrace,
        context: { ...context, timestamp: new Date().toISOString() },
        severity,
        alertCount,
        errorLogId,
      }).catch((e) => logger.error('Alert email failed', { err: String(e) }));
    }
  } catch (dbErr) {
    logger.error('Failed to write ErrorLog to DB', { err: String(dbErr) });
  }

  return STUDENT_SAFE_ERROR;
}
