"use client";

import { create } from "zustand";

interface VoicePeer {
  userId: string;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
}

interface VoiceState {
  connectedChannelId: string | null;
  localMuted: boolean;
  localDeafened: boolean;
  localSpeaking: boolean;
  peers: Record<string, VoicePeer>;
  setConnected: (channelId: string | null) => void;
  setLocalMuted: (v: boolean) => void;
  setLocalDeafened: (v: boolean) => void;
  setLocalSpeaking: (v: boolean) => void;
  updatePeer: (userId: string, data: Partial<VoicePeer>) => void;
  removePeer: (userId: string) => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  connectedChannelId: null,
  localMuted: false,
  localDeafened: false,
  localSpeaking: false,
  peers: {},
  setConnected: (connectedChannelId) => set({ connectedChannelId }),
  setLocalMuted: (localMuted) => set({ localMuted }),
  setLocalDeafened: (localDeafened) =>
    set((s) => ({ localDeafened, localMuted: localDeafened ? true : s.localMuted })),
  setLocalSpeaking: (localSpeaking) => set({ localSpeaking }),
  updatePeer: (userId, data) =>
    set((s) => {
      const prev: VoicePeer = s.peers[userId] ?? {
        userId,
        muted: false,
        deafened: false,
        speaking: false,
      };
      return {
        peers: {
          ...s.peers,
          [userId]: { ...prev, ...data, userId },
        },
      };
    }),
  removePeer: (userId) =>
    set((s) => {
      const peers = { ...s.peers };
      delete peers[userId];
      return { peers };
    }),
  reset: () =>
    set({
      connectedChannelId: null,
      localMuted: false,
      localDeafened: false,
      localSpeaking: false,
      peers: {},
    }),
}));
