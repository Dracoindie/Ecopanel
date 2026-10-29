"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock3,
  List,
  MapPin,
  Video
} from "lucide-react";
import {
  DatabaseCancelInterviewDialog,
  DatabaseRescheduleInterviewDialog,
  DatabaseScheduleInterviewDialog,
  type InterviewOption
} from "@/components/hr/DatabaseScheduleDialogs";
import { CalendarConnectionCard } from "@/components/hr/CalendarConnectionCard";
import { CalendarSyncBadge } from "@/components/hr/CalendarSyncStatus";
import { Avatar, Badge, EmptyState, PageHeader } from "@/components/ui";
import type { Application, Candidate, Interview, Job } from "@/lib/domain";
import { calendarCells, formatDate, monthLabel } from "@/lib/format";
import { formatZonedDate, formatZonedTime } from "@/lib/timezone";
import { cn } from "@/lib/cn";
import { secondaryButton } from "@/lib/ui";

type View = "calendar" | "list";
type ListFilter = "Upcoming" | "Past" | "All";

interface ApplicationsResponse {
  applications: Application[];
  candidates: Candidate[];
  jobs: Job[];
}

interface Row {
  interview: Interview;
  candidate?: Candidate;
  job?: Job;
}

export function DatabaseScheduleClient() {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const [view, setView] = useState<View>("calendar");
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [selectedDate, setSelectedDate] = useState(today);
  const [listFilter, setListFilter] = useState<ListFilter>("Upcoming");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<Interview | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Interview | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [options, setOptions] = useState<InterviewOption[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetch("/api/hr/interviews", { cache: "no-store" }).then(async response => {
        const body = await response.json() as { interviews?: Interview[]; error?: string };
        if (!response.ok || !body.interviews) throw new Error(body.error || "Interviews could not be loaded.");
        return body.interviews;
      }),
      fetch("/api/hr/applications?pageSize=100", { cache: "no-store" }).then(async response => {
        const body = await response.json() as ApplicationsResponse & { error?: string };
        if (!response.ok) throw new Error(body.error || "Applications could not be loaded.");
        return body;
      }),
      fetch("/api/hr/interviews/options", { cache: "no-store" }).then(async response => {
        const body = await response.json() as { applications?: InterviewOption[]; error?: string };
        if (!response.ok || !body.applications) throw new Error(body.error || "Applications could not be loaded.");
        return body.applications;
      })
    ])
      .then(([loadedInterviews, applications, loadedOptions]) => {
        if (!active) return;
        setInterviews(loadedInterviews);
        setOptions(loadedOptions);
        const candidates = new Map(applications.candidates.map(candidate => [candidate.id, candidate]));
        const jobs = new Map(applications.jobs.map(job => [job.id, job]));
        setRows(loadedInterviews.map(interview => ({
          interview,
          candidate: candidates.get(interview.candidateId),
          job: jobs.get(interview.jobId)
        })));
        setError("");
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : "Interviews could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [refresh]);

  const sorted = useMemo(
    () => [...interviews].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [interviews]
  );
  const rowById = new Map(rows.map(row => [row.interview.id, row]));
  const upcoming = sorted.filter(item =>
    item.status === "Scheduled" && formatZonedDate(item.scheduledAt, item.timezone) >= today
  );
  const past = sorted
    .filter(item =>
      item.status === "Completed" || formatZonedDate(item.scheduledAt, item.timezone) < today
    )
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  const list = listFilter === "Upcoming" ? upcoming : listFilter === "Past" ? past : sorted;
  const cells = calendarCells(year, month);
  const dayInterviews = sorted.filter(item =>
    formatZonedDate(item.scheduledAt, item.timezone) === selectedDate
  );
  const calendarFailed = interviews.filter(item => item.calendarSync?.status === "Failed").length;
  const scheduledCount = upcoming.length;
  const completedCount = interviews.filter(item => item.status === "Completed").length;
  const refreshData = () => setRefresh(value => value + 1);

  const moveMonth = (delta: number) => {
    const next = new Date(Date.UTC(year, month + delta, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth());
  };

  const info = (interview: Interview) => rowById.get(interview.id);

  if (loading && !rows.length) {
    return <div className="space-y-4"><div className="h-20 animate-pulse rounded-2xl bg-white/[0.03]" /><div className="h-[560px] animate-pulse rounded-2xl bg-white/[0.025]" /></div>;
  }

  if (error) {
    return <EmptyState title="Schedule unavailable" description={error} icon={CalendarDays} action={<button onClick={refreshData} className={secondaryButton}>Retry</button>} />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Interview operations"
        title="Schedule & calendar"
        description="Persisted interview scheduling linked to applications, with optional Google Calendar synchronization and durable email delivery."
        actions={
          <>
            <div className="flex rounded-xl border border-white/[0.08] bg-white/[0.025] p-1">
              <button onClick={() => setView("calendar")} className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition", view === "calendar" ? "bg-white/[0.08] text-white" : "text-slate-500 hover:text-white")}><CalendarDays size={11} /> Calendar</button>
              <button onClick={() => setView("list")} className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition", view === "list" ? "bg-white/[0.08] text-white" : "text-slate-500 hover:text-white")}><List size={11} /> List</button>
            </div>
            <button onClick={() => setScheduleOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-mint px-3.5 py-2.5 text-xs font-semibold text-ink transition hover:bg-mint-hover"><CalendarPlus size={13} /> Schedule</button>
          </>
        }
      />

      <CalendarConnectionCard onChanged={refreshData} />

      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="violet" dot>{scheduledCount} upcoming</Badge>
        <Badge tone="mint">{completedCount} completed</Badge>
        <Badge tone="slate">{interviews.filter(item => item.status === "Cancelled").length} cancelled</Badge>
        {calendarFailed > 0 && <Badge tone="rose">{calendarFailed} calendar sync failed</Badge>}
        <span className="ml-auto text-[9px] text-slate-600">Stored in PostgreSQL</span>
      </div>

      {view === "calendar" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_355px]">
          <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-card/80">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">{monthLabel(year, month)}</h2>
                <p className="mt-1 text-[10px] text-slate-500">Select a day to inspect its scheduled sessions.</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => moveMonth(-1)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.07] text-slate-400 hover:bg-white/[0.05] hover:text-white" aria-label="Previous month"><ChevronLeft size={13} /></button>
                <button onClick={() => { setYear(now.getUTCFullYear()); setMonth(now.getUTCMonth()); setSelectedDate(today); }} className="rounded-lg px-2.5 py-1.5 text-[9px] font-medium text-slate-500 hover:text-white">Today</button>
                <button onClick={() => moveMonth(1)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.07] text-slate-400 hover:bg-white/[0.05] hover:text-white" aria-label="Next month"><ChevronRight size={13} /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 border-b border-white/[0.055] bg-white/[0.013]">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <div key={day} className="px-2 py-2 text-center text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-600">{day}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((cell, index) => {
                if (!cell) return <div key={`blank-${index}`} className="min-h-[88px] border-b border-r border-white/[0.045] bg-black/[0.055]" />;
                const dayItems = sorted.filter(item =>
                  formatZonedDate(item.scheduledAt, item.timezone) === cell.date
                );
                const selected = selectedDate === cell.date;
                const isToday = cell.date === today;
                return (
                  <button
                    key={cell.date}
                    onClick={() => setSelectedDate(cell.date)}
                    className={cn(
                      "min-h-[88px] border-b border-r border-white/[0.045] p-1.5 text-left transition hover:bg-white/[0.025] sm:p-2",
                      selected && "bg-violet/[0.065] ring-1 ring-inset ring-violet/20"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[9px]", isToday ? "bg-mint text-ink" : selected ? "text-violet-200" : "text-slate-500")}>{cell.day}</span>
                      {dayItems.length > 0 && <span className="text-[8px] text-slate-600">{dayItems.length}</span>}
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {dayItems.slice(0, 2).map(item => {
                        const row = info(item);
                        return (
                          <div key={item.id} className={cn("truncate rounded px-1 py-0.5 text-[7px] leading-3 sm:text-[8px]", item.status === "Completed" ? "bg-mint/[0.08] text-mint/80" : item.status === "Cancelled" ? "bg-rose-400/[0.07] text-rose-200/70" : "bg-violet/[0.1] text-violet-200/80")}>
                            {formatZonedTime(item.scheduledAt, item.timezone)} {row?.candidate?.name.split(" ")[0] ?? "Interview"}
                          </div>
                        );
                      })}
                      {dayItems.length > 2 && <p className="text-[7px] text-slate-600">+{dayItems.length - 2} more</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-card/80">
              <div className="border-b border-white/[0.06] px-5 py-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">Selected day</p>
                <h2 className="mt-1 text-sm font-semibold text-white">{formatDate(selectedDate)}</h2>
                <p className="mt-1 text-[10px] text-slate-500">{dayInterviews.length} session{dayInterviews.length === 1 ? "" : "s"}</p>
              </div>
              <div className="divide-y divide-white/[0.055]">
                {dayInterviews.map(item => {
                  const row = info(item);
                  return (
                    <div key={item.id} className="p-4">
                      <div className="flex items-start gap-2.5">
                        <Avatar name={row?.candidate?.name ?? "Candidate"} size="sm" tone="violet" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-medium text-slate-200">{row?.candidate?.name ?? "Candidate"}</p>
                          <p className="mt-0.5 truncate text-[9px] text-slate-600">{row?.job?.title ?? "Role"}</p>
                        </div>
                        <Badge tone={item.status === "Completed" ? "mint" : item.status === "Cancelled" ? "rose" : "violet"}>{item.status}</Badge>
                      </div>
                      {item.calendarSync && <div className="mt-2"><CalendarSyncBadge sync={item.calendarSync} /></div>}
                      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-slate-500">
                        <span className="inline-flex items-center gap-1"><Clock3 size={9} /> {formatZonedTime(item.scheduledAt, item.timezone)} · {item.durationMinutes} min</span>
                        <span className="inline-flex items-center gap-1"><MapPin size={9} /> {item.timezone}</span>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Link href={`/hr/interviews/${item.id}`} className="flex-1 rounded-lg border border-white/[0.07] px-2 py-1.5 text-center text-[9px] text-slate-400 hover:text-white">View</Link>
                        {item.status === "Scheduled" && <button onClick={() => setRescheduleTarget(item)} className="flex-1 rounded-lg border border-white/[0.07] px-2 py-1.5 text-[9px] text-slate-400 hover:text-white">Reschedule</button>}
                      </div>
                    </div>
                  );
                })}
                {!dayInterviews.length && (
                  <div className="px-4 py-9 text-center">
                    <CalendarDays size={20} className="mx-auto text-slate-700" />
                    <p className="mt-2 text-[10px] text-slate-500">No interviews on this day.</p>
                    <button onClick={() => setScheduleOpen(true)} className="mt-3 text-[9px] font-medium text-mint hover:text-white">Schedule one</button>
                  </div>
                )}
              </div>
            </section>
            <div className="rounded-2xl border border-white/[0.07] bg-card/60 p-4">
              <div className="flex items-center gap-2 text-[10px] font-medium text-slate-300"><Video size={12} className="text-violet-200" /> Interview rooms</div>
              <p className="mt-2 text-[9px] leading-5 text-slate-600">Sessions link to persisted interview details and any assessment explicitly saved for them. Live voice rooms stay on the existing EchoPanel setup flow.</p>
              <Link href="/setup" className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.07] px-2.5 py-2 text-[9px] text-slate-400 hover:text-white">Open voice setup</Link>
            </div>
          </aside>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-card/80">
          <div className="flex flex-col justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:flex-row sm:items-center">
            <div className="flex rounded-lg border border-white/[0.07] bg-black/10 p-1">
              {(["Upcoming", "Past", "All"] as ListFilter[]).map(item => (
                <button key={item} onClick={() => setListFilter(item)} className={cn("rounded-md px-3 py-1.5 text-[9px] font-medium transition", listFilter === item ? "bg-white/[0.08] text-white" : "text-slate-500 hover:text-white")}>{item}</button>
              ))}
            </div>
            <span className="text-[9px] text-slate-600">{list.length} session{list.length === 1 ? "" : "s"} · stored interviews</span>
          </div>
          <div className="divide-y divide-white/[0.055]">
            {list.map(item => {
              const row = info(item);
              return (
                <div key={item.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={row?.candidate?.name ?? "Candidate"} tone="violet" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[11px] font-semibold text-slate-200">{row?.candidate?.name ?? "Candidate"}</p>
                        <Badge tone={item.status === "Completed" ? "mint" : item.status === "Cancelled" ? "rose" : "violet"}>{item.status}</Badge>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-slate-500">{row?.job?.title ?? "Role"} · {item.round}</p>
                    {item.calendarSync && <div className="mt-1.5"><CalendarSyncBadge sync={item.calendarSync} /></div>}
                    </div>
                  </div>
                  <div className="pl-[52px] sm:pl-0">
                    <p className="text-[10px] font-medium text-slate-300">{formatDate(formatZonedDate(item.scheduledAt, item.timezone))} · {formatZonedTime(item.scheduledAt, item.timezone)}</p>
                    <p className="mt-0.5 text-[9px] text-slate-600">{item.durationMinutes} min · {item.timezone}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-[52px] sm:pl-0">
                    <Link href={`/hr/interviews/${item.id}`} className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-[9px] text-slate-400 hover:text-white">Open</Link>
                    {item.status === "Scheduled" && <>
                      <button onClick={() => setRescheduleTarget(item)} className="rounded-lg border border-white/[0.07] px-2.5 py-1.5 text-[9px] text-slate-400 hover:text-white">Reschedule</button>
                      <button onClick={() => setCancelTarget(item)} className="rounded-lg border border-rose-400/15 px-2.5 py-1.5 text-[9px] text-rose-200/70 hover:text-rose-200">Cancel</button>
                    </>}
                  </div>
                </div>
              );
            })}
            {!list.length && <EmptyState title="No interviews in this view" description="Schedule an interview to populate the calendar." icon={CalendarDays} action={<button onClick={() => setScheduleOpen(true)} className={secondaryButton}><CalendarPlus size={13} /> Schedule interview</button>} />}
          </div>
        </section>
      )}

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[10px] leading-5 text-slate-500">
        Email delivery and calendar synchronization are asynchronous. This page shows queued and confirmed event-sync status, not a guarantee that Google delivered an attendee email. Calendar times use each interview&apos;s time zone.
      </div>

      <DatabaseScheduleInterviewDialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        options={options}
        onScheduled={interview => {
          const localDate = formatZonedDate(interview.scheduledAt, interview.timezone);
          setSelectedDate(localDate);
          setYear(Number(localDate.slice(0, 4)));
          setMonth(Number(localDate.slice(5, 7)) - 1);
          refreshData();
        }}
      />
      <DatabaseRescheduleInterviewDialog interview={rescheduleTarget} open={Boolean(rescheduleTarget)} onClose={() => setRescheduleTarget(null)} onSaved={refreshData} />
      <DatabaseCancelInterviewDialog interview={cancelTarget} open={Boolean(cancelTarget)} onClose={() => setCancelTarget(null)} onCancelled={refreshData} />
    </div>
  );
}
