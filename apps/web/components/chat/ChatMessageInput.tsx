"use client";

import { useRef, useState, useEffect } from "react";
import { getChatSocket } from "@/hooks/use-socket";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { IconPaperclip } from "@/components/ui/icons";
import {
  getActiveShortcodeQuery,
  searchEmojiShortcodes,
  type EmojiShortcodeMatch,
} from "@/lib/emoji-data";
import {
  getActiveMentionQuery,
  searchMentionCandidates,
  type MentionCandidate,
} from "@/lib/mention-utils";
import {
  MAX_MESSAGE_ATTACHMENTS,
  toAttachmentInput,
  uploadChatFile,
  type MessageAttachmentInput,
} from "@/lib/upload-file";

export interface ChatMessageInputProps {
  onSend: (content: string, attachments?: MessageAttachmentInput[]) => void;
  placeholder: string;
  /** When set, enables typing indicators and channel-scoped upload auth. */
  channelId?: string;
  /** When set, enables DM-scoped upload auth. */
  dmId?: string;
  /** Show an explicit Send button (used in DMs). */
  showSendButton?: boolean;
  /** Participants available for @mention autocomplete (channels and DMs). */
  mentionMembers?: MentionCandidate[];
  /** Den roles available for @role mention autocomplete (channels only). */
  mentionRoles?: MentionCandidate[];
  /** When true, @everyone and @here appear in the mention picker. */
  canMentionEveryone?: boolean;
  /** Channel slow-mode interval in seconds (0 = off). */
  slowModeSeconds?: number;
  /** Unix ms timestamp until sending is allowed (slow mode). */
  slowModeBlockedUntil?: number | null;
}

