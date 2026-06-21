import { uploadChatFile } from "@/lib/upload-file";
import { getApiUrl } from "@/lib/api";

const MAX_AVATAR_BYTES = 512 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

/** Upload a profile avatar and return a URL suitable for PATCH /api/v1/users/me. */
export async function uploadUserAvatar(file: File): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Avatar must be PNG, JPEG, WebP, or GIF");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("Avatar must be 512 KB or smaller");
  }

  const uploaded = await uploadChatFile(file, { purpose: "avatar" });
  if (uploaded.publicUrl.startsWith("http")) {
    return uploaded.publicUrl;
  }
  return uploaded.publicUrl;
}

/** Normalize avatar URL for img src (handles relative /uploads paths). */
export function resolveUserAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${getApiUrl()}${url}`;
  return url;
}
