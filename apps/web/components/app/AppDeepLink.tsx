"use client";

import { Suspense } from "react";
import { useNotificationDeepLink } from "@/hooks/use-notification-deep-link";

function NotificationDeepLinkHandler({ enabled }: { enabled: boolean }) {
  useNotificationDeepLink(enabled);
  return null;
}

export function AppDeepLink({ enabled }: { enabled: boolean }) {
  return (
    <Suspense fallback={null}>
      <NotificationDeepLinkHandler enabled={enabled} />
    </Suspense>
  );
}