function fileKey(file: File, index: number): string {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

function formatSlowModeWait(ms: number): string {
  const totalSec = Math.max(1, Math.ceil(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

export function ChatMessageInput({
  onSend,
  placeholder,
  channelId,
  dmId,
  showSendButton = false,
  mentionMembers = [],
  mentionRoles = [],
  canMentionEveryone = false,
  slowModeSeconds = 0,
  slowModeBlockedUntil = null,
}: ChatMessageInputProps) {
  const [value, setValue] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    total: number;
    completed: number;
    currentName: string;
    byteLoaded: number;
    byteTotal: number;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [shortcodeSuggestions, setShortcodeSuggestions] = useState<EmojiShortcodeMatch[]>([]);
  const [shortcodeIndex, setShortcodeIndex] = useState(0);
  const shortcodeRangeRef = useRef<{ start: number; end: number } | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionCandidate[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionRangeRef = useRef<{ start: number; end: number } | null>(null);
  const typingRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [, setSlowModeTick] = useState(0);

  useEffect(() => {
    if (!slowModeBlockedUntil || slowModeBlockedUntil <= Date.now()) return;
    const id = window.setInterval(() => setSlowModeTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, [slowModeBlockedUntil]);

  const slowModeRemainingMs =
    slowModeBlockedUntil && slowModeBlockedUntil > Date.now()
      ? slowModeBlockedUntil - Date.now()
      : 0;
  const slowModeActive = slowModeRemainingMs > 0;

  const atAttachmentLimit = pendingFiles.length >= MAX_MESSAGE_ATTACHMENTS;
  const canSend =
    Boolean(value.trim() || pendingFiles.length) && !uploading && !slowModeActive;

  const emitTyping = () => {
    clearTimeout(typingRef.current);
    if (channelId) {
      getChatSocket().emit("typing:start", { channelId });
      typingRef.current = setTimeout(() => {
        getChatSocket().emit("typing:stop", { channelId });
      }, 2000);
    } else if (dmId) {
      getChatSocket().emit("dm:typing:start", { dmId });
      typingRef.current = setTimeout(() => {
        getChatSocket().emit("dm:typing:stop", { dmId });
      }, 2000);
    }
  };

  const addFiles = (selected: File[]) => {
    if (selected.length === 0) return;
    setPendingFiles((prev) => {
      const room = MAX_MESSAGE_ATTACHMENTS - prev.length;
      if (room <= 0) {
        setUploadError(`You can attach up to ${MAX_MESSAGE_ATTACHMENTS} files`);
        return prev;
      }
      const next = [...prev, ...selected.slice(0, room)];
      if (selected.length > room) {
        setUploadError(`Only ${MAX_MESSAGE_ATTACHMENTS} files can be attached per message`);
      } else {
        setUploadError(null);
      }
      return next;
    });
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
    setUploadError(null);
  };

  const insertEmoji = (emoji: string) => {
    clearShortcodeSuggestions();
    clearMentionSuggestions();
    const el = textareaRef.current;
    if (!el) {
      setValue((prev) => prev + emoji);
      emitTyping();
      return;
    }

    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    setValue(next);
    emitTyping();

    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + emoji.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const clearShortcodeSuggestions = () => {
    setShortcodeSuggestions([]);
    setShortcodeIndex(0);
    shortcodeRangeRef.current = null;
  };

  const clearMentionSuggestions = () => {
    setMentionSuggestions([]);
    setMentionIndex(0);
    mentionRangeRef.current = null;
  };

  const updateMentionSuggestions = (text: string, cursor: number) => {
    if (mentionMembers.length === 0 && mentionRoles.length === 0 && !canMentionEveryone) {
      clearMentionSuggestions();
      return;
    }
    const active = getActiveMentionQuery(text, cursor);
    if (!active) {
      clearMentionSuggestions();
      return;
    }
    const matches = searchMentionCandidates(
      active.query,
      mentionMembers,
      8,
      canMentionEveryone,
      mentionRoles
    );
    if (matches.length === 0) {
      clearMentionSuggestions();
      return;
    }
    mentionRangeRef.current = { start: active.start, end: active.end };
    setMentionSuggestions(matches);
    setMentionIndex(0);
    clearShortcodeSuggestions();
  };

  const applyMention = (member: MentionCandidate) => {
    const range = mentionRangeRef.current;
    const el = textareaRef.current;
    if (!range) return;

    const insert = `@${member.username} `;
    const next = value.slice(0, range.start) + insert + value.slice(range.end);
    const cursor = range.start + insert.length;
    setValue(next);
    clearMentionSuggestions();
    emitTyping();

    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(cursor, cursor);
    });
  };

  const updateShortcodeSuggestions = (text: string, cursor: number) => {
    const active = getActiveShortcodeQuery(text, cursor);
    if (!active || active.query.length === 0) {
      clearShortcodeSuggestions();
      return;
    }
    const matches = searchEmojiShortcodes(active.query);
    if (matches.length === 0) {
      clearShortcodeSuggestions();
      return;
    }
    shortcodeRangeRef.current = { start: active.start, end: active.end };
    setShortcodeSuggestions(matches);
    setShortcodeIndex(0);
  };

  const applyShortcode = (match: EmojiShortcodeMatch) => {
    const range = shortcodeRangeRef.current;
    const el = textareaRef.current;
    if (!range) return;

    const next = value.slice(0, range.start) + match.emoji + value.slice(range.end);
    const cursor = range.start + match.emoji.length;
    setValue(next);
    clearShortcodeSuggestions();
    emitTyping();

    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(cursor, cursor);
    });
  };

  const handleValueChange = (next: string, cursor: number) => {
    setValue(next);
    const mentionActive = getActiveMentionQuery(next, cursor);
    if (mentionActive && (mentionMembers.length > 0 || mentionRoles.length > 0 || canMentionEveryone)) {
      updateMentionSuggestions(next, cursor);
    } else {
      clearMentionSuggestions();
      updateShortcodeSuggestions(next, cursor);
    }
    emitTyping();
  };

  const activeSuggestions = mentionSuggestions.length > 0 ? "mention" : "shortcode";
  const hasAutocomplete = mentionSuggestions.length > 0 || shortcodeSuggestions.length > 0;

  const submitMessage = async () => {
    if (uploading) return;

    const content = value.trim();
    const files = pendingFiles;
    let attachments: MessageAttachmentInput[] | undefined;

    if (files.length > 0) {
      setUploading(true);
      setUploadError(null);
      setUploadProgress({
        total: files.length,
        completed: 0,
        currentName: files[0].name,
        byteLoaded: 0,
        byteTotal: files[0].size,
      });
      try {
        const uploadedAttachments: MessageAttachmentInput[] = [];
        for (let index = 0; index < files.length; index++) {
          const file = files[index];
          setUploadProgress({
            total: files.length,
            completed: index,
            currentName: file.name,
            byteLoaded: 0,
            byteTotal: file.size,
          });
          const uploaded = await uploadChatFile(file, {
            channelId,
            dmId,
            onProgress: (loaded, total) => {
              setUploadProgress({
                total: files.length,
                completed: index,
                currentName: file.name,
                byteLoaded: loaded,
                byteTotal: total,
              });
            },
          });
          uploadedAttachments.push(toAttachmentInput(file, uploaded));
        }
        setUploadProgress({
          total: files.length,
          completed: files.length,
          currentName: files[files.length - 1]?.name ?? "",
          byteLoaded: files[files.length - 1]?.size ?? 0,
          byteTotal: files[files.length - 1]?.size ?? 0,
        });
        attachments = uploadedAttachments;
      } catch (err) {
        setUploadError((err as Error).message ?? "Upload failed");
        setUploading(false);
        setUploadProgress(null);
        return;
      }
      setPendingFiles([]);
      setUploading(false);
      setUploadProgress(null);
    }

    if (!content && !attachments?.length) return;

    onSend(content, attachments);
    setValue("");
    clearShortcodeSuggestions();
    clearMentionSuggestions();
    setUploadError(null);
    if (channelId) {
      getChatSocket().emit("typing:stop", { channelId });
    } else if (dmId) {
      getChatSocket().emit("dm:typing:stop", { dmId });
    }
  };

  const progressPercent =
    uploadProgress && uploadProgress.total > 0
      ? uploadProgress.byteTotal > 0
        ? Math.round(
            ((uploadProgress.completed + uploadProgress.byteLoaded / uploadProgress.byteTotal) /
              uploadProgress.total) *
              100
          )
        : Math.round((uploadProgress.completed / uploadProgress.total) * 100)
      : 0;

  return (
    <div className={showSendButton ? "px-4 pb-6" : "px-4 pb-6 pt-2"}>
      {slowModeActive && (
        <p
          className="mb-2 rounded-den bg-den-elevated px-3 py-2 text-xs text-den-muted"
          role="status"
          aria-live="polite"
        >
          Slow mode is on — wait{" "}
          <span className="font-semibold text-den-cream">
            {formatSlowModeWait(slowModeRemainingMs)}
          </span>{" "}
          before sending another message
        </p>
      )}
      {slowModeSeconds > 0 && !slowModeActive && channelId && (
        <p className="mb-2 text-[10px] text-den-muted">
          Slow mode: {slowModeSeconds}s between messages
        </p>
      )}
      {uploading && uploadProgress && (
        <div className="mb-2 rounded-den bg-den-elevated px-3 py-2" role="status" aria-live="polite">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-den-cream">
              Uploading{" "}
              <span className="text-den-muted" title={uploadProgress.currentName}>
                {uploadProgress.currentName}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-den-muted">
              {uploadProgress.completed + 1} of {uploadProgress.total}
              {uploadProgress.byteTotal > 0 && (
                <span className="ml-1">
                  · {Math.round((uploadProgress.byteLoaded / uploadProgress.byteTotal) * 100)}%
                </span>
              )}
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-den-surface"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            aria-label="Attachment upload progress"
          >
            <div
              className="h-full rounded-full bg-den-honey transition-[width] duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}
      {pendingFiles.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label="Pending attachments">
          {pendingFiles.map((file, index) => {
            const isCurrent =
              uploading &&
              uploadProgress &&
              uploadProgress.completed === index &&
              uploadProgress.completed < uploadProgress.total;
            const isDone = uploading && uploadProgress && index < uploadProgress.completed;

            return (
            <li
              key={fileKey(file, index)}
              className={`flex max-w-full items-center gap-2 rounded-den bg-den-elevated px-3 py-1.5 text-sm text-den-cream${
                isCurrent ? " ring-1 ring-den-honey/60" : ""
              }${isDone ? " opacity-60" : ""}`}
            >
              <IconPaperclip className="h-3.5 w-3.5 shrink-0 text-den-muted" />
              <span className="min-w-0 truncate" title={file.name}>
                {file.name}
              </span>
              {isCurrent && (
                <span className="shrink-0 text-[10px] text-den-honey">Uploading...</span>
              )}
              {isDone && (
                <span className="shrink-0 text-[10px] text-den-muted">Done</span>
              )}
              {!uploading && (
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="shrink-0 text-xs text-den-muted hover:text-den-cream"
                aria-label={`Remove ${file.name}`}
              >
                Remove
              </button>
              )}
            </li>
            );
          })}
        </ul>
      )}
      {uploadError && (
        <p className="mb-2 text-xs text-den-berry" role="alert">
          {uploadError}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitMessage();
        }}
        className="flex items-end gap-2 rounded-lg bg-den-elevated px-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          accept="image/*,.pdf,.txt,.zip,.doc,.docx,.xls,.xlsx,.mp4,.webm,.mp3,.wav"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <EmojiPicker onSelect={insertEmoji} disabled={uploading} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || atAttachmentLimit}
          title={
            atAttachmentLimit
              ? `Maximum ${MAX_MESSAGE_ATTACHMENTS} attachments`
              : "Attach files"
          }
          aria-label={
            atAttachmentLimit
              ? `Maximum ${MAX_MESSAGE_ATTACHMENTS} attachments reached`
              : "Attach files"
          }
          className="mb-2 shrink-0 rounded p-2 text-den-muted transition-colors hover:bg-den-surface hover:text-den-cream disabled:opacity-50"
        >
          <IconPaperclip />
        </button>
        <div className="relative min-w-0 flex-1">
          {mentionSuggestions.length > 0 && (
            <ul
              role="listbox"
              aria-label="Member mentions"
              className="absolute bottom-full left-0 z-50 mb-1 max-h-44 w-full min-w-[220px] overflow-y-auto rounded-cubino border border-white/[0.08] bg-den-surface py-1 shadow-den"
            >
              {mentionSuggestions.map((member, index) => (
                <li key={member.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === mentionIndex}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyMention(member);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                      index === mentionIndex
                        ? "bg-den-honey/20 text-den-cream"
                        : "text-den-cream hover:bg-den-elevated"
                    }`}
                  >
                    {member.kind === "role" && member.color ? (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: member.color }}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className="font-medium text-den-link">@{member.username}</span>
                    <span className="truncate text-den-muted">
                      {member.kind === "role" ? "Role" : member.displayName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {mentionSuggestions.length === 0 && shortcodeSuggestions.length > 0 && (
            <ul
              role="listbox"
              aria-label="Emoji suggestions"
              className="absolute bottom-full left-0 z-50 mb-1 max-h-44 w-full min-w-[200px] overflow-y-auto rounded-cubino border border-white/[0.08] bg-den-surface py-1 shadow-den"
            >
              {shortcodeSuggestions.map((match, index) => (
                <li key={match.code} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === shortcodeIndex}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyShortcode(match);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                      index === shortcodeIndex
                        ? "bg-den-honey/20 text-den-cream"
                        : "text-den-cream hover:bg-den-elevated"
                    }`}
                  >
                    <span className="text-lg leading-none">{match.emoji}</span>
                    <span className="text-den-muted">:{match.code}:</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              handleValueChange(e.target.value, e.target.selectionStart ?? e.target.value.length);
            }}
            onKeyDown={(e) => {
              if (hasAutocomplete) {
                const isMention = activeSuggestions === "mention";
                const count = isMention ? mentionSuggestions.length : shortcodeSuggestions.length;
                const index = isMention ? mentionIndex : shortcodeIndex;

                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  if (isMention) {
                    setMentionIndex((i) => (i + 1) % count);
                  } else {
                    setShortcodeIndex((i) => (i + 1) % count);
                  }
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  if (isMention) {
                    setMentionIndex((i) => (i - 1 + count) % count);
                  } else {
                    setShortcodeIndex((i) => (i - 1 + count) % count);
                  }
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  if (isMention) {
                    applyMention(mentionSuggestions[mentionIndex]);
                  } else {
                    applyShortcode(shortcodeSuggestions[shortcodeIndex]);
                  }
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  clearMentionSuggestions();
                  clearShortcodeSuggestions();
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey && !hasAutocomplete) {
                e.preventDefault();
                void submitMessage();
              }
            }}
            rows={1}
            disabled={uploading}
            placeholder={
              uploading && uploadProgress
                ? `Uploading ${uploadProgress.completed + 1} of ${uploadProgress.total}...`
                : placeholder
            }
            className={`max-h-40 min-h-[44px] w-full resize-none bg-transparent py-3 text-den-cream outline-none placeholder:text-den-muted focus:ring-0 disabled:opacity-60 ${
              showSendButton ? "text-sm" : "text-[15px]"
            }`}
          />
        </div>
        {showSendButton && (
          <button
            type="submit"
            disabled={!canSend}
            className="mb-2 shrink-0 rounded-den bg-den-honey px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
}
