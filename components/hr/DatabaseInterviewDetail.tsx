"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Mail,
  MapPin,
  Mic,
  TriangleAlert,
  UserRound
} from "lucide-react";
import {
  DatabaseCancelInterviewDialog,
  DatabaseRescheduleInterviewDialog
} from "@/components/hr/DatabaseScheduleDialogs";
import { CalendarSyncPanel } from "@/components/hr/CalendarSyncStatus";
import { useToast } from "@/components/ToastProvider";
import { Avatar, Badge, ConfirmDialog, EmptyState, ProgressBar, StageBadge } from "@/components/ui";
import type { ApplicationStage, Candidate, Interview, Job } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { formatZonedDate, formatZonedTime } from "@/lib/timezone";
import { secondaryButton } from "@/lib/ui";

interface ApiAssessment {
  id: string;
  overallScore: number;
  recommendation: string;
  summary: string;
  dimensions: Record<string, { score: number; evidence: string[]; confidence: number }>;
  strengths: string[];
  risks: string[];
  unresolvedConcerns: string[];
  generatedAt: string;
  source: string;
  isDemo: boolean;
}

interface DetailResponse {
  interview: Interview;
  candidate: Candidate;
  job: Job;
  application: { id: string; stage: ApplicationStage; source: string };
  assessment: ApiAssessment | null;
  error?: string;
}

const DIMENSION_LABELS: Record<string, string> = {
  technical: "Technical depth",
  product: "Product judgement",
  communication: "Communication",
  problemSolving: "Problem solving",
  adaptability: "Adaptability"
};

