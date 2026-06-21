"use client";

import { useEffect, useRef } from "react";
import { getChatSocket } from "@/hooks/use-socket";
import { usePresenceStore } from "@/stores/presence-store";
import { useAppStore } from "@/stores/app-store";
import { api } from "@/lib/api";
import type { UserStatus } from "@cubino/shared";

export function usePresence() {
  const setUser = useAppStore((s) => s.setUser);
  const userId = useAppStore((s) => s.user?.id);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const socket = getChatSocket();
    const onPresence = ({ userId, status }: { userId: string; status: UserStatus | "offline" }) => {
      if (status === "offline" || status === "invisible") {
        usePresenceStore.getState().removeUser(userId);
      } else {
        usePresenceStore.getState().setStatus(userId, status);
      }
    };
    socket.on("presence:update", onPresence);
    return () => {
      socket.off("presence:update", onPresence);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    const scheduleIdle = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        const status = useAppStore.getState().user?.status;
        if (status === "online") {
          api<{ user: NonNullable<ReturnType<typeof useAppStore.getState>["user"]> }>(
            "/api/v1/users/me",
            { method: "PATCH", body: JSON.stringify({ status: "idle" }) }
          ).then((res) => {
            setUser(res.user);
            getChatSocket().emit("presence:set", { status: "idle" });
          });
        }
      }, 5 * 60 * 1000);
    };

    const onActivity = () => {
      const status = useAppStore.getState().user?.status;
      // Only auto-return to online from automatic idle — respect manual dnd/invisible
      if (status === "idle") {
        api<{ user: NonNullable<ReturnType<typeof useAppStore.getState>["user"]> }>(
          "/api/v1/users/me",
          { method: "PATCH", body: JSON.stringify({ status: "online" }) }
        ).then((res) => {
          setUser(res.user);
          getChatSocket().emit("presence:set", { status: "online" });
        });
      }
      scheduleIdle();
    };

    window.addEventListener("mousemove", onActivity);
    window.addEventListener("keydown", onActivity);
    scheduleIdle();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [userId, setUser]);

  const updateStatus = async (status: UserStatus) => {
    const res = await api<{ user: NonNullable<ReturnType<typeof useAppStore.getState>["user"]> }>(
      "/api/v1/users/me",
      { method: "PATCH", body: JSON.stringify({ status }) }
    );
    setUser(res.user);
    getChatSocket().emit("presence:set", { status });
  };

  return { updateStatus };
}
