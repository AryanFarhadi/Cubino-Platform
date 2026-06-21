"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getChatSocket } from "@/hooks/use-socket";
import { playNotificationSound } from "@/lib/notification-prefs";
import { useVoiceStore } from "@/stores/voice-store";
import { LionLogo } from "@/components/ui/lion";

export type AchievementUnlockPayload = {
  id: string;
  name: string;
  description: string;
};

const TOAST_DURATION_MS = 5_000;

const CONFETTI_PIECES = [
  { left: "12%", delay: "0ms", color: "bg-den-gold" },
  { left: "28%", delay: "40ms", color: "bg-den-honey" },
  { left: "44%", delay: "80ms", color: "bg-den-forest" },
  { left: "60%", delay: "20ms", color: "bg-den-gold" },
  { left: "76%", delay: "60ms", color: "bg-den-cream" },
  { left: "88%", delay: "100ms", color: "bg-den-honey" },
] as const;

/** Shows a brief toast when the server unlocks an achievement for the current user. */
export function AchievementToastHost({ enabled }: { enabled: boolean }) {
  const [toast, setToast] = useState<AchievementUnlockPayload | null>(null);
  const [entered, setEntered] = useState(false);
  const voiceConnected = useVoiceStore((s) => s.connectedChannelId !== null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const socket = getChatSocket();
    const onUnlock = (payload: AchievementUnlockPayload) => {
      if (!payload?.id || !payload?.name) return;
      setToast(payload);
      setEntered(false);
      playNotificationSound("mention");
      qc.invalidateQueries({ queryKey: ["my-achievements"] });
    };

    socket.on("achievement:unlock", onUnlock);
    return () => {
      socket.off("achievement:unlock", onUnlock);
    };
  }, [enabled, qc]);

  useEffect(() => {
    if (!toast) return;
    const enterTimer = window.requestAnimationFrame(() => setEntered(true));
    const dismissTimer = window.setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => {
      window.cancelAnimationFrame(enterTimer);
      window.clearTimeout(dismissTimer);
    };
  }, [toast]);

  if (!toast) return null;

  // UserBar (~52px) + optional VoiceBar (~52px) on mobile; desktop has no bottom bars.
  const bottomClass = voiceConnected
    ? "bottom-[6.5rem] sm:bottom-6"
    : "bottom-20 sm:bottom-6";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed right-4 z-[300] max-w-xs transition-all duration-300 ease-out sm:right-6 ${bottomClass} ${
        entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      {entered && (
        <div className="pointer-events-none absolute -top-2 left-0 h-8 w-full overflow-visible" aria-hidden="true">
          {CONFETTI_PIECES.map((piece, i) => (
            <span
              key={i}
              className={`absolute top-0 h-2 w-1 rounded-sm ${piece.color} animate-[confetti-fall_0.9s_ease-out_forwards]`}
              style={{ left: piece.left, animationDelay: piece.delay }}
            />
          ))}
        </div>
      )}
      <div className="relative flex items-start gap-3 rounded-cubino border border-den-gold/40 bg-den-surface p-4 shadow-den">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-den-gold/15 ${
            entered ? "animate-[achievement-pop_0.5s_ease-out]" : ""
          }`}
        >
          <LionLogo size={24} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-den-gold">
            Achievement unlocked
          </p>
          <p className="mt-0.5 font-bold text-den-cream">{toast.name}</p>
          <p className="mt-0.5 text-xs text-den-muted">{toast.description}</p>
        </div>
      </div>
    </div>
  );
}
