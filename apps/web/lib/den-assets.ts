import { uploadChatFile } from "@/lib/upload-file";
import { getApiUrl } from "@/lib/api";

const MAX_ICON_BYTES = 512 * 1024;
const MAX_BANNER_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

/** Upload a den icon image and return a URL suitable for PATCH /api/v1/dens/:id. */
export async function uploadDenImage(file: File, denId: string): Promise<string> {
  return uploadDenAsset(file, denId, MAX_ICON_BYTES);
}

/** Upload a den banner image and return a URL suitable for PATCH /api/v1/dens/:id. */
export async function uploadDenBanner(file: File, denId: string): Promise<string> {
  return uploadDenAsset(file, denId, MAX_BANNER_BYTES);
}

async function uploadDenAsset(file: File, denId: string, maxBytes: number): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Image must be PNG, JPEG, WebP, or GIF");
  }
  if (file.size > maxBytes) {
    throw new Error(`Image must be ${Math.round(maxBytes / 1024)} KB or smaller`);
  }

  const uploaded = await uploadChatFile(file, { denId, purpose: "den-asset" });
  if (uploaded.publicUrl.startsWith("http")) {
    return uploaded.publicUrl;
  }
  return `${getApiUrl()}${uploaded.publicUrl}`;
}

/** Resolve a den icon/banner URL for use in img src. */
export function resolveDenAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${getApiUrl()}${url}`;
  return url;
}
