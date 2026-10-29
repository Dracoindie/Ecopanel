"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { Badge } from "@/components/ui";
import type { InterviewCalendarSync } from "@/lib/domain";
import { secondaryButton } from "@/lib/ui";

const CONFIG_CODES = new Set([
  "CALENDAR_NOT_CONNECTED",
  "CALENDAR_REAUTH_REQUIRED",
  "CALENDAR_DISCONNECTED"
]);

function syncLabel(sync: InterviewCalendarSync) {
  if (sync.status === "Succeeded") {
    return sync.operation === "Cancel" ? "Removed from calendar" : "Synced to calendar";
  }
  if (sync.status === "Failed") return "Calendar sync failed";
  if (sync.status === "Processing") return "Syncing calendar";
  if (sync.status === "Retrying") return "Calendar retry queued";
  if (sync.status === "Pending") return "Calendar sync queued";
  if (sync.failureCode === "CALENDAR_NOT_CONNECTED" || sync.failureCode === "CALENDAR_DISCONNECTED") {
    return "Calendar not connected";
  }
  if (sync.failureCode === "CALENDAR_REAUTH_REQUIRED") return "Calendar reconnect needed";
  return "Calendar not synced";
}

function syncTone(sync: InterviewCalendarSync): "mint" | "amber" | "rose" | "slate" | "violet" {
  if (sync.status === "Succeeded") return "mint";
  if (sync.status === "Failed") return "rose";
  if (sync.status === "Processing" || sync.status === "Pending" || sync.status === "Retrying") return "violet";
  if (sync.failureCode === "CALENDAR_NOT_CONNECTED" || sync.failureCode === "CALENDAR_DISCONNECTED") return "slate";
  return "amber";
}

export function CalendarSyncBadge({ sync }: { sync: InterviewCalendarSync }) {
  return <Badge tone={syncTone(sync)}>{syncLabel(sync)}</Badge>;
}

export function CalendarSyncPanel({
  sync,
  onRetried
}: {
  sync: InterviewCalendarSync | null;
  onRetried: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!sync) {
    return (
      <section className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
        <h2 className="text-sm font-semibold text-white">Google Calendar</h2>
        <p className="mt-2 text-[10px] leading-5 text-slate-500">
          No calendar sync has been requested for this interview. Connect an organization calendar and reschedule the interview to add it.
        </p>
      </section>
    );
  }

  const retry = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/hr/calendar/events/${encodeURIComponent(sync.id)}/retry`, {
        method: "POST"
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Calendar sync could not be retried.");
      toast("Calendar sync was queued for retry.");
      onRetried();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Calendar sync could not be retried.", "error");
    } finally {
      setBusy(false);
    }
  };

  const retryable = sync.canRetry && (!sync.failureCode || !CONFIG_CODES.has(sync.failureCode));

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Google Calendar</h2>
        <CalendarSyncBadge sync={sync} />
      </div>
      <dl className="mt-4 space-y-2.5 text-[10px]">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-600">Last sync</dt>
          <dd className="text-right text-slate-300">
            {sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleString() : "Not yet"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-600">Attempts</dt>
          <dd className="text-slate-300">{sync.attempts} / {sync.maxAttempts}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-600">Attendee notifications</dt>
          <dd className="text-right text-slate-300">
            {sync.notificationPolicy === "All"
              ? sync.notificationRequestedAt ? "Requested" : "Not requested"
              : "Not requested"}
          </dd>
        </div>
      </dl>
      {sync.lastError && (
        <p className={`mt-3 rounded-xl border px-3 py-2 text-[9px] leading-4 ${
          sync.status === "Failed"
            ? "border-rose-400/15 bg-rose-400/[0.04] text-rose-200/75"
            : "border-amber-300/15 bg-amber-300/[0.04] text-amber-200/70"
        }`}>
          {sync.lastError}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {sync.htmlLink && (
          <a href={sync.htmlLink} target="_blank" rel="noreferrer" className={secondaryButton}>
            <ExternalLink size={12} /> Open in Google Calendar
          </a>
        )}
        {retryable && (
          <button onClick={retry} disabled={busy} className={secondaryButton}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {sync.status === "Processing" ? "Syncing..." : "Retry sync"}
          </button>
        )}
      </div>
      {sync.status === "Pending" && (
        <p className="mt-3 flex items-center gap-1.5 text-[9px] text-slate-600">
          <CheckCircle2 size={10} /> The calendar worker will process this change shortly.
        </p>
      )}
      {sync.status === "Failed" && (
        <p className="mt-3 flex items-center gap-1.5 text-[9px] text-rose-200/70">
          <TriangleAlert size={10} /> Check the error before retrying. Repeated invitation attempts are not made automatically.
        </p>
      )}
    </section>
  );
}
