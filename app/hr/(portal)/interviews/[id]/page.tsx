"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  ExternalLink,
  FileText,
  MapPin,
  Mic,
  UserRound
} from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { useIsDatabaseMode } from "@/components/AppModeProvider";
import { DatabaseInterviewDetail } from "@/components/hr/DatabaseInterviewDetail";
import { CancelInterviewDialog, RescheduleInterviewDialog } from "@/components/hr/ScheduleDialogs";
import { Avatar, Badge, DemoBanner, EmptyState, StageBadge } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import { secondaryButton } from "@/lib/ui";

export default function InterviewDetailPage() {
  const params = useParams<{ id: string }>();
  return useIsDatabaseMode() ? <DatabaseInterviewDetail interviewId={params.id} /> : <DemoInterviewDetailPage />;
}

function DemoInterviewDetailPage() {
  const params = useParams<{ id: string }>();
  const store = useDemoData();
  const interview = store.interviews.find(item => item.id === params.id);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!interview) {
    return <EmptyState title="Interview not found" description="This demo interview may have been removed." icon={CalendarDays} action={<Link href="/hr/schedule" className={secondaryButton}><ArrowLeft size={13} /> Back to schedule</Link>} />;
  }

  const candidate = store.candidates.find(item => item.id === interview.candidateId);
  const job = store.jobs.find(item => item.id === interview.jobId);
  const application = store.applications.find(item => item.id === interview.applicationId);
  const assessment = store.assessments.find(item => item.id === interview.assessmentId);
  const stageBadge = interview.status === "Completed" ? "mint" : interview.status === "Cancelled" ? "rose" : "violet";

  return (
    <div className="space-y-5">
      <Link href="/hr/schedule" className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 transition hover:text-white"><ArrowLeft size={12} /> Schedule & calendar</Link>

      <section className="rounded-2xl border border-white/[0.08] bg-card/90 p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={stageBadge}>{interview.status}</Badge>
              <span className="text-[9px] uppercase tracking-[0.14em] text-slate-600">{interview.round}</span>
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-white">Interview with {candidate?.name}</h1>
            <p className="mt-2 text-sm text-slate-400">{job?.title} · {formatDate(interview.scheduledAt)} at {formatTime(interview.scheduledAt)}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[10px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Clock3 size={11} /> {interview.durationMinutes} minutes</span>
              <span className="inline-flex items-center gap-1.5"><MapPin size={11} /> {interview.timezone}</span>
              <span className="inline-flex items-center gap-1.5"><CalendarDays size={11} /> {application?.source ?? "Demo data"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {assessment && <Link href={`/hr/interviews/${interview.id}/report`} className="inline-flex items-center gap-2 rounded-xl bg-mint px-3.5 py-2.5 text-xs font-semibold text-ink"><FileText size={13} /> Open report</Link>}
            <Link href="/live" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.035] px-3.5 py-2.5 text-xs font-medium text-slate-300 hover:text-white"><Mic size={13} /> Live room</Link>
            {interview.status === "Scheduled" && <>
              <button onClick={() => setRescheduleOpen(true)} className={secondaryButton}>Reschedule</button>
              <button onClick={() => setCancelOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-rose-400/15 bg-rose-400/[0.05] px-4 py-2.5 text-xs font-medium text-rose-200 hover:bg-rose-400/[0.1]">Cancel</button>
            </>}
          </div>
        </div>
      </section>

      <DemoBanner compact>This interview record is seeded demo data. No calendar provider is connected, and the live room link opens the existing EchoPanel interview experience separately from this scheduler.</DemoBanner>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
            <h2 className="text-sm font-semibold text-white">Session details</h2>
            <dl className="mt-4 grid gap-4 text-[10px] sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5"><dt className="text-slate-600">Date</dt><dd className="mt-1 text-xs font-medium text-slate-200">{formatDate(interview.scheduledAt)}</dd></div>
              <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5"><dt className="text-slate-600">Time</dt><dd className="mt-1 text-xs font-medium text-slate-200">{formatTime(interview.scheduledAt)} · {interview.timezone}</dd></div>
              <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5"><dt className="text-slate-600">Round</dt><dd className="mt-1 text-xs font-medium text-slate-200">{interview.round}</dd></div>
              <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5"><dt className="text-slate-600">Duration</dt><dd className="mt-1 text-xs font-medium text-slate-200">{interview.durationMinutes} minutes</dd></div>
            </dl>
            <div className="mt-4 border-t border-white/[0.06] pt-4">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">Internal notes</p>
              <p className="mt-2 text-[11px] leading-5 text-slate-400">{interview.notes || "No internal notes for this session."}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
            <h2 className="text-sm font-semibold text-white">Evaluation</h2>
            {assessment ? (
              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-2"><Badge tone="violet">Demo assessment</Badge><Badge tone="mint">{assessment.recommendation}</Badge><span className="text-xs font-semibold text-white">{assessment.overallScore.toFixed(1)} / 10</span></div>
                <p className="mt-3 text-xs leading-6 text-slate-400">{assessment.summary}</p>
                <Link href={`/hr/interviews/${interview.id}/report`} className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-medium text-mint hover:text-white">Read evidence-linked report</Link>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-white/[0.09] bg-black/10 p-5 text-center">
                <FileText size={20} className="mx-auto text-slate-700" />
                <p className="mt-2 text-[11px] text-slate-400">{interview.status === "Completed" ? "No demo report is linked to this completed session." : "The demo assessment becomes available after the interview is completed."}</p>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">Candidate</p>
            <div className="mt-3 flex items-center gap-3">
              <Avatar name={candidate?.name ?? "Candidate"} tone="violet" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">{candidate?.name}</p>
                <p className="mt-0.5 truncate text-[9px] text-slate-500">{candidate?.email}</p>
              </div>
            </div>
            {application && <div className="mt-3"><StageBadge stage={application.stage} /></div>}
            <Link href={`/hr/applicants/${interview.applicationId}`} className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5 text-[10px] text-slate-400 hover:text-white"><span className="inline-flex items-center gap-2"><UserRound size={11} /> Candidate dossier</span><ArrowRight size={10} /></Link>
          </section>
          <section className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">Role</p>
            <p className="mt-2 text-xs font-semibold text-white">{job?.title}</p>
            <p className="mt-1 text-[10px] text-slate-500">{job?.department} · {job?.location}</p>
            {job && <Link href={`/hr/jobs/${job.id}`} className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.07] px-3 py-2.5 text-[10px] text-slate-400 hover:text-white"><span>Job details</span><ExternalLink size={10} /></Link>}
          </section>
          <div className="rounded-2xl border border-amber-300/10 bg-amber-300/[0.025] p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-amber-200/60">Demo limitation</p>
            <p className="mt-2 text-[9px] leading-5 text-slate-500">Rescheduling and cancellation do not notify the candidate or update a real calendar. Use the mail composer to preview what a future notification could include.</p>
            {candidate && <Link href={`/hr/email/compose?candidate=${candidate.id}&application=${interview.applicationId}&template=tpl-interview-reschedule`} className="mt-3 inline-flex items-center gap-1.5 text-[9px] font-medium text-amber-200/80 hover:text-white">Compose reschedule email</Link>}
          </div>
        </aside>
      </div>

      <RescheduleInterviewDialog interview={interview} open={rescheduleOpen} onClose={() => setRescheduleOpen(false)} />
      <CancelInterviewDialog interview={interview} open={cancelOpen} onClose={() => setCancelOpen(false)} />
    </div>
  );
}
