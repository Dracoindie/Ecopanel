"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { useToast } from "@/components/ToastProvider";
import { ConfirmDialog, Modal } from "@/components/ui";
import type { Interview } from "@/lib/domain";
import { buildApplicationRecords } from "@/lib/demo-service";
import { formatDate, formatTime } from "@/lib/format";
import { inputClass, labelClass, primaryButton, secondaryButton, selectClass } from "@/lib/ui";

const TIMEZONES = ["Asia/Kolkata", "Europe/London", "America/New_York", "America/Los_Angeles", "Europe/Berlin", "Asia/Singapore"];
const ROUNDS = ["Adaptive voice panel", "Technical follow-up", "Product panel", "Enterprise product panel", "Frontend systems panel"];

function ScheduleFields({
  applicationId,
  setApplicationId,
  date,
  setDate,
  time,
  setTime,
  duration,
  setDuration,
  timezone,
  setTimezone,
  round,
  setRound,
  notes,
  setNotes
}: {
  applicationId: string;
  setApplicationId: (value: string) => void;
  date: string;
  setDate: (value: string) => void;
  time: string;
  setTime: (value: string) => void;
  duration: string;
  setDuration: (value: string) => void;
  timezone: string;
  setTimezone: (value: string) => void;
  round: string;
  setRound: (value: string) => void;
  notes: string;
  setNotes: (value: string) => void;
}) {
  const store = useDemoData();
  const records = useMemo(() => buildApplicationRecords(store), [store]);

  return (
    <div className="space-y-4">
      <label className="block">
        <span className={labelClass}>Candidate & application</span>
        <select value={applicationId} onChange={event => setApplicationId(event.target.value)} className={selectClass}>
          <option value="">Choose a candidate</option>
          {records.map(record => (
            <option key={record.application.id} value={record.application.id}>
              {record.candidate.name} — {record.job.title}
            </option>
          ))}
        </select>
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
            {TIMEZONES.map(item => <option key={item} value={item}>{item}</option>)}
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
        <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3} className={`${inputClass} resize-y`} placeholder="Optional focus areas for the demo interview…" />
      </label>
      <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2.5 text-[10px] leading-5 text-amber-200/70">
        Scheduling updates the demo workspace only. No calendar invite or reminder email is delivered.
      </div>
    </div>
  );
}

export function ScheduleInterviewDialog({
  open,
  onClose,
  defaultApplicationId = "",
  onScheduled
}: {
  open: boolean;
  onClose: () => void;
  defaultApplicationId?: string;
  onScheduled?: (interview: Interview) => void;
}) {
  const store = useDemoData();
  const { toast } = useToast();
  const [applicationId, setApplicationId] = useState(defaultApplicationId);
  const [date, setDate] = useState("2026-10-30");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("30");
  const [timezone, setTimezone] = useState("Europe/London");
  const [round, setRound] = useState(ROUNDS[0]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setApplicationId(defaultApplicationId);
    setError("");
  }, [open, defaultApplicationId]);

  const save = async () => {
    if (!applicationId || !date || !time) {
      setError("Choose a candidate, date, and time.");
      return;
    }
    setBusy(true);
    await new Promise(resolve => window.setTimeout(resolve, 450));
    const interview = store.scheduleInterview({
      applicationId,
      scheduledAt: `${date}T${time}:00.000Z`,
      durationMinutes: Number(duration),
      timezone,
      round,
      notes
    });
    setBusy(false);
    if (!interview) {
      setError("That application could not be found.");
      return;
    }
    toast("Demo interview scheduled. No calendar invite was sent.");
    onScheduled?.(interview);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule an interview"
      description="Create a demo session and add it to the connected calendar."
      footer={
        <>
          <button className={secondaryButton} onClick={onClose} disabled={busy}>Cancel</button>
          <button className={primaryButton} onClick={save} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
            {busy ? "Scheduling…" : "Schedule demo interview"}
          </button>
        </>
      }
    >
      <ScheduleFields
        applicationId={applicationId}
        setApplicationId={setApplicationId}
        date={date}
        setDate={setDate}
        time={time}
        setTime={setTime}
        duration={duration}
        setDuration={setDuration}
        timezone={timezone}
        setTimezone={setTimezone}
        round={round}
        setRound={setRound}
        notes={notes}
        setNotes={setNotes}
      />
      {error && <p className="mt-3 text-[11px] text-rose-200">{error}</p>}
    </Modal>
  );
}

export function RescheduleInterviewDialog({
  interview,
  open,
  onClose
}: {
  interview: Interview | null;
  open: boolean;
  onClose: () => void;
}) {
  const store = useDemoData();
  const { toast } = useToast();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [timezone, setTimezone] = useState("Europe/London");
  const [round, setRound] = useState(ROUNDS[0]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !interview) return;
    setDate(interview.scheduledAt.slice(0, 10));
    setTime(interview.scheduledAt.slice(11, 16));
    setDuration(String(interview.durationMinutes));
    setTimezone(interview.timezone);
    setRound(interview.round);
    setNotes(interview.notes);
    setError("");
  }, [open, interview]);

  if (!interview) return null;

  const save = async () => {
    if (!date || !time) {
      setError("Choose a new date and time.");
      return;
    }
    setBusy(true);
    await new Promise(resolve => window.setTimeout(resolve, 400));
    store.rescheduleInterview(interview.id, {
      scheduledAt: `${date}T${time}:00.000Z`,
      durationMinutes: Number(duration),
      timezone,
      round,
      notes
    });
    setBusy(false);
    toast("Demo interview rescheduled. No attendee notice was delivered.");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reschedule interview"
      description={`${formatDate(interview.scheduledAt)} at ${formatTime(interview.scheduledAt)} currently`}
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
              {TIMEZONES.map(item => <option key={item} value={item}>{item}</option>)}
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
        <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2.5 text-[10px] leading-5 text-amber-200/70">Rescheduling is demo-only. It does not update an external calendar or send an email.</div>
      </div>
    </Modal>
  );
}

export function CancelInterviewDialog({
  interview,
  open,
  onClose
}: {
  interview: Interview | null;
  open: boolean;
  onClose: () => void;
}) {
  const store = useDemoData();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (!interview) return null;

  const confirm = async () => {
    setBusy(true);
    await new Promise(resolve => window.setTimeout(resolve, 350));
    store.cancelInterview(interview.id);
    setBusy(false);
    toast("Demo interview cancelled. No calendar notice was sent.");
    onClose();
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={confirm}
      title="Cancel this interview?"
      description={`The demo session for ${formatDate(interview.scheduledAt)} at ${formatTime(interview.scheduledAt)} will be marked cancelled. No external calendar or email will be changed.`}
      confirmLabel="Cancel demo interview"
      tone="danger"
      busy={busy}
    />
  );
}
