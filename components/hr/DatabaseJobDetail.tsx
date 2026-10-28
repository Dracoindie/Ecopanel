"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Send,
  Users
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { JobPreview } from "@/components/hr/JobPreview";
import { Avatar, Badge, ConfirmDialog, EmptyState, JobStatusBadge, Modal, StageBadge } from "@/components/ui";
import type { Application, Candidate, Job } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { secondaryButton } from "@/lib/ui";

interface JobRecord {
  job: Job;
  counts: { applications: number; interviewStage: number; selected: number };
}

interface ApplicantsResponse {
  applications: Application[];
  candidates: Candidate[];
  jobs: Job[];
}

export function DatabaseJobDetail({ jobId }: { jobId: string }) {
  const { toast } = useToast();
  const [record, setRecord] = useState<JobRecord | null>(null);
  const [rows, setRows] = useState<Array<{ application: Application; candidate: Candidate }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/hr/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" }).then(async response => {
        const body = await response.json() as JobRecord & { error?: string };
        if (!response.ok || !body.job) throw new Error(body.error || "Job not found.");
        return body;
      }),
      fetch(`/api/hr/applications?jobId=${encodeURIComponent(jobId)}&pageSize=6`, { cache: "no-store" }).then(async response => {
        const body = await response.json() as ApplicantsResponse & { error?: string };
        if (!response.ok) throw new Error(body.error || "Applicants could not be loaded.");
        return body;
      })
    ])
      .then(([jobRecord, applicants]) => {
        if (!active) return;
        setRecord(jobRecord);
        const candidates = new Map(applicants.candidates.map(candidate => [candidate.id, candidate]));
        setRows(applicants.applications.flatMap(application => {
          const candidate = candidates.get(application.candidateId);
          return candidate ? [{ application, candidate }] : [];
        }));
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : "Job not found.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [jobId]);

  const changeStatus = async (status: Job["status"]) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/hr/jobs/${encodeURIComponent(jobId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const body = await response.json() as { job?: Job; error?: string };
      if (!response.ok || !body.job) throw new Error(body.error || "Job status could not be changed.");
      setRecord(current => current ? { ...current, job: body.job! } : current);
      toast(status === "Published" ? "Job published to the public careers site." : status === "Closed" ? "Job closed and removed from public view." : "Job moved to draft.");
      setCloseOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Job status could not be changed.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="space-y-4"><div className="h-8 w-48 animate-pulse rounded-lg bg-white/[0.04]" /><div className="h-48 animate-pulse rounded-2xl bg-white/[0.025]" /><div className="h-72 animate-pulse rounded-2xl bg-white/[0.025]" /></div>;
  }

  if (error || !record) {
    return <EmptyState title="Job unavailable" description={error || "This role could not be found."} icon={BriefcaseBusiness} action={<Link href="/hr/jobs" className={secondaryButton}><ArrowLeft size={13} /> Back to jobs</Link>} />;
  }

  const { job, counts } = record;

  return (
    <div className="space-y-5">
      <Link href="/hr/jobs" className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 transition hover:text-white"><ArrowLeft size={12} /> Back to jobs</Link>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0a111e]/90 p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <JobStatusBadge status={job.status} />
              <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[9px] text-slate-500">{job.department}</span>
              <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[9px] text-slate-500">{job.employmentType}</span>
              {job.publicVisible && job.status === "Published" ? <span className="inline-flex items-center gap-1 text-[9px] text-mint"><Eye size={10} /> Publicly visible</span> : <span className="inline-flex items-center gap-1 text-[9px] text-slate-600"><EyeOff size={10} /> Not public</span>}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white">{job.title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{job.shortDescription}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[10px] text-slate-500">
              <span>{job.location} · {job.workplace}</span>
              <span>{job.salaryRange}</span>
              <span>Created {formatDate(job.createdAt)}</span>
              {job.publishedAt && <span>Published {formatDate(job.publishedAt)}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/hr/jobs/${job.id}/edit`} className={secondaryButton}><Pencil size={13} /> Edit</Link>
            <button onClick={() => setPreviewOpen(true)} className={secondaryButton}><Eye size={13} /> Preview</button>
            {job.status === "Published" ? (
              <>
                <Link href={`/careers/jobs/${job.id}`} target="_blank" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.035] px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:text-white"><ArrowUpRight size={13} /> Public page</Link>
                <button onClick={() => setCloseOpen(true)} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-rose-400/15 bg-rose-400/[0.05] px-4 py-2.5 text-sm font-medium text-rose-200 transition hover:bg-rose-400/[0.1]">Close role</button>
              </>
            ) : (
              <button onClick={() => changeStatus("Published")} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-mint px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-[#9bf8d5]">{busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Publish</button>
            )}
          </div>
        </div>
      </section>

      <div className="rounded-xl border border-mint/15 bg-mint/[0.035] px-4 py-3 text-[10px] leading-5 text-mint/80">
        Job content and publication state are stored in PostgreSQL. Public visibility is enforced by the careers API.
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.07] bg-[#0a111e]/70 p-4"><div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.1em] text-slate-600"><Users size={11} /> Applicants</div><p className="mt-2 text-2xl font-semibold text-white">{counts.applications}</p></div>
        <div className="rounded-xl border border-white/[0.07] bg-[#0a111e]/70 p-4"><div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.1em] text-slate-600"><CheckCircle2 size={11} /> Interview stage</div><p className="mt-2 text-2xl font-semibold text-violet-200">{counts.interviewStage}</p></div>
        <div className="rounded-xl border border-white/[0.07] bg-[#0a111e]/70 p-4"><div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.1em] text-slate-600"><CheckCircle2 size={11} /> Selected</div><p className="mt-2 text-2xl font-semibold text-mint">{counts.selected}</p></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
            <h2 className="text-sm font-semibold text-white">Role description</h2>
            <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-slate-400">{job.description}</p>
            <div className="mt-6 grid gap-6 border-t border-white/[0.06] pt-5 sm:grid-cols-2">
              <div>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Responsibilities</h3>
                <div className="mt-3 space-y-2">{job.responsibilities.map(item => <p key={item} className="flex gap-2 text-[11px] leading-5 text-slate-400"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-violet-300/70" /> {item}</p>)}</div>
              </div>
              <div>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Qualifications</h3>
                <div className="mt-3 space-y-2">{job.qualifications.map(item => <p key={item} className="flex gap-2 text-[11px] leading-5 text-slate-400"><CheckCircle2 size={11} className="mt-1 shrink-0 text-mint/60" /> {item}</p>)}</div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a111e]/80">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
              <div><h2 className="text-sm font-semibold text-white">Applicants for this role</h2><p className="mt-1 text-[10px] text-slate-500">{counts.applications} stored candidates</p></div>
              <Link href={`/hr/applicants?jobId=${job.id}`} className="text-[10px] font-medium text-mint hover:text-white">Full pipeline</Link>
            </div>
            <div className="divide-y divide-white/[0.055]">
              {rows.map(row => (
                <Link key={row.application.id} href={`/hr/applicants/${row.application.id}`} className="group flex items-center gap-3 px-5 py-3.5 transition hover:bg-white/[0.018]">
                  <Avatar name={row.candidate.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-slate-200 group-hover:text-white">{row.candidate.name}</p>
                    <p className="mt-0.5 text-[9px] text-slate-600">Applied {formatDate(row.application.appliedAt)}</p>
                  </div>
                  <StageBadge stage={row.application.stage} />
                  <ArrowRight size={11} className="text-slate-600" />
                </Link>
              ))}
              {!rows.length && <p className="px-5 py-8 text-center text-xs text-slate-500">No applications for this role yet.</p>}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
            <h2 className="text-sm font-semibold text-white">Publication controls</h2>
            <div className="mt-4 space-y-3 text-[10px]">
              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Status</span><JobStatusBadge status={job.status} /></div>
              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Public visibility</span><span className={job.publicVisible ? "text-mint" : "text-slate-600"}>{job.publicVisible ? "Enabled" : "Disabled"}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Public URL</span><span className="font-mono text-[9px] text-slate-600">/careers/jobs/{job.id}</span></div>
            </div>
            <div className="mt-4 space-y-2">
              {job.status === "Published" ? (
                <Link href={`/careers/jobs/${job.id}`} target="_blank" className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2.5 text-[10px] font-medium text-slate-200 hover:bg-white/[0.09] hover:text-white"><ArrowUpRight size={12} /> Open public role</Link>
              ) : (
                <button onClick={() => changeStatus("Published")} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-mint px-3 py-2.5 text-[10px] font-semibold text-ink"><Send size={12} /> Publish role</button>
              )}
              {job.status === "Closed" && <button onClick={() => changeStatus("Draft")} disabled={busy} className="w-full rounded-xl border border-white/[0.08] px-3 py-2.5 text-[10px] text-slate-400 hover:text-white">Move to draft</button>}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/60 p-4">
            <p className="text-[10px] font-semibold text-slate-300">Hiring summary</p>
            <div className="mt-3 space-y-2.5 text-[10px]">
              <div className="flex justify-between"><span className="text-slate-600">Applications</span><span className="text-slate-300">{counts.applications}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Interviews</span><span className="text-slate-300">{counts.interviewStage}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Selected</span><span className="text-slate-300">{counts.selected}</span></div>
            </div>
          </div>
        </aside>
      </div>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Public role preview" description="Preview of the live careers listing." size="lg" footer={<button onClick={() => setPreviewOpen(false)} className={secondaryButton}>Close preview</button>}>
        <JobPreview job={job} />
      </Modal>

      <ConfirmDialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        onConfirm={() => changeStatus("Closed")}
        title="Close this role?"
        description="The role will stop accepting public applications and will no longer be visible on the careers site. Internal records remain."
        confirmLabel="Close role"
        tone="danger"
        busy={busy}
      />
    </div>
  );
}
