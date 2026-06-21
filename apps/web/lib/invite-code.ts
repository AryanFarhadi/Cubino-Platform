/** Parse invite code from raw paste (code, URL, or full invite message). */
export function parseInviteCode(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const fromUrl = trimmed.match(/[?&]code=([A-Za-z0-9_-]+)/i);
  if (fromUrl) return fromUrl[1];

  const fromLabel = trimmed.match(/(?:^|\n)\s*code:\s*([A-Za-z0-9_-]+)/i);
  if (fromLabel) return fromLabel[1];

  // Single token or last line when pasting multi-line invite text
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] ?? trimmed;
  if (/^[A-Za-z0-9_-]{4,32}$/.test(last)) return last;

  return trimmed.replace(/\s+/g, "");
}
