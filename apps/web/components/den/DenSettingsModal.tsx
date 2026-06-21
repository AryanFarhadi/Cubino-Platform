"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { uploadDenImage, uploadDenBanner, resolveDenAssetUrl } from "@/lib/den-assets";
import { Button, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { LionLoader } from "@/components/ui/lion";
import type { DenDTO } from "@cubino/shared";

type DenDetails = DenDTO & {
  bannerUrl?: string | null;
  welcomeMessage?: string | null;
  isPublic?: boolean;
};

type NotificationLevel = "all" | "mentions" | "none";

const NOTIFICATION_OPTIONS: { value: NotificationLevel; label: string; hint: string }[] = [
  { value: "all", label: "All messages", hint: "Unread badges and notifications for every message" },
  { value: "mentions", label: "Mentions only", hint: "Only @mentions and @everyone notify you" },
  { value: "none", label: "Nothing", hint: "Mute all notifications from this Den" },
];

export function DenSettingsModal({
  denId,
  den,
  onClose,
  onOpenInvite,
  onOpenModeration,
  onOpenRoles,
  showInviteLink = false,
  showModerationLink = false,
  showRolesLink = false,
  canManageDen = false,
}: {
  denId: string;
  den: DenDTO;
  onClose: () => void;
  onOpenInvite?: () => void;
  onOpenModeration?: () => void;
  onOpenRoles?: () => void;
  showInviteLink?: boolean;
  showModerationLink?: boolean;
  showRolesLink?: boolean;
  canManageDen?: boolean;
}) {
  const setDens = useAppStore((s) => s.setDens);
  const dens = useAppStore((s) => s.dens);
  const [name, setName] = useState(den.name);
  const [description, setDescription] = useState(den.description ?? "");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [iconUrl, setIconUrl] = useState<string | null>(den.iconUrl);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [notificationLevel, setNotificationLevel] = useState<NotificationLevel>("all");
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [iconError, setIconError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const { data: denDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ["den-details", denId],
    queryFn: () => api<{ den: DenDetails }>(`/api/v1/dens/${denId}`),
  });

  const { data: notificationSettings, isLoading: notificationLoading } = useQuery({
    queryKey: ["den-notification-settings", denId],
    queryFn: () => api<{ level: NotificationLevel }>(`/api/v1/dens/${denId}/notification-settings`),
  });

  const { data: mutedChannelsData, isLoading: mutedChannelsLoading } = useQuery({
    queryKey: ["muted-channels", denId],
    queryFn: () =>
      api<{ channelIds: string[]; channels: { id: string; name: string }[] }>(
        `/api/v1/dens/${denId}/muted-channels`
      ),
  });

  const unmuteChannel = useMutation({
    mutationFn: (channelId: string) =>
      api<{ muted: boolean }>(`/api/v1/channels/${channelId}/mute`, {
        method: "PUT",
        body: JSON.stringify({ muted: false }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["muted-channels", denId] });
      qc.invalidateQueries({ queryKey: ["unread-summary"] });
    },
  });

  useEffect(() => {
    if (denDetails?.den) {
      setBannerUrl(denDetails.den.bannerUrl ?? null);
      setIsPublic(!!denDetails.den.isPublic);
      setWelcomeMessage(denDetails.den.welcomeMessage ?? "");
    }
  }, [denDetails]);

  useEffect(() => {
    if (notificationSettings?.level) {
      setNotificationLevel(notificationSettings.level);
    }
  }, [notificationSettings]);

  const save = useMutation({
    mutationFn: async () => {
      const denRes = await api<{ den: DenDetails }>(`/api/v1/dens/${denId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          description,
          iconUrl,
          bannerUrl,
          ...(canManageDen ? { isPublic, welcomeMessage: welcomeMessage.trim() || null } : {}),
        }),
      });
      await api(`/api/v1/dens/${denId}/notification-settings`, {
        method: "PATCH",
        body: JSON.stringify({ level: notificationLevel }),
      });
      return denRes;
    },
    onSuccess: (res) => {
      setDens(
        dens.map((d) =>
          d.id === denId
            ? {
                ...d,
                name: res.den.name,
                description: res.den.description,
                iconUrl: res.den.iconUrl,
              }
            : d
        )
      );
      qc.invalidateQueries({ queryKey: ["den-details", denId] });
      qc.invalidateQueries({ queryKey: ["den-notification-settings", denId] });
      qc.invalidateQueries({ queryKey: ["notification-settings-all"] });
      qc.invalidateQueries({ queryKey: ["unread-summary"] });
      qc.invalidateQueries({ queryKey: ["channels", denId] });
      onClose();
    },
  });

  const handleIconPick = async (file: File | undefined) => {
    if (!file) return;
    setIconError(null);
    setUploadingIcon(true);
    try {
      setIconUrl(await uploadDenImage(file, denId));
    } catch (e) {
      setIconError((e as Error).message);
    } finally {
      setUploadingIcon(false);
      if (iconInputRef.current) iconInputRef.current.value = "";
    }
  };

  const handleBannerPick = async (file: File | undefined) => {
    if (!file) return;
    setBannerError(null);
    setUploadingBanner(true);
    try {
      setBannerUrl(await uploadDenBanner(file, denId));
    } catch (e) {
      setBannerError((e as Error).message);
    } finally {
      setUploadingBanner(false);
      if (bannerInputRef.current) bannerInputRef.current.value = "";
    }
  };

  const hasQuickLinks = showInviteLink || showModerationLink || showRolesLink;
  const iconPreview = resolveDenAssetUrl(iconUrl);
  const bannerPreview = resolveDenAssetUrl(bannerUrl);
  const settingsLoading = detailsLoading || notificationLoading;
  const mutedChannels = mutedChannelsData?.channels ?? [];
  const uploading = uploadingIcon || uploadingBanner;

  return (
    <Modal onClose={onClose} labelledById="den-settings-title">
      <div className="max-h-[85vh] overflow-y-auto p-6">
        <h3 id="den-settings-title" className="text-lg font-bold text-den-cream">
          Den settings
        </h3>

        {settingsLoading ? (
          <div className="mt-8 flex flex-col items-center gap-2 py-6">
            <LionLoader />
            <p className="text-xs text-den-muted">Loading settings...</p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs text-den-muted">Den icon</p>
              <div className="mt-2 flex items-center gap-3">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-den-elevated text-lg font-bold text-den-cream"
                  aria-hidden="true"
                >
                  {iconPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={iconPreview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    name.slice(0, 2).toUpperCase() || "DN"
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <input
                    ref={iconInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    id="den-icon-upload"
                    onChange={(e) => handleIconPick(e.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-xs"
                    disabled={uploadingIcon}
                    onClick={() => iconInputRef.current?.click()}
                  >
                    {uploadingIcon ? "Uploading..." : "Upload icon"}
                  </Button>
                  {iconUrl && (
                    <button
                      type="button"
                      onClick={() => setIconUrl(null)}
                      className="ml-2 text-xs text-den-muted hover:text-den-berry"
                    >
                      Remove
                    </button>
                  )}
                  <p className="mt-1 text-[10px] text-den-muted">PNG, JPEG, WebP, or GIF · max 512 KB</p>
                </div>
              </div>
              {iconError && <p className="mt-1 text-xs text-den-berry">{iconError}</p>}
            </div>

            {canManageDen && (
              <div>
                <p className="text-xs text-den-muted">Banner image</p>
                <div className="mt-2 overflow-hidden rounded-den border border-white/10 bg-den-elevated">
                  {bannerPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={bannerPreview} alt="" className="h-24 w-full object-cover" />
                  ) : (
                    <div className="flex h-24 items-center justify-center text-xs text-den-muted">
                      No banner uploaded
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    ref={bannerInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    id="den-banner-upload"
                    onChange={(e) => handleBannerPick(e.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-xs"
                    disabled={uploadingBanner}
                    onClick={() => bannerInputRef.current?.click()}
                  >
                    {uploadingBanner ? "Uploading..." : "Upload banner"}
                  </Button>
                  {bannerUrl && (
                    <button
                      type="button"
                      onClick={() => setBannerUrl(null)}
                      className="text-xs text-den-muted hover:text-den-berry"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-den-muted">Recommended wide image · max 2 MB</p>
                {bannerError && <p className="mt-1 text-xs text-den-berry">{bannerError}</p>}
              </div>
            )}

            <div>
              <label htmlFor="den-name" className="text-xs text-den-muted">
                Name
              </label>
              <Input
                id="den-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="den-description" className="text-xs text-den-muted">
                Description
              </label>
              <Input
                id="den-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1"
              />
            </div>

            {canManageDen && (
              <div>
                <label htmlFor="den-welcome-message" className="text-xs text-den-muted">
                  Welcome message
                </label>
                <Input
                  id="den-welcome-message"
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  placeholder="Shown when new members join #welcome"
                  className="mt-1"
                  maxLength={500}
                />
                <p className="mt-1 text-[10px] text-den-muted">
                  Posted in #welcome when someone joins. Falls back to the description if empty.
                </p>
                {(welcomeMessage.trim() || description.trim()) && (
                  <div className="mt-2 rounded-den border border-white/10 bg-den-elevated/60 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase text-den-muted">Preview</p>
                    <p className="mt-1 text-xs text-den-cream">
                      Welcome <span className="font-medium">NewMember</span> to{" "}
                      <span className="font-medium">{name || "Your Den"}</span>!{" "}
                      {welcomeMessage.trim() || description.trim()}
                    </p>
                  </div>
                )}
              </div>
            )}

            {canManageDen && (
              <label className="flex cursor-pointer items-start gap-2 text-sm text-den-cream">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Public Den</span>
                  <span className="mt-0.5 block text-xs text-den-muted">
                    Anyone can discover and join without an invite link
                  </span>
                </span>
              </label>
            )}

            <div className="border-t border-white/10 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-den-muted">
                Notifications
              </p>
              <fieldset className="mt-2 space-y-2">
                <legend className="sr-only">Notification level for this Den</legend>
                {NOTIFICATION_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-start gap-2 rounded-den px-2 py-1.5 hover:bg-den-elevated/60"
                  >
                    <input
                      type="radio"
                      name="notification-level"
                      value={opt.value}
                      checked={notificationLevel === opt.value}
                      onChange={() => setNotificationLevel(opt.value)}
                      className="mt-1"
                    />
                    <span>
                      <span className="text-sm text-den-cream">{opt.label}</span>
                      <span className="mt-0.5 block text-xs text-den-muted">{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <div className="mt-4">
                <p className="text-xs font-medium text-den-cream">Muted channels</p>
                <p className="mt-0.5 text-xs text-den-muted">
                  Channels you muted will not send notifications or unread badges.
                </p>
                {mutedChannelsLoading ? (
                  <p className="mt-2 text-xs text-den-muted">Loading muted channels...</p>
                ) : mutedChannels.length === 0 ? (
                  <p className="mt-2 text-xs text-den-muted">No muted channels in this Den.</p>
                ) : (
                  <ul className="mt-2 space-y-1" aria-label="Muted channels">
                    {mutedChannels.map((ch) => (
                      <li
                        key={ch.id}
                        className="flex items-center justify-between gap-2 rounded-den px-2 py-1.5 hover:bg-den-elevated/60"
                      >
                        <span className="truncate text-sm text-den-cream">#{ch.name}</span>
                        <button
                          type="button"
                          onClick={() => unmuteChannel.mutate(ch.id)}
                          disabled={unmuteChannel.isPending}
                          className="shrink-0 text-xs text-den-honey hover:underline disabled:opacity-50"
                          aria-label={`Unmute ${ch.name}`}
                        >
                          Unmute
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {hasQuickLinks && (
          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-den-muted">
              Management
            </p>
            <div className="flex flex-col gap-1">
              {showInviteLink && onOpenInvite && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenInvite();
                  }}
                  className="rounded-den px-3 py-2 text-left text-sm text-den-cream hover:bg-den-elevated"
                >
                  Invite people
                </button>
              )}
              {showModerationLink && onOpenModeration && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenModeration();
                  }}
                  className="rounded-den px-3 py-2 text-left text-sm text-den-cream hover:bg-den-elevated"
                >
                  Moderation
                </button>
              )}
              {showRolesLink && onOpenRoles && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenRoles();
                  }}
                  className="rounded-den px-3 py-2 text-left text-sm text-den-cream hover:bg-den-elevated"
                >
                  Manage roles
                </button>
              )}
            </div>
          </div>
        )}

        {save.isError && (
          <p className="mt-2 text-sm text-den-berry">{(save.error as Error).message}</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-sm text-den-muted">
            Cancel
          </button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || uploading || settingsLoading}
          >
            {save.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
