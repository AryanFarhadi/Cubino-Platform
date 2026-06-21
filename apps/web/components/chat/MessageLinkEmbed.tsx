"use client";

import { extractFirstUrl, urlHostname } from "@/lib/link-utils";

export function MessageLinkEmbed({ content }: { content: string }) {
  const url = extractFirstUrl(content);
  if (!url) return null;

  const hostname = urlHostname(url);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block max-w-md rounded-den border border-white/10 bg-den-elevated/70 p-3 transition-colors hover:border-den-link/40 hover:bg-den-elevated"
      aria-label={`Open link to ${hostname}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-den-muted">
        {hostname}
      </p>
      <p className="mt-0.5 truncate text-xs text-den-link">{url}</p>
    </a>
  );
}
