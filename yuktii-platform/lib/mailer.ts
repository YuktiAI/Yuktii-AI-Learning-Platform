import { Resend } from 'resend';
import nodemailer from 'nodemailer';

/**
 * Mailer Client — Resend (primary) + SMTP (fallback)
 *
 * Supported environments:
 * 1. Resend (HTTP API, serverless-safe):
 *    RESEND_API_KEY — e.g. re_...
 *    RESEND_FROM    — e.g. "Yuktii AI Labs <noreply@yuktiiai.in>"
 * 2. SMTP (GoDaddy / Custom SMTP):
 *    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */

export interface MailAttachment {
  filename: string;
  content?: Buffer | string;
  path?: string;
  contentType?: string;
}

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
}

export async function sendMail(opts: MailOptions): Promise<{ success: boolean; error?: string }> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  const toList = Array.isArray(opts.to) ? opts.to : [opts.to];
  const errors: string[] = [];

  // ── Strategy 1: Resend (Recommended for Vercel Serverless) ────────────────
  if (resendApiKey) {
    try {
      const resend = new Resend(resendApiKey);
      const from = process.env.RESEND_FROM || process.env.EMAIL_FROM || 'Yuktii AI Labs <onboarding@resend.dev>';
      const attachments = opts.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
        path: att.path,
      }));

      const response = await resend.emails.send({
        from,
        to: toList,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        attachments,
      });

      if (response.error) {
        const errorDetail = `[Resend Error ${response.error.name || ''}]: ${response.error.message}`;
        console.error('[mailer] Resend failed:', errorDetail, response.error);
        errors.push(errorDetail);
      } else {
        console.log(`[mailer] Email sent successfully via Resend to ${toList.join(', ')} (id: ${response.data?.id})`);
        return { success: true };
      }
    } catch (err: any) {
      const msg = `[Resend Exception]: ${err?.message || String(err)}`;
      console.error('[mailer] Resend threw exception:', msg, err);
      errors.push(msg);
    }
  }

  // ── Strategy 2: SMTP / Nodemailer (Fallback or Local Dev) ──────────────────
  if (smtpHost && smtpUser && smtpPass) {
    try {
      const port = parseInt(process.env.SMTP_PORT || '465', 10);
      const isSecure = port === 465;

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure: isSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        tls: {
          rejectUnauthorized: false,
        },
      });

      const from = process.env.SMTP_FROM || `Yuktii AI Labs <${smtpUser}>`;
      const info = await transporter.sendMail({
        from,
        to: toList.join(', '),
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        attachments: opts.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
          path: att.path,
          contentType: att.contentType,
        })),
      });

      console.log(`[mailer] Email sent successfully via SMTP (${smtpHost}) to ${toList.join(', ')} (msgId: ${info.messageId})`);
      return { success: true };
    } catch (err: any) {
      const msg = `[SMTP Error]: ${err?.message || String(err)} (code: ${err?.code || 'UNKNOWN'})`;
      console.error('[mailer] SMTP failed:', msg, err);
      errors.push(msg);
    }
  }

  // ── Neither provider succeeded or configured ──────────────────────────────
  if (!resendApiKey && !(smtpHost && smtpUser && smtpPass)) {
    const unconfiguredMsg = 'No email credentials configured. Please set RESEND_API_KEY in Vercel or SMTP_* variables.';
    console.error(`[mailer] ${unconfiguredMsg}`);
    return { success: false, error: unconfiguredMsg };
  }

  const finalError = errors.join(' | ');
  console.error(`[mailer] All email delivery attempts failed: ${finalError}`);
  return { success: false, error: finalError };
}

/** Branded OTP email HTML */
export function otpEmailHtml(otp: string, purpose: 'signup' | 'forgot'): string {
  const heading  = purpose === 'signup' ? 'Verify your email' : 'Reset your password';
  const action   = purpose === 'signup' ? 'verify your email address' : 'reset your password';
  const appUrl   = (process.env.NEXT_PUBLIC_APP_URL || 'https://yuktii.vercel.app').replace(/\/$/, '');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#f5f6f3;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f3;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;border:1px solid #dfe1da;overflow:hidden;">

        <!-- Header with Yuktii AI Labs Logo -->
        <tr>
          <td style="background:#12162b;padding:24px 40px;text-align:center;">
            <a href="${appUrl}" target="_blank" style="text-decoration:none;display:inline-block;">
              <img src="${appUrl}/logo-full.png" alt="Yuktii AI Labs" width="200" style="display:inline-block;max-width:200px;height:auto;border:0;background:#ffffff;padding:6px 14px;border-radius:8px;" />
            </a>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#12162b;">${heading}</h1>
            <p style="margin:0 0 32px;font-size:15px;color:#555;line-height:1.6;">
              Use the code below to ${action}. It expires in <strong>10 minutes</strong>.
            </p>

            <!-- OTP box -->
            <div style="text-align:center;margin:0 0 32px;">
              <div style="display:inline-block;background:#f5f6f3;border:2px dashed #e8a33d;
                          border-radius:10px;padding:20px 48px;">
                <span style="font-size:42px;font-weight:800;letter-spacing:14px;
                             color:#12162b;font-family:'Courier New',monospace;">
                  ${otp}
                </span>
              </div>
            </div>

            <p style="margin:0;font-size:13px;color:#999;line-height:1.6;">
              If you didn't request this, you can safely ignore this email.<br/>
              Never share this code with anyone.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f5f6f3;padding:20px 40px;border-top:1px solid #dfe1da;">
            <p style="margin:0;font-size:12px;color:#aaa;">
              © ${new Date().getFullYear()} Yuktii AI Labs &nbsp;·&nbsp;
              Self-paced internship &amp; certification platform
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}
