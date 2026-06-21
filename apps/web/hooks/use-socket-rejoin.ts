"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getChatSocket } from "@/hooks/use-socket";
import { useAppStore } from "@/stores/app-store";

/**
 * Re-syncs chat state after the socket reconnects.
 * - Re-joins the active channel/DM room (membership is lost on disconnect).
 * - Refetches the open conversation so messages sent during downtime appear.
 * - Refreshes unread badges that may have changed while offline.
 */
export function useSocketRejoin(enabled: boolean) {
  const qc = useQueryClient();
  const hadConnectedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const socket = getChatSocket();

    const rejoinActiveRooms = () => {
      const { activeChannelId, activeDmId, dmOpen } = useAppStore.getState();
      const inDmView = dmOpen || !!activeDmId;

      if (!inDmView && activeChannelId) {
        socket.emit("join:channel", { channelId: activeChannelId });
        void qc.invalidateQueries({ queryKey: ["messages", activeChannelId] });
      }
      if (inDmView && activeDmId) {
        socket.emit("join:dm", { dmId: activeDmId });
        void qc.invalidateQueries({ queryKey: ["dm-messages", activeDmId] });
      }

      void qc.invalidateQueries({ queryKey: ["unread-summary"] });
    };

    const onConnect = () => {
      // Initial connect is handled by ChatView/DmPanel mount effects; only
      // re-sync after a prior connection was lost (true reconnect).
      if (hadConnectedRef.current) {
        rejoinActiveRooms();
      }
      hadConnectedRef.current = true;
    };

    if (socket.connected) {
      hadConnectedRef.current = true;
    }

    socket.on("connect", onConnect);

    return () => {
      socket.off("connect", onConnect);
    };
  }, [enabled, qc]);
}
