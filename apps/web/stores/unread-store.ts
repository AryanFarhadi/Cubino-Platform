"use client";

import { create } from "zustand";

interface UnreadState {
  channelUnread: Record<string, number>;
  dmUnread: Record<string, number>;
  denUnread: Record<string, number>;
  channelDenMap: Record<string, string>;
  incrementChannel: (channelId: string, denId?: string) => void;
  incrementDm: (dmId: string) => void;
  clearChannel: (channelId: string) => void;
  clearDm: (dmId: string) => void;
  registerChannelDenMap: (entries: { id: string; denId: string }[]) => void;
  setSummary: (
    channels: Record<string, number>,
    dms: Record<string, number>,
    dens?: Record<string, number>,
    channelDens?: Record<string, string>
  ) => void;
  totalDm: () => number;
  totalChannel: () => number;
  denTotal: (denId: string) => number;
}

export const useUnreadStore = create<UnreadState>((set, get) => ({
  channelUnread: {},
  dmUnread: {},
  denUnread: {},
  channelDenMap: {},
  incrementChannel: (channelId, denId) =>
    set((s) => {
      const resolvedDenId = denId ?? s.channelDenMap[channelId];
      const channelUnread = {
        ...s.channelUnread,
        [channelId]: (s.channelUnread[channelId] ?? 0) + 1,
      };
      const channelDenMap =
        resolvedDenId != null
          ? { ...s.channelDenMap, [channelId]: resolvedDenId }
          : s.channelDenMap;
      const denUnread =
        resolvedDenId != null
          ? {
              ...s.denUnread,
              [resolvedDenId]: (s.denUnread[resolvedDenId] ?? 0) + 1,
            }
          : s.denUnread;
      return { channelUnread, channelDenMap, denUnread };
    }),
  incrementDm: (dmId) =>
    set((s) => ({
      dmUnread: { ...s.dmUnread, [dmId]: (s.dmUnread[dmId] ?? 0) + 1 },
    })),
  clearChannel: (channelId) =>
    set((s) => {
      const cleared = s.channelUnread[channelId] ?? 0;
      const denId = s.channelDenMap[channelId];
      const channelUnread = { ...s.channelUnread };
      delete channelUnread[channelId];
      const denUnread = { ...s.denUnread };
      if (denId && cleared > 0) {
        const next = (denUnread[denId] ?? 0) - cleared;
        if (next <= 0) delete denUnread[denId];
        else denUnread[denId] = next;
      }
      return { channelUnread, denUnread };
    }),
  clearDm: (dmId) =>
    set((s) => {
      const dmUnread = { ...s.dmUnread };
      delete dmUnread[dmId];
      return { dmUnread };
    }),
  registerChannelDenMap: (entries) =>
    set((s) => {
      const channelDenMap = { ...s.channelDenMap };
      for (const { id, denId } of entries) channelDenMap[id] = denId;
      return { channelDenMap };
    }),
  setSummary: (channels, dms, dens, channelDens) =>
    set((s) => ({
      channelUnread: channels,
      dmUnread: dms,
      denUnread: dens ?? s.denUnread,
      channelDenMap: channelDens ? { ...s.channelDenMap, ...channelDens } : s.channelDenMap,
    })),
  totalDm: () => Object.values(get().dmUnread).reduce((a, b) => a + b, 0),
  totalChannel: () => Object.values(get().channelUnread).reduce((a, b) => a + b, 0),
  denTotal: (denId) => get().denUnread[denId] ?? 0,
}));
