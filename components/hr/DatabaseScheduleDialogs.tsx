"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { Modal } from "@/components/ui";
import type { Interview } from "@/lib/domain";
import {
  formatZonedDate,
  formatZonedTime,
  zonedDateTimeParts,
  zonedDateTimeToUtc
} from "@/lib/timezone";
import { inputClass, labelClass, primaryButton, secondaryButton, selectClass } from "@/lib/ui";

export interface InterviewOption {
  applicationId: string;
  stage: string;
  candidate: { id: string; name: string; email: string };
  job: { id: string; title: string };
}

const TIMEZONES = ["Europe/London", "America/New_York", "America/Los_Angeles", "Europe/Berlin", "Asia/Singapore"];
const ROUNDS = ["Adaptive voice panel", "Technical follow-up", "Product panel", "Enterprise product panel", "Frontend systems panel"];

function timezoneOptions(current: string) {
  return TIMEZONES.includes(current) ? TIMEZONES : [current, ...TIMEZONES];
}

function defaultDate() {
  return new Date().toISOString().slice(0, 10);
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json() as { interview?: Interview; error?: string };
  if (!response.ok || !body.interview) throw new Error(body.error || "The interview could not be saved.");
  return body.interview;
}

export function DatabaseScheduleInterviewDialog({
  open,
  onClose,
  options,
  defaultApplicationId = "",
  onScheduled
}: {
  open: boolean;
  onClose: () => void;
  options: InterviewOption[];
  defaultApplicationId?: string;
  onScheduled?: (interview: Interview) => void;
}) {
  const { toast } = useToast();
  const [applicationId, setApplicationId] = useState(defaultApplicationId);
  const [date, setDate] = useState(defaultDate());
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("30");
  const [timezone, setTimezone] = useState("Europe/London");
  const [round, setRound] = useState(ROUNDS[0]);
  const [notes, setNotes] = useState("");
  const [notify, setNotify] = useState(true);
  const [calendarNotify, setCalendarNotify] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setApplicationId(defaultApplicationId || options[0]?.applicationId || "");
    setNotify(true);
    setCalendarNotify(false);
    setError("");
  }, [open, defaultApplicationId, options]);

  const save = async () => {
    if (!applicationId || !date || !time) {
      setError("Choose a candidate, date, and time.");
      return;
    }
    const scheduledAt = zonedDateTimeToUtc(date, time, timezone);
    if (!scheduledAt) {
      setError("That local time does not exist in the selected time zone. Choose another time.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const interview = await requestJson("/api/hr/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          scheduledAt: scheduledAt.toISOString(),
          durationMinutes: Number(duration),
          timezone,
          round,
          notes,
          notify,
          calendarNotify
        })
      });
      const emailMessage = notify
        ? "Invitation and reminder emails were added to the outbox."
        : "No email was queued.";
      const calendarMessage = calendarNotify
        ? " A Google Calendar invitation was requested."
        : "";
      toast(`Interview scheduled. ${emailMessage}${calendarMessage}`);
      onScheduled?.(interview);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The interview could not be scheduled.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule an interview"
      description="Create a persisted session linked to an application."
      footer={
        <>
          <button className={secondaryButton} onClick={onClose} disabled={busy}>Cancel</button>
          <button className={primaryButton} onClick={save} disabled={busy || !options.length}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
            {busy ? "Scheduling..." : "Schedule interview"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className={labelClass}>Candidate & application</span>
          <select value={applicationId} onChange={event => setApplicationId(event.target.value)} className={selectClass}>
            <option value="">Choose a candidate</option>
            {options.map(option => (
              <option key={option.applicationId} value={option.applicationId}>
                {option.candidate.name} - {option.job.title}
              </option>
            ))}
          </select>
          {!options.length && <p className="mt-1 text-[10px] text-amber-200/70">No applications are available to schedule.</p>}
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Date</span>
            <input type="date" value={date} onChange={event => setDate(event.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>Time</span>
            <input type="time" value={time} onChange={event => setTime(event.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>Duration</span>
            <select value={duration} onChange={event => setDuration(event.target.value)} className={selectClass}>
              <option value="20">20 minutes</option>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">60 minutes</option>
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Time zone</span>
            <select value={timezone} onChange={event => setTimezone(event.target.value)} className={selectClass}>
              {timezoneOptions(timezone).map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className={labelClass}>Interview round</span>
          <select value={round} onChange={event => setRound(event.target.value)} className={selectClass}>
            {ROUNDS.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Internal notes</span>
          <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3} className={`${inputClass} resize-y`} placeholder="Optional focus areas for the interview..." />
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-mint/15 bg-mint/[0.035] px-3 py-2.5">
          <input type="checkbox" checked={notify} onChange={event => setNotify(event.target.checked)} className="mt-0.5 h-4 w-4 accent-mint" />
          <span>
            <span className="block text-[10px] font-medium text-mint/90">Queue invitation and reminder emails</span>
            <span className="mt-1 block text-[9px] leading-4 text-mint/65">The invitation and a reminder 24 hours before the interview are stored in the durable outbox. Delivery depends on provider configuration.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-violet/15 bg-violet/[0.035] px-3 py-2.5">
          <input type="checkbox" checked={calendarNotify} onChange={event => setCalendarNotify(event.target.checked)} className="mt-0.5 h-4 w-4 accent-mint" />
          <span>
            <span className="block text-[10px] font-medium text-violet-200/90">Send a Google Calendar invitation</span>
            <span className="mt-1 block text-[9px] leading-4 text-violet-200/55">Adds the candidate as an attendee when the organization calendar is connected. This is separate from email notifications and only requests delivery; the calendar worker confirms synchronization.</span>
          </span>
        </label>
        {error && <p className="text-[11px] text-rose-200">{error}</p>}
      </div>
    </Modal>
  );
}

export function DatabaseRescheduleInterviewDialog({
  interview,
  open,
  onClose,
  onSaved
}: {
  interview: Interview | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [timezone, setTimezone] = useState("Europe/London");
  const [round, setRound] = useState(ROUNDS[0]);
  const [notes, setNotes] = useState("");
  const [notify, setNotify] = useState(true);
  const [calendarNotify, setCalendarNotify] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !interview) return;
    const parts = zonedDateTimeParts(interview.scheduledAt, interview.timezone);
    setDate(parts?.date ?? interview.scheduledAt.slice(0, 10));
    setTime(parts?.time ?? interview.scheduledAt.slice(11, 16));
    setDuration(String(interview.durationMinutes));
    setTimezone(interview.timezone);
    setRound(interview.round);
    setNotes(interview.notes);
    setNotify(true);
    setCalendarNotify(false);
    setError("");
  }, [open, interview]);

  if (!interview) return null;

  const save = async () => {
    if (!date || !time) {
      setError("Choose a new date and time.");
      return;
    }
    const scheduledAt = zonedDateTimeToUtc(date, time, timezone);
    if (!scheduledAt) {
      setError("That local time does not exist in the selected time zone. Choose another time.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await requestJson(`/api/hr/interviews/${encodeURIComponent(interview.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: scheduledAt.toISOString(),
          durationMinutes: Number(duration),
          timezone,
          round,
          notes,
          notify,
          calendarNotify
        })
      });
      const emailMessage = notify
        ? "Stale queued emails were cancelled and a new notice was queued."
        : "No attendee email was queued.";
      const calendarMessage = calendarNotify
        ? " A calendar update with attendee notification was requested."
        : "";
      toast(`Interview rescheduled. ${emailMessage}${calendarMessage}`);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The interview could not be rescheduled.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reschedule interview"
      description={`${formatZonedDate(interview.scheduledAt, interview.timezone)} at ${formatZonedTime(interview.scheduledAt, interview.timezone)} ${interview.timezone} currently`}
      footer={
        <>
          <button className={secondaryButton} onClick={onClose} disabled={busy}>Cancel</button>
          <button className={primaryButton} onClick={save} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />} Save new time</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>New date</span>
            <input type="date" value={date} onChange={event => setDate(event.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>New time</span>
            <input type="time" value={time} onChange={event => setTime(event.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>Duration</span>
            <select value={duration} onChange={event => setDuration(event.target.value)} className={selectClass}>
              <option value="20">20 minutes</option>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">60 minutes</option>
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Time zone</span>
            <select value={timezone} onChange={event => setTimezone(event.target.value)} className={selectClass}>
              {timezoneOptions(timezone).map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className={labelClass}>Round</span>
          <select value={round} onChange={event => setRound(event.target.value)} className={selectClass}>
            {ROUNDS.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Internal notes</span>
          <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3} className={`${inputClass} resize-y`} />
        </label>
        {error && <p className="text-[11px] text-rose-200">{error}</p>}
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2.5">
          <input type="checkbox" checked={notify} onChange={event => setNotify(event.target.checked)} className="mt-0.5 h-4 w-4 accent-mint" />
          <span>
            <span className="block text-[10px] font-medium text-amber-200/85">Queue a reschedule notice and new reminder</span>
            <span className="mt-1 block text-[9px] leading-4 text-amber-200/60">Queued invitation and reminder emails are cancelled. A reschedule notice and a new 24-hour reminder are added to the outbox when selected.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-violet/15 bg-violet/[0.035] px-3 py-2.5">
          <input type="checkbox" checked={calendarNotify} onChange={event => setCalendarNotify(event.target.checked)} className="mt-0.5 h-4 w-4 accent-mint" />
          <span>
            <span className="block text-[10px] font-medium text-violet-200/90">Notify Google Calendar attendees</span>
            <span className="mt-1 block text-[9px] leading-4 text-violet-200/55">The connected calendar event is updated either way. Select this to ask Google Calendar to email attendees about the new time. The worker records synchronization when Google accepts the change; attendee email delivery is not separately confirmed.</span>
          </span>
        </label>
      </div>
    </Modal>
  );
}

export function DatabaseCancelInterviewDialog({
  interview,
  open,
  onClose,
  onCancelled
}: {
  interview: Interview | null;
  open: boolean;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [notify, setNotify] = useState(true);
  const [calendarNotify, setCalendarNotify] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCalendarNotify(false);
    setNotify(true);
  }, [open]);

  if (!interview) return null;

  const confirm = async () => {
    setBusy(true);
    try {
      await requestJson(`/api/hr/interviews/${encodeURIComponent(interview.id)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify, calendarNotify })
      });
      const message = notify
        ? "Interview cancelled. Queued reminders were cancelled and a cancellation email was queued."
        : "Interview cancelled. No cancellation email was queued.";
      toast(calendarNotify
        ? `${message} A calendar cancellation with attendee notification was requested.`
        : message);
      onCancelled();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "The interview could not be cancelled.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancel this interview?"
      description={`The session for ${formatZonedDate(interview.scheduledAt, interview.timezone)} at ${formatZonedTime(interview.scheduledAt, interview.timezone)} ${interview.timezone} will be marked cancelled. Pending invitation and reminder emails will not be delivered.`}
      size="sm"
      footer={
        <>
          <button onClick={onClose} disabled={busy} className={secondaryButton}>Keep interview</button>
          <button onClick={confirm} disabled={busy} className="inline-flex items-center justify-center rounded-xl bg-rose-400 px-4 py-2.5 text-sm font-semibold text-[#1a080b] disabled:opacity-50">{busy ? "Cancelling..." : "Cancel interview"}</button>
        </>
      }
    >
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-rose-400/15 bg-rose-400/[0.035] px-3 py-3">
        <input type="checkbox" checked={notify} onChange={event => setNotify(event.target.checked)} className="mt-0.5 h-4 w-4 accent-mint" />
        <span>
          <span className="block text-[10px] font-medium text-rose-100/85">Queue a cancellation email</span>
          <span className="mt-1 block text-[9px] leading-4 text-slate-500">A notice is added to the durable outbox when selected. Delivery depends on provider configuration and the email worker.</span>
        </span>
      </label>
      <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-violet/15 bg-violet/[0.035] px-3 py-3">
        <input type="checkbox" checked={calendarNotify} onChange={event => setCalendarNotify(event.target.checked)} className="mt-0.5 h-4 w-4 accent-mint" />
        <span>
          <span className="block text-[10px] font-medium text-violet-200/85">Notify Google Calendar attendees</span>
          <span className="mt-1 block text-[9px] leading-4 text-violet-200/55">The connected calendar event is removed either way. Select this to ask Google Calendar to email attendees about the cancellation.</span>
        </span>
      </label>
    </Modal>
  );
}