export function DatabaseInterviewDetail({ interviewId }: { interviewId: string }) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [joinLink, setJoinLink] = useState<{ url: string; expiresAt: string; emailConfigured: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/hr/interviews/${encodeURIComponent(interviewId)}`, { cache: "no-store" });
      const body = await response.json() as DetailResponse;
      if (!response.ok || !body.interview) throw new Error(body.error || "Interview could not be loaded.");
      setDetail(body);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Interview could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [interviewId]);

  useEffect(() => { void load(); }, [load]);

  // Issues a one-time candidate link (revoking any earlier unused one) and queues it by email.
  const sendCandidateLink = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/hr/interviews/${encodeURIComponent(detail.interview.id)}/invitation`, { method: "POST" });
      const body = await response.json() as { joinUrl?: string; expiresAt?: string; emailConfigured?: boolean; error?: string };
      if (!response.ok || !body.joinUrl || !body.expiresAt) throw new Error(body.error || "The interview link could not be created.");
      setJoinLink({ url: body.joinUrl, expiresAt: body.expiresAt, emailConfigured: Boolean(body.emailConfigured) });
      toast(body.emailConfigured ? "Interview link queued for email." : "Interview link created. Email is not configured, so share it directly.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "The interview link could not be created.", "error");
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/hr/interviews/${encodeURIComponent(detail.interview.id)}/complete`, { method: "POST" });
      const body = await response.json() as { interview?: Interview; error?: string };
      if (!response.ok || !body.interview) throw new Error(body.error || "Interview could not be completed.");
      toast("Interview marked complete. No assessment was generated.");
      setCompleteOpen(false);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Interview could not be completed.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !detail) {
    return <div className="space-y-4"><div className="h-10 w-40 animate-pulse rounded-lg bg-white/[0.04]" /><div className="h-44 animate-pulse rounded-2xl bg-white/[0.03]" /><div className="h-64 animate-pulse rounded-2xl bg-white/[0.025]" /></div>;
  }

  if (error || !detail) {
    return <EmptyState title="Interview unavailable" description={error || "This interview could not be found."} icon={CalendarDays} action={<Link href="/hr/schedule" className={secondaryButton}><ArrowLeft size={13} /> Back to schedule</Link>} />;
  }

  const { interview, candidate, job, application, assessment } = detail;
  const tone = interview.status === "Completed" ? "mint" : interview.status === "Cancelled" ? "rose" : "violet";
  const dimensions = assessment ? Object.entries(assessment.dimensions) : [];

  return (
    <div className="space-y-5">
      <Link href="/hr/schedule" className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 transition hover:text-white"><ArrowLeft size={12} /> Schedule & calendar</Link>

      <section className="rounded-2xl border border-white/[0.08] bg-card/90 p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={tone}>{interview.status}</Badge>
              <span className="text-[9px] uppercase tracking-[0.14em] text-slate-600">{interview.round}</span>
              <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[9px] text-slate-500">PostgreSQL</span>
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-white">Interview with {candidate.name}</h1>
            <p className="mt-2 text-sm text-slate-400">{job.title} · {formatDate(formatZonedDate(interview.scheduledAt, interview.timezone))} at {formatZonedTime(interview.scheduledAt, interview.timezone)}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[10px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Clock3 size={11} /> {interview.durationMinutes} minutes</span>
              <span className="inline-flex items-center gap-1.5"><MapPin size={11} /> {interview.timezone}</span>
              <span className="inline-flex items-center gap-1.5"><CalendarDays size={11} /> {application.source || "Application"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {assessment
              ? <Link href={`/hr/interviews/${interview.id}/report`} className="inline-flex items-center gap-2 rounded-xl bg-mint px-3.5 py-2.5 text-xs font-semibold text-ink"><FileText size={13} /> Open report</Link>
              : <Link href={`/hr/interviews/${interview.id}/report`} className={secondaryButton}><FileText size={13} /> Report status</Link>}
            <Link href={`/setup?interviewId=${encodeURIComponent(interview.id)}`} className="inline-flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.035] px-3.5 py-2.5 text-xs font-medium text-slate-300 hover:text-white"><Mic size={13} /> Live room</Link>
            {interview.status === "Scheduled" && <>
              <button onClick={sendCandidateLink} disabled={busy} className={secondaryButton}><Mail size={13} /> Send candidate link</button>
              <button onClick={() => setCompleteOpen(true)} className={secondaryButton}><CheckCircle2 size={13} /> Complete</button>
              <button onClick={() => setRescheduleOpen(true)} className={secondaryButton}>Reschedule</button>
              <button onClick={() => setCancelOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-rose-400/15 bg-rose-400/[0.05] px-4 py-2.5 text-xs font-medium text-rose-200 hover:bg-rose-400/[0.1]">Cancel</button>
            </>}
          </div>
        </div>
        {joinLink && (
          <div className="mt-4 rounded-xl border border-mint/20 bg-mint/[0.04] p-3 text-[11px] text-slate-300">
            <p className="font-medium text-white">One-time candidate link{joinLink.emailConfigured ? " (also queued by email)" : ""}</p>
            <p className="mt-1 text-slate-500">Works once, expires {new Date(joinLink.expiresAt).toLocaleString()}. Issuing a new link revokes this one. It is shown only now.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-black/30 px-2.5 py-2 text-slate-300">{joinLink.url}</code>
              <button onClick={() => { void navigator.clipboard?.writeText(joinLink.url); toast("Link copied."); }} className={secondaryButton}>Copy</button>
            </div>
          </div>
        )}
      </section>

      <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] px-4 py-3 text-[10px] leading-5 text-amber-200/75">
        This record is stored in PostgreSQL. Rescheduling and cancellation request an update to the connected Google Calendar when sync is enabled. Email delivery and calendar synchronization are asynchronous; calendar success means Google accepted the event change, not that an attendee email was delivered. Completing an interview does not generate an assessment or report.
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
            <h2 className="text-sm font-semibold text-white">Session details</h2>
            <dl className="mt-4 grid gap-4 text-[10px] sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5"><dt className="text-slate-600">Date</dt><dd className="mt-1 text-xs font-medium text-slate-200">{formatDate(formatZonedDate(interview.scheduledAt, interview.timezone))}</dd></div>
              <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5"><dt className="text-slate-600">Time</dt><dd className="mt-1 text-xs font-medium text-slate-200">{formatZonedTime(interview.scheduledAt, interview.timezone)} · {interview.timezone}</dd></div>
              <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5"><dt className="text-slate-600">Round</dt><dd className="mt-1 text-xs font-medium text-slate-200">{interview.round}</dd></div>
              <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5"><dt className="text-slate-600">Duration</dt><dd className="mt-1 text-xs font-medium text-slate-200">{interview.durationMinutes} minutes</dd></div>
            </dl>
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/10 p-3.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">Internal notes</p>
              <p className="mt-2 whitespace-pre-wrap text-[11px] leading-6 text-slate-400">{interview.notes || "No internal notes were recorded."}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Assessment & report</h2>
                <p className="mt-1 text-[10px] text-slate-500">Only assessments explicitly saved against this interview appear here.</p>
              </div>
              {assessment ? <Badge tone={assessment.isDemo ? "amber" : "mint"}>{assessment.isDemo ? "Demo record" : "Persisted assessment"}</Badge> : <Badge tone="slate">Not linked</Badge>}
            </div>
            {assessment ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/10 p-4">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.12em] text-slate-600">Overall score</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{assessment.overallScore.toFixed(1)}<span className="text-xs text-slate-600"> / 10</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-slate-600">Recommendation</p>
                    <p className="mt-1 text-sm font-semibold text-mint">{assessment.recommendation}</p>
                  </div>
                </div>
                <p className="text-[11px] leading-6 text-slate-400">{assessment.summary}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {dimensions.map(([key, value]) => (
                    <div key={key} className="rounded-xl border border-white/[0.06] bg-black/10 p-3">
                      <div className="flex items-center justify-between gap-2 text-[9px]"><span className="text-slate-500">{DIMENSION_LABELS[key] ?? key}</span><span className="text-slate-300">{typeof value.score === "number" ? value.score.toFixed(1) : "Insufficient evidence"}</span></div>
                      <div className="mt-2"><ProgressBar value={typeof value.score === "number" ? value.score * 10 : 0} /></div>
                    </div>
                  ))}
                </div>
                <Link href={`/hr/interviews/${interview.id}/report`} className="inline-flex items-center gap-1.5 text-[10px] font-medium text-mint hover:text-white">Open full report <ArrowLeft size={10} className="rotate-180" /></Link>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/[0.09] p-5">
                <div className="flex items-start gap-3">
                  <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-200/70" />
                  <div>
                    <p className="text-xs font-medium text-slate-300">No assessment is linked to this interview.</p>
                    <p className="mt-1.5 text-[10px] leading-5 text-slate-500">
                      A report is not fabricated from scheduling data. Once a real live assessment is generated and explicitly saved for this interview, it will appear here.
                    </p>
                    <Link href={`/setup?interviewId=${encodeURIComponent(interview.id)}`} className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-medium text-mint hover:text-white">Open live interview <ArrowLeft size={10} className="rotate-180" /></Link>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
            <div className="flex items-center gap-2.5">
              <Avatar name={candidate.name} tone="violet" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">{candidate.name}</p>
                <p className="truncate text-[9px] text-slate-600">{candidate.email}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2.5 text-[10px]">
              <div className="flex items-center justify-between gap-2"><span className="text-slate-600">Application</span><StageBadge stage={application.stage} /></div>
              <div className="flex items-center justify-between gap-2"><span className="text-slate-600">Role</span><span className="truncate text-right text-slate-300">{job.title}</span></div>
            </div>
            <Link href={`/hr/applicants/${application.id}`} className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.07] px-3 py-2 text-[10px] text-slate-400 hover:text-white"><UserRound size={11} /> Open application</Link>
          </section>

          <CalendarSyncPanel sync={interview.calendarSync ?? null} onRetried={() => { void load(); }} />

          <div className="rounded-2xl border border-white/[0.07] bg-card/60 p-4">
            <p className="text-[10px] font-semibold text-slate-300">Reminder</p>
            <p className="mt-2 text-[9px] leading-5 text-slate-600">Scheduling, status changes, and linked assessments are recorded as application events. Email delivery and calendar synchronization are recorded separately and are not implied by scheduling alone.</p>
          </div>
        </aside>
      </div>

      <DatabaseRescheduleInterviewDialog interview={interview} open={rescheduleOpen} onClose={() => setRescheduleOpen(false)} onSaved={() => { void load(); }} />
      <DatabaseCancelInterviewDialog interview={interview} open={cancelOpen} onClose={() => setCancelOpen(false)} onCancelled={() => { void load(); }} />
      <ConfirmDialog
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        onConfirm={complete}
        title="Mark this interview complete?"
        description="This updates the persisted interview status and records an application event. It does not create an assessment or report."
        confirmLabel="Mark complete"
        busy={busy}
      />
    </div>
  );
}
