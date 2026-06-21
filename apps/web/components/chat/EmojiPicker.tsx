"use client";

import { useEffect, useId, useRef, useState } from "react";
import { COMPOSE_EMOJI_CATEGORIES } from "@/lib/emoji-data";
import { IconSmile } from "@/components/ui/icons";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

export function EmojiPicker({ onSelect, disabled = false }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(COMPOSE_EMOJI_CATEGORIES[0].id);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const category =
    COMPOSE_EMOJI_CATEGORIES.find((item) => item.id === activeCategory) ??
    COMPOSE_EMOJI_CATEGORIES[0];

  const pickEmoji = (emoji: string) => {
    onSelect(emoji);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        title="Insert emoji"
        aria-label="Insert emoji"
        className="mb-2 rounded p-2 text-den-muted transition-colors hover:bg-den-surface hover:text-den-cream disabled:opacity-50"
      >
        <IconSmile />
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Emoji picker"
          className="absolute bottom-full right-0 z-50 mb-2 w-[min(100vw-2rem,320px)] overflow-hidden rounded-cubino border border-white/[0.08] bg-den-surface shadow-den"
        >
          <div
            className="flex gap-1 overflow-x-auto border-b border-black/20 px-2 py-1.5"
            role="tablist"
            aria-label="Emoji categories"
          >
            {COMPOSE_EMOJI_CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={activeCategory === item.id}
                onClick={() => setActiveCategory(item.id)}
                className={`shrink-0 rounded-den px-2 py-1 text-[11px] font-medium transition-colors ${
                  activeCategory === item.id
                    ? "bg-den-honey text-white"
                    : "text-den-muted hover:bg-den-elevated hover:text-den-cream"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div
            className="grid max-h-44 grid-cols-8 gap-0.5 overflow-y-auto p-2"
            role="listbox"
            aria-label={`${category.label} emojis`}
          >
            {category.emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="option"
                aria-label={`Insert ${emoji}`}
                onClick={() => pickEmoji(emoji)}
                className="flex h-9 w-9 items-center justify-center rounded-den text-xl transition-colors hover:bg-den-elevated"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
