"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, setAccessToken } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { getChatSocket } from "@/hooks/use-socket";
import { Button, Input, Avatar } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { uploadUserAvatar } from "@/lib/user-assets";
import {
  areDesktopNotificationsEnabled,
  areNotificationSoundsEnabled,
  setDesktopNotificationsEnabled,
  setNotificationSoundsEnabled,
  playNotificationSound,
} from "@/lib/notification-prefs";
import { isPushAvailable, subscribeToPushNotifications } from "@/lib/push-notifications";
import type { UserStatus } from "@cubino/shared";

const STATUSES: { value: UserStatus; label: string; color: string }[] = [
  { value: "online", label: "Online", color: "bg-den-forest" },
  { value: "idle", label: "Idle", color: "bg-den-gold" },
  { value: "dnd", label: "Do Not Disturb", color: "bg-den-berry" },
  { value: "invisible", label: "Invisible", color: "bg-den-muted" },
];

export function UserSettingsModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAppStore((s) => s.user);
  const activeDenId = useAppStore((s) => s.activeDenId);
  const dens = useAppStore((s) => s.dens);
  const activeDen = dens.find((d) => d.id === activeDenId);
  const setUser = useAppStore((s) => s.setUser);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [customStatus, setCustomStatus] = useState(user?.customStatus ?? "");
  const [status, setStatus] = useState<UserStatus>(user?.status ?? "online");
  const [denNickname, setDenNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [desktopNotifications, setDesktopNotifications] = useState(true);
  const [notificationSounds, setNotificationSounds] = useState(true);
  const [pushAvailable, setPushAvailable] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAvatarUrl(user?.avatarUrl ?? null);
  }, [user?.avatarUrl]);

  useEffect(() => {
    setDesktopNotifications(areDesktopNotificationsEnabled());
    setNotificationSounds(areNotificationSoundsEnabled());
    void isPushAvailable().then(setPushAvailable);
  }, []);

  const { data: denMemberData, isLoading: nicknameLoading } = useQuery({
    queryKey: ["den-member-me", activeDenId],
    enabled: !!activeDenId,
    queryFn: () =>
      api<{ nickname: string | null }>(`/api/v1/dens/${activeDenId}/members/me`),
  });

  const { data: achievementsCatalog } = useQuery({
    queryKey: ["achievements-catalog"],
    queryFn: () =>
      api<{ achievements: { id: string; name: string; description: string }[] }>(
        "/api/v1/achievements"
      ),
    staleTime: Infinity,
  });

  const { data: myAchievements, isLoading: achievementsLoading } = useQuery({
    queryKey: ["my-achievements"],
    queryFn: () =>
      api<{ unlocked: { id: string; unlockedAt: string }[] }>(
        "/api/v1/users/me/achievements"
      ),
  });

  const unlockedAchievementIds = new Set(myAchievements?.unlocked.map((u) => u.id) ?? []);

  useEffect(() => {
    if (denMemberData !== undefined) {
      setDenNickname(denMemberData.nickname ?? "");
    }
  }, [denMemberData]);

  const save = async () => {
    if (!displayName.trim()) {
      setError("Display name is required");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api<{ user: NonNullable<typeof user> }>("/api/v1/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: displayName.trim(),
          bio: bio.trim() || null,
          customStatus: customStatus.trim() || null,
          status,
          avatarUrl: avatarUrl || null,
        }),
      });
      setUser(res.user);
      getChatSocket().emit("presence:set", { status });

      if (activeDenId) {
        await api(`/api/v1/dens/${activeDenId}/members/me`, {
          method: "PATCH",
          body: JSON.stringify({ nickname: denNickname.trim() || null }),
        });
        qc.invalidateQueries({ queryKey: ["members", activeDenId] });
        qc.invalidateQueries({ queryKey: ["den-member-me", activeDenId] });
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError((e as Error).message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    try {
      await api("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // still clear local session
    }
    setAccessToken(null);
    setUser(null);
    onClose();
    router.push("/login");
  };

  const handleAvatarChange = async (file: File | undefined) => {
    if (!file) return;
    setUploadingAvatar(true);
    setError(null);
    try {
      const url = await uploadUserAvatar(file);
      setAvatarUrl(url);
    } catch (e) {
      setError((e as Error).message || "Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <Modal onClose={onClose} className="max-w-md" labelledById="user-settings-title">
      <div className="flex max-h-[90vh] flex-col overflow-hidden">
        <div className="border-b border-black/20 px-5 py-4">
          <h2 id="user-settings-title" className="text-lg font-bold text-den-cream">
            User Settings
          </h2>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-den-muted">Avatar</p>
            <div className="flex items-center gap-4">
              <Avatar
                name={displayName || user?.username || "?"}
                src={avatarUrl}
                size={64}
                status={status === "invisible" ? "offline" : status}
              />
              <div className="flex flex-col gap-2">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  aria-label="Upload avatar image"
                  onChange={(e) => void handleAvatarChange(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs"
                  disabled={uploadingAvatar || saving}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {uploadingAvatar ? "Uploading..." : "Change avatar"}
                </Button>
                {avatarUrl && (
                  <button
                    type="button"
                    className="text-left text-xs text-den-berry hover:underline"
                    disabled={uploadingAvatar || saving}
                    onClick={() => setAvatarUrl(null)}
                  >
                    Remove avatar
                  </button>
                )}
              </div>
            </div>
          </div>
          <div>
            <label htmlFor="user-display-name" className="mb-1 block text-xs font-semibold uppercase text-den-muted">
              Display name
            </label>
            <Input
              id="user-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="user-bio" className="mb-1 block text-xs font-semibold uppercase text-den-muted">
              Bio
            </label>
            <Input
              id="user-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell the pride about yourself"
            />
          </div>
          <div>
            <label htmlFor="user-custom-status" className="mb-1 block text-xs font-semibold uppercase text-den-muted">
              Custom status
            </label>
            <Input
              id="user-custom-status"
              value={customStatus}
              onChange={(e) => setCustomStatus(e.target.value)}
              placeholder="What's on your mind?"
            />
          </div>

          {activeDenId && activeDen && (
            <div>
              <label htmlFor="den-nickname" className="mb-1 block text-xs font-semibold uppercase text-den-muted">
                Nickname in {activeDen.name}
              </label>
              <Input
                id="den-nickname"
                value={denNickname}
                onChange={(e) => setDenNickname(e.target.value)}
                placeholder="Override your name in this Den only"
                maxLength={64}
                disabled={nicknameLoading}
              />
              <p className="mt-1 text-[10px] text-den-muted">
                Leave blank to use your global display name
              </p>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-den-muted">Status</p>
            <div className="space-y-1" role="radiogroup" aria-label="Online status">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={status === s.value}
                  onClick={() => setStatus(s.value)}
                  className={`flex w-full items-center gap-2 rounded-den px-3 py-2 text-sm hover:bg-den-elevated ${
                    status === s.value ? "bg-den-elevated text-den-cream" : "text-den-muted"
                  }`}
                >
                  <span className={`h-3 w-3 rounded-full ${s.color}`} aria-hidden="true" />
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-white/10 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase text-den-muted">Achievements</p>
            {achievementsLoading && (
              <p className="text-sm text-den-muted">Loading achievements...</p>
            )}
            {!achievementsLoading && (
              <ul className="space-y-2" aria-label="Your achievements">
                {(achievementsCatalog?.achievements ?? []).map((achievement) => {
                  const unlocked = unlockedAchievementIds.has(achievement.id);
                  return (
                    <li
                      key={achievement.id}
                      className={`rounded-den border px-3 py-2 ${
                        unlocked
                          ? "border-den-gold/40 bg-den-gold/10"
                          : "border-white/10 bg-den-elevated/50 opacity-70"
                      }`}
                    >
                      <p className="text-sm font-semibold text-den-cream">{achievement.name}</p>
                      <p className="text-xs text-den-muted">{achievement.description}</p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-den-muted">
                        {unlocked ? "Unlocked" : "Locked"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-white/10 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase text-den-muted">Notifications</p>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-den-cream">
              <input
                type="checkbox"
                checked={desktopNotifications}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setDesktopNotifications(enabled);
                  setDesktopNotificationsEnabled(enabled);
                }}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Desktop notifications</span>
                <span className="mt-0.5 block text-xs text-den-muted">
                  Show browser alerts for new messages and mentions. Do Not Disturb always silences
                  alerts.
                </span>
              </span>
            </label>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-den-cream">
              <input
                type="checkbox"
                checked={notificationSounds}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setNotificationSounds(enabled);
                  setNotificationSoundsEnabled(enabled);
                  if (enabled) playNotificationSound("message");
                }}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Notification sounds</span>
                <span className="mt-0.5 block text-xs text-den-muted">
                  Play a short tone for messages, mentions, and DMs while the app is open.
                </span>
              </span>
            </label>
            {pushAvailable && (
              <div className="mt-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs"
                  disabled={pushLoading || pushSubscribed}
                  onClick={async () => {
                    setPushLoading(true);
                    try {
                      const ok = await subscribeToPushNotifications();
                      if (ok) setPushSubscribed(true);
                    } finally {
                      setPushLoading(false);
                    }
                  }}
                >
                  {pushSubscribed
                    ? "Background push enabled"
                    : pushLoading
                      ? "Enabling push..."
                      : "Enable background push"}
                </Button>
                <p className="mt-1 text-[10px] text-den-muted">
                  Receive notifications when Cubino is closed (requires server VAPID keys).
                </p>
              </div>
            )}
          </div>
          {error && <p className="text-sm text-den-berry">{error}</p>}
          {saved && <p className="text-sm text-den-forest">Settings saved!</p>}
        </div>
        <div className="flex justify-between border-t border-black/20 bg-[#2b2d31] px-5 py-3">
          <button type="button" onClick={logout} className="text-sm text-den-berry hover:underline">
            Log out
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-den px-4 py-2 text-sm text-den-muted">
              Cancel
            </button>
            <Button type="button" onClick={save} disabled={saving || nicknameLoading || uploadingAvatar}>
              {saving ? "Saving..." : saved ? "Saved!" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
