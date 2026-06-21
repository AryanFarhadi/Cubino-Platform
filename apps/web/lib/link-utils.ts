/** Extract the first http(s) URL from plain text or markdown. */
export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>[\]()]+[^\s<>[\]().,;:!?'")\]}]/i);
  return match?.[0] ?? null;
}

/** Returns a readable hostname or the raw URL on parse failure. */
export function urlHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
