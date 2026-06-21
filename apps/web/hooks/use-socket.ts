"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { getWsUrl, getAccessToken } from "@/lib/api";

let chatSocket: Socket | null = null;
let signalSocket: Socket | null = null;

export function getChatSocket() {
  if (!chatSocket) {
    chatSocket = io(`${getWsUrl()}/chat`, {
      path: "/socket.io",
      autoConnect: false,
      auth: { token: getAccessToken() },
    });
  }
  return chatSocket;
}

export function getSignalSocket() {
  if (!signalSocket) {
    signalSocket = io(`${getWsUrl()}/signal`, {
      path: "/socket.io",
      autoConnect: false,
      auth: { token: getAccessToken() },
    });
  }
  return signalSocket;
}

export function useSocketConnect(enabled: boolean) {
  const connected = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const token = getAccessToken();
    if (!token) return;

    const chat = getChatSocket();
    const signal = getSignalSocket();
    chat.auth = { token };
    signal.auth = { token };

    if (!connected.current) {
      chat.connect();
      signal.connect();
      connected.current = true;
    }

    return () => {
      // keep alive for app session
    };
  }, [enabled]);
}
