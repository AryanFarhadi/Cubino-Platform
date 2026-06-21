"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppStore } from "@/stores/app-store";
import { useUnreadStore } from "@/stores/unread-store";
import {
  navigateToNotificationTarget,
  parseDeepLinkSearchParams,
} from "@/lib/notification-nav";

/** Opens the correct channel/DM when landing on /app with push deep-link query params. */
export function useNotificationDeepLink(enabled: boolean) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledRef = useRef(false);

  const activeDenId = useAppStore((s) => s.activeDenId);
  const setActiveDenId = useAppStore((s) => s.setActiveDenId);
  const setActiveChannelId = useAppStore((s) => s.setActiveChannelId);
  const setActiveDmId = useAppStore((s) => s.setActiveDmId);
  const setDmOpen = useAppStore((s) => s.setDmOpen);
  const setChannels = useAppStore((s) => s.setChannels);
  const clearDm = useUnreadStore((s) => s.clearDm);
  const clearChannel = useUnreadStore((s) => s.clearChannel);

  useEffect(() => {
    if (!enabled || handledRef.current) return;
    const target = parseDeepLinkSearchParams(searchParams);
    if (!target) return;
    handledRef.current = true;

    void navigateToNotificationTarget(target, {
      activeDenId,
      setActiveDenId,
      setActiveChannelId,
      setActiveDmId,
      setDmOpen,
      setChannels,
      clearDm,
      clearChannel,
    }).finally(() => {
      router.replace("/app", { scroll: false });
    });
  }, [
    enabled,
    searchParams,
    activeDenId,
    router,
    setActiveDenId,
    setActiveChannelId,
    setActiveDmId,
    setDmOpen,
    setChannels,
    clearDm,
    clearChannel,
  ]);
}
