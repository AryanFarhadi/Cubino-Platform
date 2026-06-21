import React from "react";

type TokenKind = "keyword" | "string" | "comment" | "number" | "plain";

const TOKEN_CLASS: Record<TokenKind, string> = {
  keyword: "text-den-honey",
  string: "text-den-forest",
  comment: "text-den-muted italic",
  number: "text-den-link",
  plain: "text-den-cream",
};

const KEYWORDS: Record<string, Set<string>> = {
  js: new Set([
    "const", "let", "var", "function", "return", "if", "else", "for", "while", "do",
    "switch", "case", "break", "continue", "class", "extends", "import", "export",
    "from", "default", "async", "await", "try", "catch", "finally", "throw", "new",
    "typeof", "instanceof", "in", "of", "null", "undefined", "true", "false", "this",
  ]),
  ts: new Set([
    "const", "let", "var", "function", "return", "if", "else", "for", "while", "do",
    "switch", "case", "break", "continue", "class", "extends", "import", "export",
    "from", "default", "async", "await", "try", "catch", "finally", "throw", "new",
    "typeof", "instanceof", "in", "of", "null", "undefined", "true", "false", "this",
    "interface", "type", "enum", "implements", "public", "private", "protected", "readonly",
  ]),
  python: new Set([
    "def", "class", "if", "elif", "else", "for", "while", "return", "import", "from",
    "as", "with", "try", "except", "finally", "raise", "pass", "break", "continue",
    "True", "False", "None", "and", "or", "not", "in", "is", "lambda", "yield", "async", "await",
  ]),
  json: new Set(["true", "false", "null"]),
  bash: new Set([
    "if", "then", "else", "fi", "for", "do", "done", "while", "case", "esac", "function",
    "export", "local", "return", "echo", "cd", "exit",
  ]),
};

function normalizeLanguage(language: string): string {
  const lang = language.toLowerCase();
  if (lang === "javascript" || lang === "jsx") return "js";
  if (lang === "typescript" || lang === "tsx") return "ts";
  if (lang === "py") return "python";
  if (lang === "sh" || lang === "shell" || lang === "zsh") return "bash";
  return lang;
}

function getKeywords(language: string): Set<string> | null {
  return KEYWORDS[normalizeLanguage(language)] ?? null;
}

function tokenizeLine(line: string, keywords: Set<string> | null): { kind: TokenKind; value: string }[] {
  const tokens: { kind: TokenKind; value: string }[] = [];
  let i = 0;

  while (i < line.length) {
    if (line.startsWith("//", i) || (keywords === KEYWORDS.python && line.startsWith("#", i))) {
      tokens.push({ kind: "comment", value: line.slice(i) });
      break;
    }

    const quote = line[i];
    if (quote === '"' || quote === "'" || quote === "`") {
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === "\\") {
          j += 2;
          continue;
        }
        if (line[j] === quote) {
          j++;
          break;
        }
        j++;
      }
      tokens.push({ kind: "string", value: line.slice(i, j) });
      i = j;
      continue;
    }

    if (/[0-9]/.test(line[i]) && (i === 0 || !/[a-zA-Z_$]/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[0-9.xXeE+-]/.test(line[j])) j++;
      tokens.push({ kind: "number", value: line.slice(i, j) });
      i = j;
      continue;
    }

    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      tokens.push({ kind: keywords?.has(word) ? "keyword" : "plain", value: word });
      i = j;
      continue;
    }

    tokens.push({ kind: "plain", value: line[i] });
    i++;
  }

  return tokens;
}

/** Render fenced code block content with basic syntax highlighting. */
export function highlightCodeBlock(code: string, language: string): React.ReactNode {
  const keywords = getKeywords(language);
  const lines = code.replace(/\n$/, "").split("\n");

  return lines.map((line, lineIndex) => (
    <span key={lineIndex} className="block whitespace-pre">
      {tokenizeLine(line, keywords).map((token, tokenIndex) => (
        <span key={tokenIndex} className={TOKEN_CLASS[token.kind]}>
          {token.value}
        </span>
      ))}
      {lineIndex < lines.length - 1 ? "\n" : null}
    </span>
  ));
}
