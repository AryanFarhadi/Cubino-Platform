"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import clsx from "clsx";
import { highlightMentionsInText, type RoleHighlight } from "@/lib/mention-utils";
import { extractFirstUrl } from "@/lib/link-utils";
import { MessageLinkEmbed } from "@/components/chat/MessageLinkEmbed";
import { Spoiler, splitSpoilerSegments } from "@/components/chat/Spoiler";
import { highlightCodeBlock } from "@/lib/simple-highlight";

/** Normalize outgoing message text (e.g. `/me waves` → italic markdown). */
export function formatMessageContent(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("/me ")) {
    return `*${trimmed.slice(4)}*`;
  }
  return trimmed;
}

const markdownComponents = (roleHighlights: RoleHighlight[]) => ({
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-0">{children}</p>,
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-1 mt-2 text-lg font-bold text-den-cream">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-1 mt-2 text-base font-bold text-den-cream">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1 mt-1.5 text-sm font-semibold text-den-cream">{children}</h3>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-den-cream">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
  hr: () => <hr className="my-2 border-white/10" />,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-1 border-l-4 border-den-honey/50 pl-3 text-den-muted italic">
      {children}
    </blockquote>
  ),
  del: ({ children }: { children?: React.ReactNode }) => (
    <del className="text-den-muted line-through">{children}</del>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-2 overflow-x-auto rounded-den border border-white/10">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-den-elevated/80">{children}</thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => <tbody>{children}</tbody>,
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="border-b border-white/10 last:border-b-0">{children}</tr>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-3 py-2 text-left font-semibold text-den-cream">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-3 py-2 text-den-muted">{children}</td>
  ),
  ul: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <ul
      className={clsx(
        "my-1",
        className?.includes("contains-task-list") ? "list-none pl-0" : "list-disc pl-5"
      )}
    >
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-1 list-decimal pl-5">{children}</ol>
  ),
  li: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isTask = className?.includes("task-list-item");
    return (
      <li className={clsx("my-0.5", isTask && "list-none -ml-1 flex items-start gap-2")}>
        {children}
      </li>
    );
  },
  input: ({ checked, disabled }: { checked?: boolean; disabled?: boolean }) => (
    <input
      type="checkbox"
      checked={checked ?? false}
      disabled={disabled ?? true}
      readOnly
      aria-hidden="true"
      className="mt-0.5 shrink-0 accent-den-honey"
    />
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="relative my-2 overflow-x-auto rounded-den border border-white/10 bg-[#1a1b1e] p-3 pt-6 text-xs leading-relaxed">
      {children}
    </pre>
  ),
  code: ({
    inline,
    className,
    children,
  }: {
    inline?: boolean;
    className?: string;
    children?: React.ReactNode;
  }) => {
    if (inline) {
      return (
        <code className="rounded bg-den-elevated px-1 py-0.5 font-mono text-[0.85em] text-den-honey">
          {children}
        </code>
      );
    }
    const language = className?.replace("language-", "") ?? "";
    const text = String(children ?? "").replace(/\n$/, "");
    return (
      <code className={`block font-mono ${className ?? ""}`} data-language={language}>
        {language ? highlightCodeBlock(text, language) : text}
      </code>
    );
  },
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-den-link hover:underline"
    >
      {children}
    </a>
  ),
  text: ({ children }: { children?: React.ReactNode }) => {
    const text = String(children ?? "");
    if (!text.includes("@")) return <>{children}</>;
    return <>{highlightMentionsInText(text, roleHighlights)}</>;
  },
});

function MarkdownSegment({
  content,
  roleHighlights,
}: {
  content: string;
  roleHighlights: RoleHighlight[];
}) {
  if (!content) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={markdownComponents(roleHighlights)}
    >
      {content}
    </ReactMarkdown>
  );
}

export function MessageContent({
  content,
  className,
  roleHighlights = [],
}: {
  content: string;
  className?: string;
  roleHighlights?: RoleHighlight[];
}) {
  const hasLink = !!extractFirstUrl(content);
  const segments = splitSpoilerSegments(content);
  const hasSpoilers = segments.some((s) => s.type === "spoiler");

  return (
    <div
      className={clsx(
        "prose prose-invert prose-sm prose-cubino max-w-none text-[#dbdee1]",
        className
      )}
    >
      {hasSpoilers ? (
        <div className="inline">
          {segments.map((segment, index) =>
            segment.type === "spoiler" ? (
              <Spoiler key={index} text={segment.value} />
            ) : (
              <MarkdownSegment key={index} content={segment.value} roleHighlights={roleHighlights} />
            )
          )}
        </div>
      ) : (
        <MarkdownSegment content={content} roleHighlights={roleHighlights} />
      )}
      {hasLink && <MessageLinkEmbed content={content} />}
    </div>
  );
}
