"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { resolveDenAssetUrl } from "@/lib/den-assets";
import { useSocketConnect } from "@/hooks/use-socket";
import { useSocketStatus } from "@/hooks/use-socket-status";
import { useSocketRejoin } from "@/hooks/use-socket-rejoin";
import { usePresence } from "@/hooks/use-presence";
import { useUnreadSync } from "@/hooks/use-unread-sync";
import { useUnreadStore } from "@/stores/unread-store";
import { DenRail } from "@/components/den/DenRail";
import { ChannelSidebar } from "@/components/den/ChannelSidebar";
import { MemberPanel } from "@/components/den/MemberPanel";
import { UserBar } from "@/components/den/UserBar";
import { VoiceBar } from "@/components/den/VoiceBar";
import { ChatView } from "@/components/chat/ChatView";
import { DmPanel } from "@/components/chat/DmPanel";
import { SearchModal } from "@/components/search/SearchModal";
import { IconMenu, IconSearch, IconUsers, IconPin, IconShield, IconBell, IconBellOff } from "@/components/ui/icons";
import { LionLoader } from "@/components/ui/lion";
import { ConnectionBanner } from "@/components/ui/ConnectionBanner";
import type { UserPublic, DenDTO } from "@cubino/shared";
import { Permission } from "@cubino/shared";
import {
  useCanManageDen,
  useCanManageMessages,
  useHasDenPermission,
} from "@/hooks/use-den-permissions";
import { AppDeepLink } from "@/components/app/AppDeepLink";
import { AchievementToastHost } from "@/components/achievements/AchievementToastHost";

