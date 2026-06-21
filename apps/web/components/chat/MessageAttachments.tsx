"use client";

import type { AttachmentDTO } from "@cubino/shared";
import { getApiUrl } from "@/lib/api";

function resolveAttachmentUrl(url: string): string {
  return url.startsWith("http") ? url : `${getApiUrl()}${url}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MessageAttachments({ attachments }: { attachments: AttachmentDTO[] }) {
  if (attachments.length === 0) return null;

  return (
    <div className="mt-1 flex flex-col gap-2">
      {attachments.map((file) => {
        const href = resolveAttachmentUrl(file.url);
        const isImage = file.mime.startsWith("image/");

        if (isImage) {
          return (
            <a
              key={file.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="block max-w-sm overflow-hidden rounded-den border border-white/[0.06] bg-den-surface/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={href}
                alt={file.filename}
                className="max-h-72 w-full object-contain"
                loading="lazy"
              />
            </a>
          );
        }

        return (
          <a
            key={file.id}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-sm items-center gap-2 rounded-den border border-white/[0.08] bg-den-surface/50 px-3 py-2 text-sm text-den-link hover:bg-den-elevated/80"
          >
            <span className="truncate font-medium">{file.filename}</span>
            <span className="shrink-0 text-xs text-den-muted">{formatFileSize(file.size)}</span>
          </a>
        );
      })}
    </div>
  );
}
