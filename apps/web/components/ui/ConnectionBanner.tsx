"use client";

import type { SocketConnectionStatus } from "@/hooks/use-socket-status";

const STATUS_COPY: Record<
  Exclude<SocketConnectionStatus, "connected">,
  { text: string; className: string }
> = {
  connecting: {
    text: "Connecting to Cubino...",
    className: "bg-den-honey/15 text-den-honey",
  },
  reconnecting: {
    text: "Reconnecting...",
    className: "bg-den-honey/15 text-den-honey animate-pulse",
  },
  disconnected: {
    text: "Connection lost. Messages may not send until you are back online.",
    className: "bg-den-berry/20 text-den-cream",
  },
};

export function ConnectionBanner({ status }: { status: SocketConnectionStatus }) {
  if (status === "connected") return null;

  const { text, className } = STATUS_COPY[status];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`shrink-0 border-b border-black/20 px-3 py-1.5 text-center text-xs font-medium ${className}`}
    >
      {text}
    </div>
  );
}
