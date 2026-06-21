"use client";

import { create } from "zustand";
import type { ChannelDTO, DenDTO, UserPublic } from "@cubino/shared";

interface AppState {
  user: UserPublic | null;
  setUser: (user: UserPublic | null) => void;
  dens: DenDTO[];
  setDens: (dens: DenDTO[]) => void;
  activeDenId: string | null;
  setActiveDenId: (id: string | null) => void;
  channels: ChannelDTO[];
  setChannels: (channels: ChannelDTO[]) => void;
  activeChannelId: string | null;
  setActiveChannelId: (id: string | null) => void;
  membersOpen: boolean;
  toggleMembers: () => void;
  activeDmId: string | null;
  setActiveDmId: (id: string | null) => void;
  dmOpen: boolean;
  setDmOpen: (open: boolean) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  mobileMembersOpen: boolean;
  setMobileMembersOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  dens: [],
  setDens: (dens) => set({ dens }),
  activeDenId: null,
  setActiveDenId: (activeDenId) => set({ activeDenId, activeDmId: null, dmOpen: false }),
  channels: [],
  setChannels: (channels) => set({ channels }),
  activeChannelId: null,
  setActiveChannelId: (activeChannelId) => set({ activeChannelId, activeDmId: null }),
  membersOpen: true,
  toggleMembers: () => set((s) => ({ membersOpen: !s.membersOpen })),
  activeDmId: null,
  setActiveDmId: (activeDmId) =>
    set({ activeDmId, activeDenId: null, activeChannelId: null, dmOpen: true }),
  dmOpen: false,
  setDmOpen: (dmOpen) =>
    set(
      dmOpen
        ? { dmOpen: true, activeDenId: null, activeChannelId: null, activeDmId: null }
        : { dmOpen: false }
    ),
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  mobileMembersOpen: false,
  setMobileMembersOpen: (mobileMembersOpen) => set({ mobileMembersOpen }),
}));
