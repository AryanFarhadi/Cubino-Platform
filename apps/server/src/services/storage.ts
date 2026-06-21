import crypto from "crypto";

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT ?? "http://localhost:9000";
const MINIO_BUCKET = process.env.MINIO_BUCKET ?? "cubino";
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY ?? "cubino";
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY ?? "cubino123";

export function isStorageConfigured() {
  return Boolean(process.env.MINIO_ENDPOINT || process.env.MINIO_ACCESS_KEY);
}

export async function presignUpload(key: string, mime: string, expiresSec = 3600) {
  const expires = Math.floor(Date.now() / 1000) + expiresSec;
  const resource = `/${MINIO_BUCKET}/${key}`;
  const stringToSign = `PUT\n\n${mime}\n${expires}\n${resource}`;
  const signature = crypto
    .createHmac("sha1", MINIO_SECRET_KEY)
    .update(stringToSign)
    .digest("base64");
  const url = `${MINIO_ENDPOINT}${resource}?AWSAccessKeyId=${encodeURIComponent(MINIO_ACCESS_KEY)}&Expires=${expires}&Signature=${encodeURIComponent(signature)}`;
  return { url, publicUrl: `${MINIO_ENDPOINT}/${MINIO_BUCKET}/${key}` };
}

export function uploadKey(userId: string, filename: string) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `uploads/${userId}/${Date.now()}-${safe}`;
}
