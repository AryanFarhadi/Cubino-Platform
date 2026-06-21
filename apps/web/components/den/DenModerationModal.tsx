"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Permission, type UserPublic, type MemberDTO } from "@cubino/shared";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { memberDisplayName } from "@/lib/member-utils";
import {
  useCanManageDen,
  useCanManageMessages,
  useHasDenPermission,
} from "@/hooks/use-den-permissions";
import { Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { LionLoader } from "@/components/ui/lion";

type ModerationTab = "bans" | "reports" | "audit";

type BanRow = {
  id: string;
  userId: string;
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
  user: UserPublic;
};

type ReportRow = {
  id: string;
  messageId: string;
  channelId: string;
  messageContent: string;
  reason: string;
  status: string;
  createdAt: string;
  reporter: UserPublic;
};

type AuditRow = {
  id: string;
  userId: string;
  action: string;
  targetId: string | null;
  metadata: string | null;
  createdAt: string;
  actor: UserPublic;
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAuditMetadata(action: string, metadata: string | null): string | null {
  if (!metadata) return null;
  if (action === "BAN") {
    try {
      const parsed = JSON.parse(metadata) as { reason?: string | null; duration?: string };
      const parts: string[] = [];
      if (parsed.duration) {
        parts.push(
          parsed.duration === "permanent"
            ? "Permanent ban"
            : `Duration: ${parsed.duration}`
        );
      }
      if (parsed.reason) parts.push(`Reason: ${parsed.reason}`);
      return parts.length > 0 ? parts.join(" · ") : null;
    } catch {
      return metadata.startsWith("{") ? null : `Reason: ${metadata}`;
    }
  }
  if (action.startsWith("REPORT_")) {
    try {
      const parsed = JSON.parse(metadata) as { reason?: string; preview?: string };
      const parts: string[] = [];
      if (parsed.reason) parts.push(`Reason: ${parsed.reason}`);
      if (parsed.preview) parts.push(`"${parsed.preview}"`);
      return parts.length > 0 ? parts.join(" · ") : null;
    } catch {
      return null;
    }
  }
  return metadata;
}

const MEMBER_AUDIT_ACTIONS = new Set(["BAN", "KICK", "UNBAN"]);

function formatAuditAction(action: string): string {
  if (action === "REPORT_RESOLVED") return "resolved a report";
  if (action === "REPORT_DISMISSED") return "dismissed a report";
  return action.toLowerCase().replace(/_/g, " ");
}

function BansTab({ denId }: { denId: string }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["den-bans", denId],
    queryFn: () => api<{ bans: BanRow[] }>(`/api/v1/dens/${denId}/bans`),
  });

  const unban = useMutation({
    mutationFn: (banId: string) =>
      api(`/api/v1/dens/${denId}/bans/${banId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["den-bans", denId] }),
  });

  const bans = data?.bans ?? [];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2 py-10">
        <LionLoader />
        <p className="text-xs text-den-muted">Loading bans...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-den-cream">Could not load bans</p>
        <p className="mt-1 text-xs text-den-muted">{(error as Error).message}</p>
        <Button variant="ghost" className="mt-3 text-xs" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (bans.length === 0) {
    return <p className="py-10 text-center text-sm text-den-muted">No active bans</p>;
  }

  return (
    <ul className="space-y-2">
      {bans.map((ban) => {
        const expired = ban.expiresAt && new Date(ban.expiresAt) <= new Date();
        return (
          <li
            key={ban.id}
            className="rounded-den border border-white/10 bg-den-elevated/60 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-den-cream">{ban.user.displayName}</p>
                <p className="text-xs text-den-muted">@{ban.user.username}</p>
                {ban.reason && (
                  <p className="mt-1 text-xs text-den-muted">Reason: {ban.reason}</p>
                )}
                <p className="mt-1 text-[10px] text-den-muted">
                  Banned {formatWhen(ban.createdAt)}
                  {ban.expiresAt
                    ? expired
                      ? " · expired"
                      : ` · until ${formatWhen(ban.expiresAt)}`
                    : " · permanent"}
                </p>
              </div>
              <Button
                variant="ghost"
                className="shrink-0 px-2 py-1 text-xs"
                disabled={unban.isPending}
                onClick={() => {
                  if (confirm(`Unban ${ban.user.displayName}?`)) {
                    unban.mutate(ban.id);
                  }
                }}
              >
                Unban
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ReportsTab({ denId, onClose }: { denId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const channels = useAppStore((s) => s.channels);
  const setActiveChannelId = useAppStore((s) => s.setActiveChannelId);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["den-reports", denId],
    queryFn: () => api<{ reports: ReportRow[] }>(`/api/v1/dens/${denId}/reports`),
  });

  const resolveReport = useMutation({
    mutationFn: ({ reportId, status }: { reportId: string; status: "resolved" | "dismissed" }) =>
      api(`/api/v1/dens/${denId}/reports/${reportId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["den-reports", denId] });
      qc.invalidateQueries({ queryKey: ["den-reports-count", denId] });
    },
  });

  const channelName = (channelId: string) =>
    channels.find((c) => c.id === channelId)?.name ?? "channel";

  const jumpToMessage = (report: ReportRow) => {
    setActiveChannelId(report.channelId);
    onClose();
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("cubino:scroll-to-message", {
          detail: { messageId: report.messageId, channelId: report.channelId },
        })
      );
    }, 300);
  };

  const reports = data?.reports ?? [];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2 py-10">
        <LionLoader />
        <p className="text-xs text-den-muted">Loading reports...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-den-cream">Could not load reports</p>
        <p className="mt-1 text-xs text-den-muted">{(error as Error).message}</p>
        <Button variant="ghost" className="mt-3 text-xs" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (reports.length === 0) {
    return <p className="py-10 text-center text-sm text-den-muted">No open reports</p>;
  }

  return (
    <ul className="space-y-2">
      {reports.map((report) => (
        <li
          key={report.id}
          className="rounded-den border border-white/10 bg-den-elevated/60 p-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold text-den-cream">
              Report from {report.reporter.displayName}
            </p>
            <span className="shrink-0 text-[10px] text-den-muted">
              #{channelName(report.channelId)}
            </span>
          </div>
          <p className="mt-1 text-xs text-den-muted">{report.reason}</p>
          <p className="mt-1 line-clamp-2 text-xs text-den-cream/80">
            &ldquo;{report.messageContent}&rdquo;
          </p>
          <p className="mt-1 text-[10px] text-den-muted">{formatWhen(report.createdAt)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => jumpToMessage(report)}
              className="text-xs text-den-link hover:underline"
            >
              View message
            </button>
            <button
              type="button"
              disabled={resolveReport.isPending}
              onClick={() => resolveReport.mutate({ reportId: report.id, status: "resolved" })}
              className="text-xs text-den-muted hover:text-den-cream"
            >
              Resolve
            </button>
            <button
              type="button"
              disabled={resolveReport.isPending}
              onClick={() => resolveReport.mutate({ reportId: report.id, status: "dismissed" })}
              className="text-xs text-den-muted hover:text-den-cream"
            >
              Dismiss
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AuditTab({ denId, onClose }: { denId: string; onClose: () => void }) {
  const setActiveChannelId = useAppStore((s) => s.setActiveChannelId);
  const { data: membersData } = useQuery({
    queryKey: ["members", denId],
    queryFn: () => api<{ members: MemberDTO[] }>(`/api/v1/dens/${denId}/members`),
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["den-audit", denId],
    queryFn: () => api<{ entries: AuditRow[] }>(`/api/v1/dens/${denId}/audit`),
  });

  const entries = data?.entries ?? [];

  const jumpToReportMessage = (metadata: string | null) => {
    if (!metadata) return;
    try {
      const parsed = JSON.parse(metadata) as { channelId?: string; messageId?: string };
      if (!parsed.channelId || !parsed.messageId) return;
      setActiveChannelId(parsed.channelId);
      onClose();
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("cubino:scroll-to-message", {
            detail: { messageId: parsed.messageId, channelId: parsed.channelId },
          })
        );
      }, 300);
    } catch {
      /* ignore malformed metadata */
    }
  };

  const jumpToMember = (targetId: string | null) => {
    if (!targetId) return;
    onClose();
    window.dispatchEvent(new Event("cubino:open-members"));
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("cubino:highlight-member", { detail: { memberId: targetId } })
      );
    }, 300);
  };

  const targetLabel = (entry: AuditRow) => {
    if (!entry.targetId || !MEMBER_AUDIT_ACTIONS.has(entry.action)) return null;
    const member = membersData?.members.find((m) => m.id === entry.targetId);
    return member ? memberDisplayName(member) : "a member";
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2 py-10">
        <LionLoader />
        <p className="text-xs text-den-muted">Loading audit log...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-den-cream">Could not load audit log</p>
        <p className="mt-1 text-xs text-den-muted">{(error as Error).message}</p>
        <Button variant="ghost" className="mt-3 text-xs" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className="py-10 text-center text-sm text-den-muted">No audit entries yet</p>;
  }

  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="rounded-den border border-white/10 bg-den-elevated/40 px-3 py-2"
        >
          <p className="text-sm text-den-cream">
            <span className="font-medium">{entry.actor.displayName}</span>{" "}
            <span className="text-den-muted">{formatAuditAction(entry.action)}</span>
            {targetLabel(entry) && (
              <span className="font-medium text-den-cream"> {targetLabel(entry)}</span>
            )}
          </p>
          {entry.metadata && (
            <p className="mt-0.5 text-xs text-den-muted">
              {formatAuditMetadata(entry.action, entry.metadata) ?? entry.metadata}
            </p>
          )}
          {entry.action.startsWith("REPORT_") && entry.metadata && (
            <button
              type="button"
              onClick={() => jumpToReportMessage(entry.metadata)}
              className="mt-1 text-xs text-den-link hover:underline"
            >
              View message
            </button>
          )}
          {entry.targetId && MEMBER_AUDIT_ACTIONS.has(entry.action) && (
            <button
              type="button"
              onClick={() => jumpToMember(entry.targetId)}
              className="mt-1 text-xs text-den-link hover:underline"
            >
              View member
            </button>
          )}
          <p className="mt-0.5 text-[10px] text-den-muted">{formatWhen(entry.createdAt)}</p>
        </li>
      ))}
    </ul>
  );
}

