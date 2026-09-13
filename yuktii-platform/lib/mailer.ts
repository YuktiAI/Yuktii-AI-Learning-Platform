import nodemailer from 'nodemailer';

/**
 * Generic SMTP mailer — works with any provider (cPanel, Google Workspace, Zoho, etc.)
 *
 * Required env vars in .env.local:
 *   SMTP_HOST     — e.g. mail.yuktiiai.in  OR  smtp.gmail.com  OR  smtp.zoho.com
 *   SMTP_PORT     — usually 587 (TLS) or 465 (SSL)
 *   SMTP_USER     — full email address, e.g. connect@yuktiiai.in
 *   SMTP_PASS     — email account password (or app password)
 *   SMTP_FROM     — display address, e.g. "Yuktii AI Labs <connect@yuktiiai.in>"
 */

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP_HOST, SMTP_USER, and SMTP_PASS must be set in .env.local');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,        // true for 465 (SSL), false for 587 (STARTTLS)
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false, // allows self-signed certs (common on shared hosting)
    },
  });
}

export interface MailAttachment {
  filename: string;
  content?: Buffer | string;
  path?: string;
  contentType?: string;
}

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
}

export async function sendMail(opts: MailOptions): Promise<{ success: boolean; error?: string }> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    const msg = '[mailer] SMTP_HOST, SMTP_USER, SMTP_PASS must be set in .env.local — email not sent';
    console.error(msg);
    return { success: false, error: msg };
  }

  try {
    const transporter = createTransporter();
    const from = process.env.SMTP_FROM || `"Yuktii AI Labs" <${user}>`;
    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      attachments: opts.attachments,
    });
    return { success: true };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('[mailer] sendMail failed:', msg);
    return { success: false, error: msg };
  }
}

/** Branded OTP email HTML */
export function otpEmailHtml(otp: string, purpose: 'signup' | 'forgot'): string {
  const heading  = purpose === 'signup' ? 'Verify your email' : 'Reset your password';
  const action   = purpose === 'signup' ? 'verify your email address' : 'reset your password';

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

        <!-- Header -->
        <tr>
          <td style="background:#12162b;padding:28px 40px;">
            <p style="margin:0;color:#e8a33d;font-size:20px;font-weight:700;letter-spacing:-0.3px;">
              Yuktii AI Labs
            </p>
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
