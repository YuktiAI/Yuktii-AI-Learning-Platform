/**
 * lib/cloud-storage.ts — Certificate PDF storage via AWS S3.
 *
 * Required env vars in .env.local:
 *   S3_BUCKET          — e.g. yuktii-certificates
 *   S3_REGION          — e.g. ap-south-1
 *   S3_ACCESS_KEY_ID   — IAM user with s3:PutObject on the bucket
 *   S3_SECRET_ACCESS_KEY
 *
 * Dev fallback: if S3 vars not set, returns base64 data URI stored in Certificate.pdfUrl.
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let _s3: S3Client | null = null;

function getS3Client(): S3Client | null {
  const region    = process.env.S3_REGION;
  const accessKey = process.env.S3_ACCESS_KEY_ID;
  const secretKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!region || !accessKey || !secretKey) return null;
  if (!_s3) {
    _s3 = new S3Client({
      region,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });
  }
  return _s3;
}

/**
 * Upload a certificate PDF buffer to S3.
 * Returns a permanent public S3 URL, or a base64 data URI if S3 not configured.
 * The returned URL is stored in Certificate.pdfUrl and served directly for downloads.
 */
export async function uploadCertificatePdf(
  buffer: Buffer,
  publicCertificateId: string,
): Promise<string> {
  const s3     = getS3Client();
  const bucket = process.env.S3_BUCKET;

  if (!s3 || !bucket) {
    console.warn("[cloud-storage] S3 not configured — falling back to base64 data URI in DB");
    const base64 = buffer.toString("base64");
    return `data:application/pdf;base64,${base64}`;
  }

  const key = `certificates/${publicCertificateId}.pdf`;

  await s3.send(
    new PutObjectCommand({
      Bucket:      bucket,
      Key:         key,
      Body:        buffer,
      ContentType: "application/pdf",
      // Public-read: URL is permanently accessible without signing.
      ACL:         "public-read",
    }),
  );

  const region = process.env.S3_REGION!;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}
