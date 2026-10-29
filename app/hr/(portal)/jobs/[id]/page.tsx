"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  Eye,
  EyeOff,
  Pencil,
  Send,
  Users
} from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { useIsDatabaseMode } from "@/components/AppModeProvider";
import { DatabaseJobDetail } from "@/components/hr/DatabaseJobDetail";
import { useToast } from "@/components/ToastProvider";
import { JobPreview } from "@/components/hr/JobPreview";
import { Avatar, ConfirmDialog, DemoBanner, EmptyState, JobStatusBadge, Modal, StageBadge } from "@/components/ui";
import { buildApplicationRecords, jobApplicantCount } from "@/lib/demo-service";
import { formatDate } from "@/lib/format";
import { secondaryButton } from "@/lib/ui";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  return useIsDatabaseMode() ? <DatabaseJobDetail jobId={params.id} /> : <DemoJobDetailPage />;
}

function DemoJobDetailPage() {
  const params = useParams<{ id: string }>();
  const store = useDemoData();
  const { toast } = useToast();
  const job = store.jobs.find(item => item.id === params.id);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  if (!job) {
    return (
      <EmptyState
        title="Job not found"
        description="This demo role could not be found."
        icon={BriefcaseBusiness}
        action={<Link href="/hr/jobs" className={secondaryButton}><ArrowLeft size={13} /> Back to jobs</Link>}
      />
    );
  }

  const applicants = buildApplicationRecords(store).filter(record => record.application.jobId === job.id);
  const counts = {
    applied: applicants.length,
    interview: applicants.filter(item => item.application.stage === "Interview" || item.interview?.status === "Completed").length,
    selected: applicants.filter(item => item.application.stage === "Selected").length
  };

  const publish = () => {
    store.setJobStatus(job.id, "Published");
    toast("Demo job published. It is now visible on the public careers site.");
  };

  return (
    <div className="space-y-5">
      <Link href="/hr/jobs" className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 transition hover:text-white"><ArrowLeft size={12} /> Back to jobs</Link>

      <section className="rounded-2xl border border-white/[0.08] bg-card/90 p-5 sm:p-6">
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
              <span>{job.location} Â· {job.workplace}</span>
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
                <button onClick={() => setCloseOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-rose-400/15 bg-rose-400/[0.05] px-4 py-2.5 text-sm font-medium text-rose-200 transition hover:bg-rose-400/[0.1]">Close role</button>
              </>
            ) : (
              <button onClick={publish} className="inline-flex items-center gap-2 rounded-xl bg-mint px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-mint-hover"><Send size={13} /> Publish</button>
            )}
          </div>
        </div>
      </section>

      <DemoBanner compact>Publishing state is a frontend demo transition. Changes reset when the browser session ends.</DemoBanner>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.07] bg-card/70 p-4"><div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.1em] text-slate-600"><Users size={11} /> Applicants</div><p className="mt-2 text-2xl font-semibold text-white">{counts.applied}</p></div>
        <div className="rounded-xl border border-white/[0.07] bg-card/70 p-4"><div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.1em] text-slate-600"><CheckCircle2 size={11} /> Interview stage</div><p className="mt-2 text-2xl font-semibold text-violet-200">{counts.interview}</p></div>
        <div className="rounded-xl border border-white/[0.07] bg-card/70 p-4"><div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.1em] text-slate-600"><CheckCircle2 size={11} /> Selected</div><p className="mt-2 text-2xl font-semibold text-mint">{counts.selected}</p></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
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

          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-card/80">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
              <div><h2 className="text-sm font-semibold text-white">Applicants for this role</h2><p className="mt-1 text-[10px] text-slate-500">{jobApplicantCount(store, job.id)} demo candidates</p></div>
              <Link href={`/hr/applicants?job=${job.id}`} className="text-[10px] font-medium text-mint hover:text-white">Full pipeline</Link>
            </div>
            <div className="divide-y divide-white/[0.055]">
              {applicants.slice(0, 6).map(record => (
                <Link key={record.application.id} href={`/hr/applicants/${record.application.id}`} className="group flex items-center gap-3 px-5 py-3.5 transition hover:bg-white/[0.018]">
                  <Avatar name={record.candidate.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-slate-200 group-hover:text-white">{record.candidate.name}</p>
                    <p className="mt-0.5 text-[9px] text-slate-600">Applied {formatDate(record.application.appliedAt)}</p>
                  </div>
                  <StageBadge stage={record.application.stage} />
                  <ArrowRight size={11} className="text-slate-600" />
                </Link>
              ))}
              {!applicants.length && <p className="px-5 py-8 text-center text-xs text-slate-500">No applications for this role yet.</p>}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
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
                <button onClick={publish} className="flex w-full items-center justify-center gap-2 rounded-xl bg-mint px-3 py-2.5 text-[10px] font-semibold text-ink"><Send size={12} /> Publish role</button>
              )}
              {job.status === "Closed" && <button onClick={() => store.setJobStatus(job.id, "Draft")} className="w-full rounded-xl border border-white/[0.08] px-3 py-2.5 text-[10px] text-slate-400 hover:text-white">Move to draft</button>}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-card/60 p-4">
            <p className="text-[10px] font-semibold text-slate-300">Hiring summary</p>
            <div className="mt-3 space-y-2.5 text-[10px]">
              <div className="flex justify-between"><span className="text-slate-600">Open applications</span><span className="text-slate-300">{applicants.filter(item => !["Rejected", "Selected"].includes(item.application.stage)).length}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Interviews</span><span className="text-slate-300">{counts.interview}</span></div>
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
        onConfirm={() => { store.setJobStatus(job.id, "Closed"); setCloseOpen(false); toast("Demo job closed and removed from public view."); }}
        title="Close this role?"
        description="The role will stop accepting public applications and will no longer be visible on the careers site. Internal records remain."
        confirmLabel="Close role"
        tone="danger"
      />
    </div>
  );
}

