import { Resend } from 'resend';

/**
 * Resend Email Client
 *
 * Required env vars:
 *   RESEND_API_KEY — Resend API key (e.g. re_123456789)
 *   RESEND_FROM    — Optional from address (e.g. "Yuktii AI Labs <notifications@yuktiiai.in>",
 *                    defaults to "Yuktii AI Labs <onboarding@resend.dev>" in dev/testing)
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
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    const msg = '[mailer] RESEND_API_KEY is not set in environment — email not sent';
    console.warn(msg);
    return { success: false, error: msg };
  }

  try {
    const resend = new Resend(apiKey);
    const from = process.env.RESEND_FROM || process.env.EMAIL_FROM || 'Yuktii AI Labs <onboarding@resend.dev>';
    const to = Array.isArray(opts.to) ? opts.to : [opts.to];

    const attachments = opts.attachments?.map((att) => ({
      filename: att.filename,
      content: att.content,
      path: att.path,
    }));

    const response = await resend.emails.send({
      from,
      to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      attachments,
    });

    if (response.error) {
      console.error('[mailer] Resend API error:', response.error);
      return { success: false, error: response.error.message };
    }

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
