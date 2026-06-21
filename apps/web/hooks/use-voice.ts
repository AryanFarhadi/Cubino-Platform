"use client";

import { useRef, useCallback } from "react";
import { getSignalSocket } from "@/hooks/use-socket";
import { useVoiceStore } from "@/stores/voice-store";
import { useAppStore } from "@/stores/app-store";

const MAX_PEERS = 4;
const SPEAK_THRESHOLD = 0.02;

export function useVoice() {
  const user = useAppStore((s) => s.user);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const vadRef = useRef<number | null>(null);
  const speakingRef = useRef(false);
  const signalCleanupRef = useRef<(() => void) | null>(null);

  const {
    connectedChannelId,
    setConnected,
    setLocalMuted,
    setLocalDeafened,
    setLocalSpeaking,
    updatePeer,
    removePeer,
    reset,
  } = useVoiceStore();

  const broadcastState = useCallback(
    (channelId: string, muted: boolean, deafened: boolean, speaking: boolean) => {
      getSignalSocket().emit("voice:state", {
        channelId,
        muted,
        deafened,
        speaking,
      });
    },
    []
  );

  const syncAudioSenders = useCallback((enabled: boolean) => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
    peersRef.current.forEach((pc) => {
      pc.getSenders().forEach((sender) => {
        if (sender.track?.kind === "audio") {
          sender.track.enabled = enabled;
        }
      });
    });
  }, []);

  const startVad = useCallback(
    (channelId: string, stream: MediaStream) => {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        const { localMuted, localDeafened } = useVoiceStore.getState();
        if (localMuted || localDeafened) {
          if (speakingRef.current) {
            speakingRef.current = false;
            setLocalSpeaking(false);
            broadcastState(channelId, localMuted, localDeafened, false);
          }
          vadRef.current = requestAnimationFrame(tick);
          return;
        }

        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
        const speaking = avg > SPEAK_THRESHOLD;
        if (speaking !== speakingRef.current) {
          speakingRef.current = speaking;
          setLocalSpeaking(speaking);
          broadcastState(channelId, localMuted, localDeafened, speaking);
        }
        vadRef.current = requestAnimationFrame(tick);
      };
      vadRef.current = requestAnimationFrame(tick);
    },
    [broadcastState, setLocalSpeaking]
  );

  const stopVad = useCallback(() => {
    if (vadRef.current) cancelAnimationFrame(vadRef.current);
    vadRef.current = null;
    speakingRef.current = false;
    setLocalSpeaking(false);
  }, [setLocalSpeaking]);

  const createPeer = useCallback(
    async (channelId: string, targetUserId: string, initiator: boolean) => {
      if (!user || peersRef.current.size >= MAX_PEERS) return;
      if (peersRef.current.has(targetUserId)) return;

      const { localMuted, localDeafened } = useVoiceStore.getState();
      const sendEnabled = !localMuted && !localDeafened;

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          ...(process.env.NEXT_PUBLIC_TURN_URLS?.split(",").map((urls) => ({
            urls,
            username: process.env.NEXT_PUBLIC_TURN_USERNAME,
            credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
          })) ?? []),
        ],
      });
      peersRef.current.set(targetUserId, pc);

      localStreamRef.current?.getTracks().forEach((track) => {
        if (track.kind === "audio") track.enabled = sendEnabled;
        pc.addTrack(track, localStreamRef.current!);
      });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          getSignalSocket().emit("signal:ice", {
            channelId,
            targetUserId,
            candidate: e.candidate,
          });
        }
      };

      pc.ontrack = (e) => {
        const audio = document.createElement("audio");
        audio.srcObject = e.streams[0];
        audio.autoplay = true;
        audio.id = `voice-${targetUserId}`;
        audio.muted = useVoiceStore.getState().localDeafened;
        document.body.appendChild(audio);
      };

      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        getSignalSocket().emit("signal:offer", {
          channelId,
          targetUserId,
          sdp: offer,
        });
      }
    },
    [user]
  );

  const leaveVoice = useCallback(() => {
    const ch = useVoiceStore.getState().connectedChannelId;
    const signal = getSignalSocket();

    if (ch) {
      broadcastState(ch, true, false, false);
      signal.emit("voice:leave", { channelId: ch });
    }

    signalCleanupRef.current?.();
    signalCleanupRef.current = null;

    stopVad();
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    document.querySelectorAll("audio[id^='voice-']").forEach((el) => el.remove());
    reset();
  }, [reset, stopVad, broadcastState]);

  const joinVoice = useCallback(
    async (channelId: string) => {
      if (connectedChannelId === channelId) return;

      if (connectedChannelId) {
        leaveVoice();
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        startVad(channelId, stream);
      } catch {
        alert("Microphone access denied");
        return;
      }

      const signal = getSignalSocket();
      signal.emit("voice:join", { channelId });
      setConnected(channelId);
      setLocalMuted(false);
      setLocalDeafened(false);
      broadcastState(channelId, false, false, false);

      signalCleanupRef.current?.();

      const onUserJoined = ({ userId }: { userId: string }) => {
        if (userId !== user?.id) {
          createPeer(channelId, userId, true);
          updatePeer(userId, { userId, muted: false, deafened: false, speaking: false });
        }
      };

      const onOffer = async ({
        fromUserId,
        targetUserId,
        sdp,
      }: {
        fromUserId: string;
        targetUserId: string;
        sdp: RTCSessionDescriptionInit;
      }) => {
        if (targetUserId !== user?.id) return;
        await createPeer(channelId, fromUserId, false);
        const pc = peersRef.current.get(fromUserId);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signal.emit("signal:answer", {
          channelId,
          targetUserId: fromUserId,
          sdp: answer,
        });
      };

      const onAnswer = async ({
        fromUserId,
        targetUserId,
        sdp,
      }: {
        fromUserId: string;
        targetUserId: string;
        sdp: RTCSessionDescriptionInit;
      }) => {
        if (targetUserId !== user?.id) return;
        const pc = peersRef.current.get(fromUserId);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      };

      const onIce = async ({
        fromUserId,
        targetUserId,
        candidate,
      }: {
        fromUserId: string;
        targetUserId: string;
        candidate: RTCIceCandidateInit;
      }) => {
        if (targetUserId !== user?.id) return;
        const pc = peersRef.current.get(fromUserId);
        if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
      };

      const onVoiceState = ({
        userId,
        muted,
        deafened,
        speaking,
      }: {
        userId: string;
        muted: boolean;
        deafened: boolean;
        speaking: boolean;
      }) => {
        updatePeer(userId, { userId, muted, deafened, speaking });
      };

      const onUserLeft = ({ userId }: { userId: string }) => {
        peersRef.current.get(userId)?.close();
        peersRef.current.delete(userId);
        document.getElementById(`voice-${userId}`)?.remove();
        removePeer(userId);
      };

      signal.on("voice:user-joined", onUserJoined);
      signal.on("signal:offer", onOffer);
      signal.on("signal:answer", onAnswer);
      signal.on("signal:ice", onIce);
      signal.on("voice:state", onVoiceState);
      signal.on("voice:user-left", onUserLeft);

      signalCleanupRef.current = () => {
        signal.off("voice:user-joined", onUserJoined);
        signal.off("signal:offer", onOffer);
        signal.off("signal:answer", onAnswer);
        signal.off("signal:ice", onIce);
        signal.off("voice:state", onVoiceState);
        signal.off("voice:user-left", onUserLeft);
      };
    },
    [
      user,
      connectedChannelId,
      createPeer,
      setConnected,
      setLocalMuted,
      setLocalDeafened,
      broadcastState,
      updatePeer,
      removePeer,
      leaveVoice,
      startVad,
    ]
  );

  const toggleMute = useCallback(() => {
    const ch = useVoiceStore.getState().connectedChannelId;
    if (!ch) return;

    const next = !useVoiceStore.getState().localMuted;
    setLocalMuted(next);

    if (next) {
      syncAudioSenders(false);
      speakingRef.current = false;
      setLocalSpeaking(false);
      broadcastState(ch, true, useVoiceStore.getState().localDeafened, false);
    } else if (!useVoiceStore.getState().localDeafened) {
      syncAudioSenders(true);
      broadcastState(ch, false, false, false);
    } else {
      broadcastState(ch, false, useVoiceStore.getState().localDeafened, false);
    }
  }, [setLocalMuted, setLocalSpeaking, broadcastState, syncAudioSenders]);

  const toggleDeafen = useCallback(() => {
    const ch = useVoiceStore.getState().connectedChannelId;
    if (!ch) return;

    const next = !useVoiceStore.getState().localDeafened;
    setLocalDeafened(next);

    if (next) {
      syncAudioSenders(false);
      speakingRef.current = false;
      setLocalSpeaking(false);
      document.querySelectorAll("audio[id^='voice-']").forEach((el) => {
        (el as HTMLAudioElement).muted = true;
      });
      broadcastState(ch, true, true, false);
    } else {
      setLocalMuted(false);
      syncAudioSenders(true);
      document.querySelectorAll("audio[id^='voice-']").forEach((el) => {
        (el as HTMLAudioElement).muted = false;
      });
      broadcastState(ch, false, false, false);
    }
  }, [setLocalDeafened, setLocalMuted, setLocalSpeaking, broadcastState, syncAudioSenders]);

  return { joinVoice, leaveVoice, toggleMute, toggleDeafen, connectedChannelId };
}
