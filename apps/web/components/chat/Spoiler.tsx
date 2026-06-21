"use client";

import { useState } from "react";

export function Spoiler({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      className={`mx-0.5 inline rounded px-1 transition-colors ${
        revealed
          ? "bg-den-elevated text-den-cream"
          : "cursor-pointer bg-den-muted/40 text-transparent hover:bg-den-muted/60"
      }`}
      aria-label={revealed ? "Spoiler revealed" : "Click to reveal spoiler"}
      aria-pressed={revealed}
    >
      {text}
    </button>
  );
}

/** Split message text into plain segments and spoiler segments (`||hidden||`). */
export function splitSpoilerSegments(
  text: string
): Array<{ type: "text" | "spoiler"; value: string }> {
  const segments: Array<{ type: "text" | "spoiler"; value: string }> = [];
  const pattern = /\|\|([^|\n]+?)\|\|/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "spoiler", value: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "text", value: text }];
}
