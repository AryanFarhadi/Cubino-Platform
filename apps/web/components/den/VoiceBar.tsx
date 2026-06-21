"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVoiceStore } from "@/stores/voice-store";
import { useAppStore } from "@/stores/app-store";
import { useVoice } from "@/hooks/use-voice";
import { api } from "@/lib/api";
import { memberDisplayName } from "@/lib/member-utils";
import type { MemberDTO } from "@cubino/shared";
import {
  IconMic,
  IconMicOff,
  IconHeadphones,
  IconHeadphonesOff,
  IconPhoneOff,
  IconVolume,
} from "@/components/ui/icons";

export function VoiceBar() {
  const connectedChannelId = useVoiceStore((s) => s.connectedChannelId);
  const localMuted = useVoiceStore((s) => s.localMuted);
  const localDeafened = useVoiceStore((s) => s.localDeafened);
  const localSpeaking = useVoiceStore((s) => s.localSpeaking);
  const peers = useVoiceStore((s) => s.peers);
  const channels = useAppStore((s) => s.channels);
  const user = useAppStore((s) => s.user);
  const { toggleMute, toggleDeafen, leaveVoice } = useVoice();
  const [participantsExpanded, setParticipantsExpanded] = useState(false);

  const channel = channels.find((c) => c.id === connectedChannelId);
  const denId = channel?.denId;

  const { data: membersData } = useQuery({
    queryKey: ["members", denId],
    enabled: !!denId && !!connectedChannelId,
    queryFn: () => api<{ members: MemberDTO[] }>(`/api/v1/dens/${denId}/members`),
    staleTime: 30_000,
  });

  if (!connectedChannelId) return null;

  const memberName = (userId: string) => {
    const member = membersData?.members.find((m) => m.id === userId);
    if (member) return memberDisplayName(member);
    if (userId === user?.id) return user.displayName;
    return "Member";
  };

  const connectedUserIds = [user?.id, ...Object.keys(peers)].filter(Boolean) as string[];
  const otherCount = Math.max(0, connectedUserIds.length - 1);
  const participantLabel =
    connectedUserIds.length <= 1
      ? "Just you"
      : connectedUserIds.length === 2
        ? `You and ${memberName(connectedUserIds.find((id) => id !== user?.id) ?? "")}`
        : `You and ${otherCount} others`;

  return (
    <div className="border-t border-den-forest/30 bg-[#1a3d2e] px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className={`shrink-0 ${localSpeaking ? "text-den-gold" : "text-den-forest"}`}>
            <IconVolume className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[#43b581]">Voice Connected</p>
            <p className="truncate text-sm font-medium text-den-cream">
              {channel?.name ?? "Voice channel"}
            </p>
            <p className="truncate text-[10px] text-den-muted">{participantLabel}</p>
          </div>
        </div>
        <button
          onClick={toggleMute}
          title={localMuted ? "Unmute" : "Mute"}
          aria-label={localMuted ? "Unmute microphone" : "Mute microphone"}
          className={`rounded-den p-2 transition-colors ${
            localMuted ? "bg-den-berry/25 text-den-berry" : "text-[#43b581] hover:bg-white/10"
          }`}
        >
          {localMuted ? <IconMicOff /> : <IconMic />}
        </button>
        <button
          onClick={toggleDeafen}
          title={localDeafened ? "Undeafen" : "Deafen"}
          aria-label={localDeafened ? "Undeafen" : "Deafen"}
          className={`rounded-den p-2 transition-colors ${
            localDeafened ? "bg-den-berry/25 text-den-berry" : "text-[#43b581] hover:bg-white/10"
          }`}
        >
          {localDeafened ? <IconHeadphonesOff /> : <IconHeadphones />}
        </button>
        <button
          onClick={leaveVoice}
          title="Disconnect"
          aria-label="Disconnect from voice channel"
          className="rounded-den p-2 text-den-berry transition-colors hover:bg-den-berry/20"
        >
          <IconPhoneOff className="h-5 w-5" />
        </button>
      </div>
      {connectedUserIds.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setParticipantsExpanded((v) => !v)}
            className="mt-1.5 w-full text-left text-[10px] font-medium text-den-muted hover:text-den-cream sm:hidden"
            aria-expanded={participantsExpanded}
            aria-controls="voice-participants"
          >
            {participantsExpanded ? "Hide participants" : `Show ${connectedUserIds.length} participants`}
          </button>
          <ul
            id="voice-participants"
            className={`mt-2 flex flex-wrap gap-1.5 border-t border-white/10 pt-2 ${
              participantsExpanded ? "" : "max-sm:hidden"
            }`}
            aria-label="Users in voice channel"
          >
          {connectedUserIds.map((uid) => {
            const isSelf = uid === user?.id;
            const peer = peers[uid];
            const speaking = isSelf ? localSpeaking : peer?.speaking;
            const muted = isSelf ? localMuted : peer?.muted;
            return (
              <li
                key={uid}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  speaking ? "bg-den-gold/20 text-den-gold" : "bg-white/10 text-den-muted"
                }`}
              >
                {memberName(uid)}
                {isSelf ? " (you)" : ""}
                {muted && !isSelf && " · muted"}
              </li>
            );
          })}
          </ul>
        </>
      )}
    </div>
  );
}
