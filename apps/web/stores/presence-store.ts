"use client";

import { create } from "zustand";
import type { UserStatus } from "@cubino/shared";

interface PresenceState {
  onlineUsers: Record<string, UserStatus>;
  setStatus: (userId: string, status: UserStatus) => void;
  removeUser: (userId: string) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  onlineUsers: {},
  setStatus: (userId, status) =>
    set((s) => ({ onlineUsers: { ...s.onlineUsers, [userId]: status } })),
  removeUser: (userId) =>
    set((s) => {
      const onlineUsers = { ...s.onlineUsers };
      delete onlineUsers[userId];
      return { onlineUsers };
    }),
}));