export function DenModerationModal({
  denId,
  onClose,
}: {
  denId: string;
  onClose: () => void;
}) {
  const canBan = useHasDenPermission(denId, Permission.BAN_MEMBERS);
  const canManageMessages = useCanManageMessages(denId);
  const canManageDen = useCanManageDen(denId);

  const { data: reportCountData } = useQuery({
    queryKey: ["den-reports-count", denId],
    enabled: canManageMessages,
    queryFn: () => api<{ count: number }>(`/api/v1/dens/${denId}/reports/count`),
  });
  const openReportCount = reportCountData?.count ?? 0;

  const tabs: { id: ModerationTab; label: string; show: boolean; badge?: number }[] = [
    { id: "reports", label: "Reports", show: canManageMessages, badge: openReportCount },
    { id: "bans", label: "Bans", show: canBan },
    { id: "audit", label: "Audit log", show: canManageDen },
  ].filter((t) => t.show);

  const [activeTab, setActiveTab] = useState<ModerationTab>(
    tabs[0]?.id ?? "reports"
  );

  if (tabs.length === 0) return null;

  return (
    <Modal onClose={onClose} className="max-w-lg" labelledById="den-moderation-title">
      <div className="p-5">
        <h3 id="den-moderation-title" className="text-lg font-bold text-den-cream">
          Moderation
        </h3>
        <p className="mt-1 text-xs text-den-muted">
          Review reports, manage bans, and view the audit log
        </p>

        {tabs.length > 1 && (
          <div
            className="mt-4 flex rounded-den bg-den-elevated p-0.5"
            role="tablist"
            aria-label="Moderation sections"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-1 rounded-den px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-den-surface text-den-cream shadow-sm"
                    : "text-den-muted hover:text-den-cream"
                }`}
              >
                {tab.label}
                {tab.badge != null && tab.badge > 0 && (
                  <span
                    className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-den-berry px-1 text-[10px] font-bold text-white"
                    aria-label={`${tab.badge} open`}
                  >
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 max-h-[55vh] overflow-y-auto" role="tabpanel">
          {activeTab === "bans" && canBan && <BansTab denId={denId} />}
          {activeTab === "reports" && canManageMessages && (
            <ReportsTab denId={denId} onClose={onClose} />
          )}
          {activeTab === "audit" && canManageDen && <AuditTab denId={denId} onClose={onClose} />}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-den py-2 text-sm text-den-muted hover:text-den-cream"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
