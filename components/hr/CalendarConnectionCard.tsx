"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarCheck2,
  CalendarX2,
  Link2,
  Loader2,
  RefreshCw,
  TriangleAlert
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { Badge } from "@/components/ui";
import { primaryButton, secondaryButton } from "@/lib/ui";

interface CalendarStatus {
  provider: "google";
  configured: boolean;
  configurationIssue: string | null;
  canManage: boolean;
  connection: {
    id: string;
    status: string;
    accountEmail: string | null;
    calendarId: string;
    lastVerifiedAt: string | null;
    lastRefreshedAt: string | null;
    lastErrorCode: string | null;
    lastError: string | null;
  } | null;
  queue: {
    pending: number;
    retrying: number;
    processing: number;
    failed: number;
    succeeded: number;
    skipped: number;
  };
}

export function CalendarConnectionCard({ onChanged }: { onChanged?: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/hr/calendar/connection", { cache: "no-store" });
      const body = await response.json() as { calendar?: CalendarStatus; error?: string };
      if (!response.ok || !body.calendar) throw new Error(body.error || "Calendar status could not be loaded.");
      setStatus(body.calendar);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calendar status could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const calendar = params.get("calendar");
    if (!calendar) return;
    if (calendar === "connected") {
      toast("Google Calendar connected. Upcoming interviews were queued for sync.");
      void load();
      onChanged?.();
    } else if (calendar === "error") {
      const reason = params.get("reason");
      const message = reason === "not_configured"
        ? "Google Calendar is not configured on this server."
        : reason === "forbidden"
          ? "Your role cannot manage calendar settings."
          : "Google Calendar could not be connected. Try again.";
      toast(message, "error");
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("calendar");
    url.searchParams.delete("reason");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [load, onChanged, toast]);

  const connect = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/hr/calendar/connect", { method: "POST" });
      const body = await response.json() as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "Google Calendar could not be connected.");
      window.location.assign(body.url);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Google Calendar could not be connected.", "error");
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect Google Calendar? Queued calendar changes will be skipped.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/hr/calendar/connection", { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Google Calendar could not be disconnected.");
      toast("Google Calendar disconnected. Stored tokens were removed.");
      await load();
      onChanged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Google Calendar could not be disconnected.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="h-24 animate-pulse rounded-2xl border border-white/[0.07] bg-white/[0.025]" />;
  }

  if (error || !status) {
    return (
      <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[0.04] p-4 text-[10px] text-rose-200/80">
        {error || "Calendar status is unavailable."}
      </div>
    );
  }

  const connection = status.connection;
  const connected = connection?.status === "Connected";
  const needsReauth = connection?.status === "NeedsReauth";
  const queued = status.queue.pending + status.queue.retrying + status.queue.processing;

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-card/80 p-4 sm:p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${
            connected
              ? "border-mint/15 bg-mint/[0.06] text-mint"
              : needsReauth
                ? "border-amber-300/20 bg-amber-300/[0.05] text-amber-200"
                : "border-white/[0.08] bg-white/[0.025] text-slate-500"
          }`}>
            {connected ? <CalendarCheck2 size={16} /> : needsReauth ? <TriangleAlert size={16} /> : <CalendarX2 size={16} />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xs font-semibold text-white">Google Calendar</h2>
              <Badge tone={connected ? "mint" : needsReauth ? "amber" : "slate"}>
                {connected ? "Connected" : needsReauth ? "Reconnect needed" : connection ? "Disconnected" : "Not connected"}
              </Badge>
            </div>
            {connection?.accountEmail ? (
              <p className="mt-1 truncate text-[10px] text-slate-500">{connection.accountEmail}</p>
            ) : (
              <p className="mt-1 text-[10px] text-slate-600">No organization calendar is connected.</p>
            )}
            {!status.configured && (
              <p className="mt-2 text-[9px] leading-4 text-amber-200/70">
                Google OAuth is not configured on this server. An administrator must set the calendar provider credentials and encryption key.
              </p>
            )}
            {connection?.lastError && (
              <p className="mt-2 text-[9px] leading-4 text-amber-200/70">
                {connection.lastErrorCode === "CALENDAR_REAUTH_REQUIRED"
                  ? "Authorization expired. Reconnect the account to resume syncing."
                  : connection.lastError}
              </p>
            )}
            {connected && (
              <p className="mt-2 text-[9px] leading-4 text-slate-600">
                {status.queue.failed > 0
                  ? `${status.queue.failed} failed sync${status.queue.failed === 1 ? "" : "s"} need attention.`
                  : queued > 0
                    ? `${queued} calendar change${queued === 1 ? "" : "s"} queued.`
                    : "Calendar changes are up to date."}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {status.canManage && status.configured && (!connected || needsReauth) && (
            <button onClick={connect} disabled={busy} className={primaryButton}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
              {needsReauth ? "Reconnect" : "Connect Google Calendar"}
            </button>
          )}
          {status.canManage && connection && connected && (
            <button onClick={connect} disabled={busy} className={secondaryButton}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Reconnect
            </button>
          )}
          {status.canManage && connection && (
            <button onClick={disconnect} disabled={busy} className={secondaryButton}>Disconnect</button>
          )}
        </div>
      </div>
    </section>
  );
}
