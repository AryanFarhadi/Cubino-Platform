"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getChatSocket } from "@/hooks/use-socket";

export const PENDING_SEND_TIMEOUT_MS = 10_000;

/** Invoke callback once when the chat socket reconnects (not on first connect). */
export function useReconnectCallback(callback: () => void) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const hadConnectedRef = useRef(false);

  useEffect(() => {
    const socket = getChatSocket();
    if (socket.connected) hadConnectedRef.current = true;

    const onConnect = () => {
      if (hadConnectedRef.current) callbackRef.current();
      hadConnectedRef.current = true;
    };

    socket.on("connect", onConnect);
    return () => {
      socket.off("connect", onConnect);
    };
  }, []);
}

/** Track optimistic message IDs; mark failed if the server does not confirm in time. */
export function usePendingSendTimeouts() {
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const failedIdsRef = useRef(failedIds);
  failedIdsRef.current = failedIds;
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const cancelTimeout = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const failAllPending = useCallback(() => {
    const pendingIds = [...timersRef.current.keys()];
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
    if (pendingIds.length === 0) return;
    setFailedIds((prev) => {
      const next = new Set(prev);
      for (const id of pendingIds) next.add(id);
      return next;
    });
  }, []);

  const trackPending = useCallback(
    (messageId: string) => {
      cancelTimeout(messageId);
      setFailedIds((prev) => {
        if (!prev.has(messageId)) return prev;
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
      const timer = setTimeout(() => {
        timersRef.current.delete(messageId);
        setFailedIds((prev) => new Set(prev).add(messageId));
      }, PENDING_SEND_TIMEOUT_MS);
      timersRef.current.set(messageId, timer);
    },
    [cancelTimeout]
  );

  const markConfirmed = useCallback(
    (messageId: string) => {
      cancelTimeout(messageId);
      setFailedIds((prev) => {
        if (!prev.has(messageId)) return prev;
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    },
    [cancelTimeout]
  );

  const isFailed = useCallback((messageId: string) => failedIds.has(messageId), [failedIds]);

  /** Stable check against latest failed IDs (for reconnect handlers). */
  const hasFailed = useCallback((messageId: string) => failedIdsRef.current.has(messageId), []);

  const resetAll = useCallback(() => {
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
    setFailedIds(new Set());
  }, []);

  useEffect(() => {
    const socket = getChatSocket();
    const onDisconnect = () => failAllPending();
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("disconnect", onDisconnect);
    };
  }, [failAllPending]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    };
  }, []);

  return { trackPending, markConfirmed, isFailed, hasFailed, resetAll, failAllPending };
}