export default function AppPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const clearChannel = useUnreadStore((s) => s.clearChannel);
  const setUser = useAppStore((s) => s.setUser);
  const setDens = useAppStore((s) => s.setDens);
  const activeDmId = useAppStore((s) => s.activeDmId);
  const dmOpen = useAppStore((s) => s.dmOpen);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const mobileMembersOpen = useAppStore((s) => s.mobileMembersOpen);
  const setMobileMembersOpen = useAppStore((s) => s.setMobileMembersOpen);
  const activeDenId = useAppStore((s) => s.activeDenId);
  const dens = useAppStore((s) => s.dens);
  const channels = useAppStore((s) => s.channels);
  const activeChannelId = useAppStore((s) => s.activeChannelId);

  const activeDen = dens.find((d) => d.id === activeDenId);
  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const mobileTitle = activeChannel
    ? `#${activeChannel.name}`
    : activeDen?.name ?? "Select a Den";
  const mobileSubtitle = activeChannel && activeDen ? activeDen.name : null;

  const canBan = useHasDenPermission(activeDenId, Permission.BAN_MEMBERS);
  const canManageMessages = useCanManageMessages(activeDenId);
  const canManageDen = useCanManageDen(activeDenId);
  const showModerationButton = canBan || canManageMessages || canManageDen;

  const { data: openReportCountData } = useQuery({
    queryKey: ["den-reports-count", activeDenId],
    enabled: !!activeDenId && canManageMessages,
    queryFn: () => api<{ count: number }>(`/api/v1/dens/${activeDenId}/reports/count`),
  });
  const openReportCount = openReportCountData?.count ?? 0;

  const { data: mobileDenDetails } = useQuery({
    queryKey: ["den-details", activeDenId],
    enabled: !!activeDenId && !dmOpen && !activeDmId,
    queryFn: () =>
      api<{ den: { bannerUrl?: string | null } }>(`/api/v1/dens/${activeDenId}`),
  });

  const mobileBannerSrc = resolveDenAssetUrl(mobileDenDetails?.den.bannerUrl);

  const { data: channelMuteData } = useQuery({
    queryKey: ["channel-mute", activeChannelId],
    enabled: !!activeChannelId && !dmOpen && !activeDmId,
    queryFn: () => api<{ muted: boolean }>(`/api/v1/channels/${activeChannelId}/mute`),
  });

  const toggleChannelMute = useMutation({
    mutationFn: (muted: boolean) =>
      api<{ muted: boolean }>(`/api/v1/channels/${activeChannelId}/mute`, {
        method: "PUT",
        body: JSON.stringify({ muted }),
      }),
    onSuccess: (res) => {
      qc.setQueryData(["channel-mute", activeChannelId], res);
      qc.invalidateQueries({ queryKey: ["muted-channels", activeDenId] });
      qc.invalidateQueries({ queryKey: ["unread-summary"] });
      if (res.muted && activeChannelId) clearChannel(activeChannelId);
    },
  });

  const isChannelMuted = channelMuteData?.muted ?? false;

  const { isLoading, isError } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const me = await api<{ user: UserPublic }>("/api/v1/auth/me");
      setUser(me.user);
      const densRes = await api<{ dens: DenDTO[] }>("/api/v1/dens");
      setDens(densRes.dens);
      const onboarded = localStorage.getItem("cubino_onboarded");
      if (!onboarded && densRes.dens.length === 0) {
        router.push("/onboarding");
      }
      return me;
    },
    retry: false,
  });

  const socketEnabled = !isLoading && !isError;
  useSocketConnect(socketEnabled);
  const socketStatus = useSocketStatus(socketEnabled);
  useSocketRejoin(socketEnabled);
  usePresence();
  useUnreadSync();

  useEffect(() => {
    if (isError) router.push("/login");
  }, [isError, router]);

  useEffect(() => {
    const openMembers = () => setMobileMembersOpen(true);
    window.addEventListener("cubino:open-members", openMembers);
    return () => window.removeEventListener("cubino:open-members", openMembers);
  }, [setMobileMembersOpen]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-den-darker">
        <LionLoader />
      </div>
    );
  }

  const showDenUi = !dmOpen && !activeDmId;

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <AppDeepLink enabled={socketEnabled} />
      <AchievementToastHost enabled={socketEnabled} />
      <DenRail />
      <div className="relative flex min-w-0 flex-1 flex-col">
        {showDenUi && (
          <>
            {mobileBannerSrc && (
              <div className="relative h-10 shrink-0 overflow-hidden lg:hidden" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mobileBannerSrc} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-den-surface/80" />
              </div>
            )}
          <div className="flex h-12 items-center gap-1 border-b border-black/20 bg-den-surface px-2 lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded p-2 text-den-cream hover:bg-den-elevated"
              aria-label="Open channels"
            >
              <IconMenu />
            </button>
            <div
              className="flex min-w-0 flex-1 items-center gap-2 px-1"
              title={mobileSubtitle ? `${mobileSubtitle} · ${mobileTitle}` : mobileTitle}
            >
              {activeDen && resolveDenAssetUrl(activeDen.iconUrl) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveDenAssetUrl(activeDen.iconUrl)!}
                  alt=""
                  className="h-7 w-7 shrink-0 rounded-xl object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight text-den-cream">
                  {mobileTitle}
                </p>
                {mobileSubtitle && (
                  <p className="truncate text-[11px] leading-tight text-den-muted">{mobileSubtitle}</p>
                )}
              </div>
            </div>
            {activeChannelId && (
              <>
                <button
                  type="button"
                  onClick={() => toggleChannelMute.mutate(!isChannelMuted)}
                  disabled={toggleChannelMute.isPending}
                  title={isChannelMuted ? "Unmute channel" : "Mute channel"}
                  aria-label={
                    isChannelMuted
                      ? "Unmute notifications for this channel"
                      : "Mute notifications for this channel"
                  }
                  aria-pressed={isChannelMuted}
                  className={`rounded p-2 hover:bg-den-elevated ${
                    isChannelMuted ? "text-den-berry" : "text-den-cream"
                  }`}
                >
                  {isChannelMuted ? <IconBellOff /> : <IconBell />}
                </button>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event("cubino:open-pins"))}
                  title="Pinned messages"
                  aria-label="View pinned messages"
                  className="rounded p-2 text-den-cream hover:bg-den-elevated"
                >
                  <IconPin />
                </button>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event("cubino:open-search"))}
                  title="Search messages (Ctrl+K)"
                  aria-label="Search messages in this channel"
                  className="rounded p-2 text-den-cream hover:bg-den-elevated"
                >
                  <IconSearch />
                </button>
              </>
            )}
            {(dmOpen || activeDmId) && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event("cubino:open-search"))}
                title="Search messages (Ctrl+K)"
                aria-label="Search messages in this conversation"
                className="rounded p-2 text-den-cream hover:bg-den-elevated"
              >
                <IconSearch />
              </button>
            )}
            {showModerationButton && activeDenId && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event("cubino:open-moderation"))}
                title="Moderation"
                aria-label="Open moderation"
                className="relative rounded p-2 text-den-cream hover:bg-den-elevated"
              >
                <IconShield />
                {openReportCount > 0 && (
                  <span
                    className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-den-berry px-0.5 text-[9px] font-bold text-white"
                    aria-hidden="true"
                  >
                    {openReportCount > 9 ? "9+" : openReportCount}
                  </span>
                )}
              </button>
            )}
            {activeDenId && (
              <button
                onClick={() => setMobileMembersOpen(true)}
                className="rounded p-2 text-den-cream hover:bg-den-elevated"
                aria-label="Open members"
              >
                <IconUsers />
              </button>
            )}
          </div>
          </>
        )}
        <ConnectionBanner status={socketStatus} />
        <div className="flex min-h-0 flex-1">
          {showDenUi && (
            <>
              <div
                className={clsx(
                  "fixed inset-0 z-40 bg-black/50 lg:hidden",
                  sidebarOpen ? "block" : "hidden"
                )}
                onClick={() => setSidebarOpen(false)}
              />
              <div
                className={clsx(
                  "fixed inset-y-0 left-14 z-50 w-60 transform transition-transform lg:static lg:translate-x-0",
                  sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
                )}
              >
                <ChannelSidebar onNavigate={() => setSidebarOpen(false)} />
              </div>
            </>
          )}
          <main className="flex min-w-0 flex-1 flex-col">
            {dmOpen || activeDmId ? <DmPanel /> : <ChatView />}
          </main>
          {showDenUi && (
            <>
              <div className="hidden lg:flex">
                <MemberPanel />
              </div>
              {mobileMembersOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                    onClick={() => setMobileMembersOpen(false)}
                  />
                  <div className="fixed inset-y-0 right-0 z-50 w-60 lg:hidden">
                    <MemberPanel
                      mobile
                      onClose={() => setMobileMembersOpen(false)}
                      showModeration={showModerationButton}
                      openReportCount={openReportCount}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <VoiceBar />
        <UserBar />
      </div>
      <SearchModal />
    </div>
  );
}
