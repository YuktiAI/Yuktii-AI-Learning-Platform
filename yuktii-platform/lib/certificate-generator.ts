import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { uploadCertificatePdf } from "@/lib/cloud-storage";
import { logError } from "@/lib/error-handler";

export async function generateCertificatePdf(data: {
  studentName: string;
  domainName: string;
  trackLevel: string;
  durationDays: number;
  publicCertificateId: string;
  issueDate: Date;
}): Promise<Buffer> {
  // Create landscape A4 document (841.89 x 595.28 pt)
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([841.89, 595.28]);
  const { width, height } = page.getSize();

  // Load standard fonts
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const fontTimes = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  // Generate QR Code Buffer
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const verifyUrl = `${appUrl}/verify/${data.publicCertificateId}`;
  const qrPngBuffer = await QRCode.toBuffer(verifyUrl, {
    margin: 1,
    width: 120,
    color: { dark: "#12162B", light: "#FFFFFF" },
  });
  const qrImage = await pdfDoc.embedPng(qrPngBuffer);

  // ── Background & Borders ──
  // Outer background: warm parchment white
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: rgb(0.98, 0.98, 0.96),
  });

  // Outer gold/marigold border
  page.drawRectangle({
    x: 20,
    y: 20,
    width: width - 40,
    height: height - 40,
    borderColor: rgb(0.85, 0.65, 0.2), // Gold
    borderWidth: 3,
    color: rgb(1, 1, 1),
  });

  // Inner deep navy border
  page.drawRectangle({
    x: 26,
    y: 26,
    width: width - 52,
    height: height - 52,
    borderColor: rgb(0.08, 0.1, 0.2), // Deep Navy
    borderWidth: 1,
  });

  // Decorative corner accents
  const corners = [
    { x: 32, y: height - 44 },
    { x: width - 44, y: height - 44 },
    { x: 32, y: 32 },
    { x: width - 44, y: 32 },
  ];
  for (const c of corners) {
    page.drawRectangle({
      x: c.x,
      y: c.y,
      width: 12,
      height: 12,
      color: rgb(0.85, 0.65, 0.2),
    });
  }

  // ── Header Text ──
  // YUKTII AI LABS
  const orgTitle = "YUKTII AI LABS";
  const orgTitleWidth = fontBold.widthOfTextAtSize(orgTitle, 22);
  page.drawText(orgTitle, {
    x: (width - orgTitleWidth) / 2,
    y: height - 75,
    size: 22,
    font: fontBold,
    color: rgb(0.08, 0.1, 0.2),
  });

  // Subtitle
  const subOrg = "ADVANCED AGENTIC LEARNING & EVALUATION PLATFORM";
  const subOrgWidth = fontRegular.widthOfTextAtSize(subOrg, 8);
  page.drawText(subOrg, {
    x: (width - subOrgWidth) / 2,
    y: height - 90,
    size: 8,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.55),
  });

  // CERTIFICATE OF COMPLETION
  const certHeader = "CERTIFICATE OF COMPLETION";
  const certHeaderWidth = fontTimes.widthOfTextAtSize(certHeader, 24);
  page.drawText(certHeader, {
    x: (width - certHeaderWidth) / 2,
    y: height - 130,
    size: 24,
    font: fontTimes,
    color: rgb(0.75, 0.55, 0.1),
  });

  // "This is proudly presented to"
  const presentText = "This is to certify that";
  const presentWidth = fontItalic.widthOfTextAtSize(presentText, 13);
  page.drawText(presentText, {
    x: (width - presentWidth) / 2,
    y: height - 170,
    size: 13,
    font: fontItalic,
    color: rgb(0.3, 0.3, 0.35),
  });

  // ── Student Name ──
  const studentName = data.studentName;
  const nameSize = studentName.length > 25 ? 26 : 30;
  const nameWidth = fontBold.widthOfTextAtSize(studentName, nameSize);
  page.drawText(studentName, {
    x: (width - nameWidth) / 2,
    y: height - 215,
    size: nameSize,
    font: fontBold,
    color: rgb(0.08, 0.1, 0.2),
  });

  // Underline below student name
  page.drawLine({
    start: { x: (width - Math.max(nameWidth, 280)) / 2 - 20, y: height - 225 },
    end:   { x: (width + Math.max(nameWidth, 280)) / 2 + 20, y: height - 225 },
    thickness: 1.5,
    color: rgb(0.85, 0.65, 0.2),
  });

  // ── Narrative / Track description ──
  const line1 = `has successfully completed the ${data.durationDays}-Day Project-Based Internship in`;
  const line1Width = fontRegular.widthOfTextAtSize(line1, 13);
  page.drawText(line1, {
    x: (width - line1Width) / 2,
    y: height - 260,
    size: 13,
    font: fontRegular,
    color: rgb(0.25, 0.25, 0.3),
  });

  // Domain & Track Level
  const domainTrack = `${data.domainName} (${data.trackLevel} Track)`;
  const domainTrackWidth = fontBold.widthOfTextAtSize(domainTrack, 18);
  page.drawText(domainTrack, {
    x: (width - domainTrackWidth) / 2,
    y: height - 290,
    size: 18,
    font: fontBold,
    color: rgb(0.08, 0.1, 0.2),
  });

  const line2 = "demonstrating rigorous technical execution, adherence to engineering standards,";
  const line2Width = fontRegular.widthOfTextAtSize(line2, 11);
  page.drawText(line2, {
    x: (width - line2Width) / 2,
    y: height - 320,
    size: 11,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.45),
  });

  const line3 = "and comprehensive problem-solving evaluated through the Yuktii AI Senior Mentor System.";
  const line3Width = fontRegular.widthOfTextAtSize(line3, 11);
  page.drawText(line3, {
    x: (width - line3Width) / 2,
    y: height - 336,
    size: 11,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.45),
  });

  // ── Bottom section: Verification QR Code, Signatures, Metadata ──

  // QR Code on bottom left
  page.drawImage(qrImage, {
    x: 65,
    y: 55,
    width: 75,
    height: 75,
  });

  page.drawText("Scan to verify", {
    x: 68,
    y: 45,
    size: 8,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.55),
  });

  // Certificate ID & Date in Center
  const dateFormatted = data.issueDate.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  page.drawText(`Certificate ID: ${data.publicCertificateId}`, {
    x: 230,
    y: 95,
    size: 10,
    font: fontBold,
    color: rgb(0.08, 0.1, 0.2),
  });

  page.drawText(`Issue Date: ${dateFormatted}`, {
    x: 230,
    y: 80,
    size: 9,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.45),
  });

  page.drawText(`Verify at: ${verifyUrl}`, {
    x: 230,
    y: 65,
    size: 8,
    font: fontRegular,
    color: rgb(0.3, 0.5, 0.8),
  });

  // Signatory on bottom right
  page.drawLine({
    start: { x: width - 240, y: 85 },
    end:   { x: width - 65,  y: 85 },
    thickness: 1,
    color: rgb(0.3, 0.3, 0.35),
  });

  const sigName = "Director of Academic Programs";
  const sigNameWidth = fontBold.widthOfTextAtSize(sigName, 10);
  page.drawText(sigName, {
    x: width - 240 + (175 - sigNameWidth) / 2,
    y: 70,
    size: 10,
    font: fontBold,
    color: rgb(0.08, 0.1, 0.2),
  });

  const sigOrg = "Yuktii AI Labs Credentials Board";
  const sigOrgWidth = fontRegular.widthOfTextAtSize(sigOrg, 8);
  page.drawText(sigOrg, {
    x: width - 240 + (175 - sigOrgWidth) / 2,
    y: 58,
    size: 8,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.55),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

export async function generateAndDeliverCertificate(
  evaluationId: string,
  enrollmentId: string
): Promise<{ certificateId: string; publicCertificateId: string } | null> {
  try {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
    });

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        student: true,
        track: { include: { domain: true } },
        certificate: true,
      },
    });

    if (!enrollment) {
      console.error(`[certificate] Enrollment ${enrollmentId} not found`);
      return null;
    }

    // Idempotency: if certificate already exists, return it
    if (enrollment.certificate) {
      return {
        certificateId: enrollment.certificate.id,
        publicCertificateId: enrollment.certificate.publicCertificateId,
      };
    }

    // Generate unique public certificate ID (e.g. YUKTII-2026-AB12-CD34)
    const year = new Date().getFullYear();
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    const randomHex2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const publicCertificateId = `YUKTII-${year}-${randomHex}-${randomHex2}`;
    const issueDate = new Date();

    // 1. Generate PDF
    const pdfBuffer = await generateCertificatePdf({
      studentName: enrollment.student.name,
      domainName: enrollment.track.domain.name,
      trackLevel: enrollment.track.levelName,
      durationDays: enrollment.track.duration,
      publicCertificateId,
      issueDate,
    });

    // 2. Upload PDF to S3 (falls back to base64 data URI in dev if S3 not configured)
    const pdfUrl = await uploadCertificatePdf(pdfBuffer, publicCertificateId);

    // 3. Create Certificate record & mark Enrollment COMPLETED
    const cert = await prisma.certificate.create({
      data: {
        enrollmentId,
        publicCertificateId,
        issueDate,
        pdfUrl,  // S3 URL or base64 data URI depending on config
      },
    });

    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    // 4. Send Email Delivery with Certificate PDF + Evaluation Score in body
    const finalScore = evaluation?.finalScore ?? 100;
    let mentorFeedback = "Excellent work demonstrating practical engineering competency.";
    if (evaluation?.mentorReport) {
      try {
        const parsedReport = JSON.parse(evaluation.mentorReport);
        if (parsedReport.reasoning) {
          mentorFeedback = parsedReport.reasoning;
        } else if (parsedReport.summary) {
          mentorFeedback = parsedReport.summary;
        }
      } catch {
        // ignore parse error
      }
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const profileUrl = `${appUrl}/dashboard/profile`;
    const verifyUrl = `${appUrl}/verify/${publicCertificateId}`;

    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Your Yuktii AI Labs Certificate</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a2e;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;border:1px solid #e2e4ea;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
          
          <!-- Header banner -->
          <tr>
            <td style="background:#12162b;padding:32px 40px;text-align:center;">
              <p style="margin:0;color:#e8a33d;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">Yuktii AI Labs</p>
              <p style="margin:6px 0 0;color:#8f95b2;font-size:13px;">Official Internship &amp; Credential Verification</p>
            </td>
          </tr>

          <!-- Main content -->
          <tr>
            <td style="padding:36px 40px;">
              <h1 style="margin:0 0 16px;font-size:22px;color:#12162b;">Congratulations, ${enrollment.student.name}! 🎓</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#4a4e69;line-height:1.6;">
                You have successfully completed the <strong>${enrollment.track.duration}-Day ${enrollment.track.certificateName}</strong> in <strong>${enrollment.track.domain.name}</strong>.
                Your official certificate has been issued and is attached to this email.
              </p>

              <!-- Evaluation Score Report Box -->
              <div style="background:#f8f9fc;border:1px solid #dce0ed;border-radius:10px;padding:22px 24px;margin-bottom:28px;">
                <h3 style="margin:0 0 12px;font-size:14px;color:#12162b;text-transform:uppercase;letter-spacing:0.05em;">📊 Official Senior Mentor Evaluation Report</h3>
                <div style="display:flex;align-items:baseline;margin-bottom:12px;">
                  <span style="font-size:32px;font-weight:bold;color:#059669;margin-right:8px;">${finalScore}</span>
                  <span style="font-size:16px;color:#6b7280;">/ 100 — <strong>PASSED</strong></span>
                </div>
                <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.5;">
                  <strong>Mentor Summary:</strong> ${mentorFeedback}
                </p>
              </div>

              <!-- Certificate Details Card -->
              <div style="background:#fff9eb;border:1px solid #fde68a;border-radius:10px;padding:18px 20px;margin-bottom:28px;">
                <p style="margin:0 0 8px;font-size:13px;color:#92400e;"><strong>Certificate ID:</strong> ${publicCertificateId}</p>
                <p style="margin:0 0 8px;font-size:13px;color:#92400e;"><strong>Issue Date:</strong> ${issueDate.toLocaleDateString("en-IN")}</p>
                <p style="margin:0;font-size:13px;color:#92400e;">
                  <strong>Online Verification:</strong> <a href="${verifyUrl}" style="color:#b45309;text-decoration:underline;">${verifyUrl}</a>
                </p>
              </div>

              <p style="margin:0 0 20px;font-size:14px;color:#4a4e69;line-height:1.6;">
                Your certificate is permanently available for download at any time from your student profile page.
              </p>

              <!-- CTA Button -->
              <div style="text-align:center;margin:32px 0 10px;">
                <a href="${profileUrl}" style="background:#12162b;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block;">
                  View &amp; Download in Profile →
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f4f5f8;padding:20px 40px;border-top:1px solid #e2e4ea;text-align:center;font-size:12px;color:#71758c;">
              Yuktii AI Labs · Bengaluru, India · Official Verifiable Credentials
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    // Send email and persist result to EmailLog regardless of outcome
    const mailResult = await sendMail({
      to: enrollment.student.email,
      subject: `🎓 Your Yuktii AI Labs Certificate is Ready — ${enrollment.track.certificateName}`,
      html: emailHtml,
      text: `Congratulations ${enrollment.student.name}! You scored ${finalScore}/100 and earned your ${enrollment.track.certificateName}. Your certificate ID is ${publicCertificateId}. View your profile at ${profileUrl}`,
      attachments: [
        {
          filename: `${enrollment.student.name.replace(/\s+/g, "_")}_Certificate_${publicCertificateId}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    // Persist to EmailLog for admin visibility (both success and failure)
    await prisma.emailLog.create({
      data: {
        enrollmentId,
        recipientEmail: enrollment.student.email,
        subject: `🎓 Your Yuktii AI Labs Certificate is Ready — ${enrollment.track.certificateName}`,
        status: mailResult.success ? "sent" : "failed",
        errorMessage: mailResult.success ? null : mailResult.error,
        smtpHost: process.env.SMTP_HOST ?? null,
      },
    });

    if (mailResult.success) {
      console.log(`[certificate] Certificate email sent to ${enrollment.student.email}`);
    } else {
      console.error(`[certificate] Certificate email FAILED to ${enrollment.student.email}: ${mailResult.error}`);
    }

    return {
      certificateId: cert.id,
      publicCertificateId,
    };
  } catch (err) {
    // Log to ErrorLog + fire admin alert email so this is never silently swallowed
    await logError({
      service: 'certificate-generation-s3-email',
      error: err,
      context: { evaluationId, enrollmentId },
    });
    return null;
  }
}

/**
 * Resend certificate email for a specific email log or enrollment.
 * Used by admin portal email-logs page.
 */
export async function resendCertificateEmail(
  logIdOrEnrollmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Try finding by EmailLog ID first, fallback to enrollmentId
    const emailLog = await prisma.emailLog.findUnique({
      where: { id: logIdOrEnrollmentId },
    });

    const enrollmentId = emailLog?.enrollmentId ?? logIdOrEnrollmentId;

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        student: true,
        track: { include: { domain: true } },
        certificate: true,
      },
    });

    if (!enrollment || !enrollment.certificate) {
      return { success: false, error: "Enrollment or certificate not found" };
    }

    const evaluation = await prisma.evaluation.findFirst({
      where: { enrollmentId: enrollment.id, status: "completed" },
      orderBy: { createdAt: "desc" },
    });

    const finalScore = evaluation?.finalScore ?? 100;
    let mentorFeedback = "Excellent work demonstrating practical engineering competency.";
    if (evaluation?.mentorReport) {
      try {
        const parsedReport = JSON.parse(evaluation.mentorReport);
        mentorFeedback = parsedReport.reasoning || parsedReport.summary || mentorFeedback;
      } catch {
        // ignore
      }
    }

    const publicCertificateId = enrollment.certificate.publicCertificateId;
    const issueDate = enrollment.certificate.issueDate;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const profileUrl = `${appUrl}/dashboard/profile`;
    const verifyUrl = `${appUrl}/verify/${publicCertificateId}`;

    const pdfBuffer = await generateCertificatePdf({
      studentName: enrollment.student.name,
      domainName: enrollment.track.domain.name,
      trackLevel: enrollment.track.levelName,
      durationDays: enrollment.track.duration,
      publicCertificateId,
      issueDate,
    });

    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Your Yuktii AI Labs Certificate</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a2e;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;border:1px solid #e2e4ea;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#12162b;padding:32px 40px;text-align:center;">
              <p style="margin:0;color:#e8a33d;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">Yuktii AI Labs</p>
              <p style="margin:6px 0 0;color:#8f95b2;font-size:13px;">Official Internship &amp; Credential Verification</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;">
              <h1 style="margin:0 0 16px;font-size:22px;color:#12162b;">Congratulations, ${enrollment.student.name}! 🎓</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#4a4e69;line-height:1.6;">
                You have successfully completed the <strong>${enrollment.track.duration}-Day ${enrollment.track.certificateName}</strong> in <strong>${enrollment.track.domain.name}</strong>.
                Your official certificate has been issued and is attached to this email.
              </p>
              <div style="background:#f8f9fc;border:1px solid #dce0ed;border-radius:10px;padding:22px 24px;margin-bottom:28px;">
                <h3 style="margin:0 0 12px;font-size:14px;color:#12162b;text-transform:uppercase;letter-spacing:0.05em;">📊 Official Senior Mentor Evaluation Report</h3>
                <div style="display:flex;align-items:baseline;margin-bottom:12px;">
                  <span style="font-size:32px;font-weight:bold;color:#059669;margin-right:8px;">${finalScore}</span>
                  <span style="font-size:16px;color:#6b7280;">/ 100 — <strong>PASSED</strong></span>
                </div>
                <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.5;">
                  <strong>Mentor Summary:</strong> ${mentorFeedback}
                </p>
              </div>
              <div style="background:#fff9eb;border:1px solid #fde68a;border-radius:10px;padding:18px 20px;margin-bottom:28px;">
                <p style="margin:0 0 8px;font-size:13px;color:#92400e;"><strong>Certificate ID:</strong> ${publicCertificateId}</p>
                <p style="margin:0 0 8px;font-size:13px;color:#92400e;"><strong>Issue Date:</strong> ${issueDate.toLocaleDateString("en-IN")}</p>
                <p style="margin:0;font-size:13px;color:#92400e;">
                  <strong>Online Verification:</strong> <a href="${verifyUrl}" style="color:#b45309;text-decoration:underline;">${verifyUrl}</a>
                </p>
              </div>
              <div style="text-align:center;margin:32px 0 10px;">
                <a href="${profileUrl}" style="background:#12162b;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block;">
                  View &amp; Download in Profile →
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#f4f5f8;padding:20px 40px;border-top:1px solid #e2e4ea;text-align:center;font-size:12px;color:#71758c;">
              Yuktii AI Labs · Bengaluru, India · Official Verifiable Credentials
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    const mailResult = await sendMail({
      to: enrollment.student.email,
      subject: `🎓 Your Yuktii AI Labs Certificate is Ready — ${enrollment.track.certificateName}`,
      html: emailHtml,
      text: `Congratulations ${enrollment.student.name}! You scored ${finalScore}/100 and earned your ${enrollment.track.certificateName}. Your certificate ID is ${publicCertificateId}. View your profile at ${profileUrl}`,
      attachments: [
        {
          filename: `${enrollment.student.name.replace(/\s+/g, "_")}_Certificate_${publicCertificateId}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    await prisma.emailLog.create({
      data: {
        enrollmentId: enrollment.id,
        recipientEmail: enrollment.student.email,
        subject: `🎓 (Resent) Certificate: ${enrollment.track.certificateName}`,
        status: mailResult.success ? "sent" : "failed",
        errorMessage: mailResult.success ? null : mailResult.error,
        smtpHost: process.env.SMTP_HOST ?? null,
      },
    });

    return mailResult;
  } catch (err: any) {
    await logError({
      service: 'certificate-resend-email',
      error: err,
      context: { logIdOrEnrollmentId },
    });
    return { success: false, error: 'Failed to resend certificate email.' };
  }
}
