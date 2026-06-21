"use client";

import { useEffect, useState } from "react";
import { getChatSocket } from "@/hooks/use-socket";

export type SocketConnectionStatus = "connected" | "connecting" | "reconnecting" | "disconnected";

export function getSocketStatusLabel(status: SocketConnectionStatus): string | null {
  switch (status) {
    case "connected":
      return null;
    case "connecting":
      return "Connecting...";
    case "reconnecting":
      return "Reconnecting...";
    case "disconnected":
      return "Offline";
  }
}

export function getSocketStatusClassName(status: Exclude<SocketConnectionStatus, "connected">): string {
  switch (status) {
    case "connecting":
    case "reconnecting":
      return "text-den-honey";
    case "disconnected":
      return "text-den-berry";
  }
}

export function useSocketStatus(enabled: boolean): SocketConnectionStatus {
  const [status, setStatus] = useState<SocketConnectionStatus>("connecting");

  useEffect(() => {
    if (!enabled) return;

    const socket = getChatSocket();

    const onConnect = () => setStatus("connected");
    const onDisconnect = () => setStatus("disconnected");
    const onReconnectAttempt = () => setStatus("reconnecting");
    const onConnectError = () => {
      if (!socket.connected) setStatus("connecting");
    };

    setStatus(socket.connected ? "connected" : "connecting");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.io.on("reconnect_attempt", onReconnectAttempt);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
    };
  }, [enabled]);

  return status;
}
