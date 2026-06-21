const DESKTOP_NOTIFICATIONS_KEY = "cubino_desktop_notifications";
const NOTIFICATION_SOUNDS_KEY = "cubino_notification_sounds";

export function areDesktopNotificationsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(DESKTOP_NOTIFICATIONS_KEY) !== "false";
}

export function setDesktopNotificationsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DESKTOP_NOTIFICATIONS_KEY, enabled ? "true" : "false");
}

export function areNotificationSoundsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(NOTIFICATION_SOUNDS_KEY) !== "false";
}

export function setNotificationSoundsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(NOTIFICATION_SOUNDS_KEY, enabled ? "true" : "false");
}

export type NotificationSoundKind = "message" | "mention" | "dm";

/** Short tone via Web Audio API — no external sound files required. */
export function playNotificationSound(kind: NotificationSoundKind): void {
  if (typeof window === "undefined") return;
  if (!areNotificationSoundsEnabled()) return;

  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    const frequencies: Record<NotificationSoundKind, number> = {
      message: 440,
      mention: 587,
      dm: 523,
    };

    oscillator.frequency.value = frequencies[kind];
    oscillator.type = "sine";
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.2);
    oscillator.onended = () => void ctx.close();
  } catch {
    /* Audio blocked or unavailable — ignore */
  }
}
