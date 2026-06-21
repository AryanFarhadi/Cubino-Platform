import { api, getAccessToken, getApiUrl } from "@/lib/api";

const MAX_BYTES = 25 * 1024 * 1024;

/** Must match server `MAX_ATTACHMENTS` in apps/server/src/services/attachments.ts */
export const MAX_MESSAGE_ATTACHMENTS = 5;

export interface UploadedFile {
  publicUrl: string;
  key: string;
  absoluteUrl: string;
}

/** Payload sent with message:send / dm:send for structured attachments. */
export interface MessageAttachmentInput {
  url: string;
  mime: string;
  size: number;
  filename: string;
}

export function toAttachmentInput(file: File, uploaded: UploadedFile): MessageAttachmentInput {
  return {
    url: uploaded.publicUrl,
    mime: file.type || "application/octet-stream",
    size: file.size,
    filename: file.name,
  };
}

interface PresignResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  local?: boolean;
}

/** Upload a file via presigned URL (local dev storage or MinIO). */
export async function uploadChatFile(
  file: File,
  opts: {
    channelId?: string;
    dmId?: string;
    denId?: string;
    purpose?: "message" | "den-asset" | "avatar";
    onProgress?: (loaded: number, total: number) => void;
  } = {}
): Promise<UploadedFile> {
  if (file.size > MAX_BYTES) {
    throw new Error("File must be 25 MB or smaller");
  }

  const presign = await api<PresignResponse>("/api/v1/uploads/presign", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
      channelId: opts.channelId,
      dmId: opts.dmId,
      denId: opts.denId,
      purpose: opts.purpose ?? "message",
    }),
  });

  const token = getAccessToken();
  const uploadTarget = presign.local
    ? `${getApiUrl()}${presign.uploadUrl}`
    : presign.uploadUrl;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadTarget);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && opts.onProgress) {
        opts.onProgress(event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      try {
        const err = JSON.parse(xhr.responseText) as { error?: string };
        reject(new Error(err.error ?? xhr.statusText));
      } catch {
        reject(new Error(xhr.statusText || "Upload failed"));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });

  const absoluteUrl = presign.publicUrl.startsWith("http")
    ? presign.publicUrl
    : `${getApiUrl()}${presign.publicUrl}`;

  return { publicUrl: presign.publicUrl, key: presign.key, absoluteUrl };
}

/** Markdown snippet for embedding an uploaded file in a message. */
export function attachmentMarkdown(file: File, absoluteUrl: string): string {
  if (file.type.startsWith("image/")) {
    return `![${file.name}](${absoluteUrl})`;
  }
  return `[${file.name}](${absoluteUrl})`;
}
