"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Github,
  Globe2,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  UserRound
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { Avatar, Badge, EmptyState, Modal, StageBadge } from "@/components/ui";
import { APPLICATION_STAGES, type Application, type ApplicationStage, type Candidate, type Job } from "@/lib/domain";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatFileSize } from "@/lib/format";
import { inputClass, labelClass, secondaryButton, selectClass } from "@/lib/ui";

const STAGE_NOTIFICATION: Partial<Record<ApplicationStage, string>> = {
  "In Review": "status update",
  Selected: "offer",
  Rejected: "rejection"
};

interface DetailResponse {
  application: Application;
  candidate: Candidate;
  job: Job;
}

function scanLabel(application: Application) {
  if (application.cv.scanStatus === "CLEAN") return "Scanned and cleared";
  if (application.cv.scanStatus === "INFECTED") return "Blocked: malware detected";
  if (application.cv.scanStatus === "PENDING") return "Scanning: download blocked";
  if (application.cv.scanStatus === "SCAN_FAILED") return "Blocked: scan failed";
  return "Unscanned: download policy controls access";
}

export function DatabaseApplicantDetailClient() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const [record, setRecord] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [changingStage, setChangingStage] = useState(false);
  const [pendingStage, setPendingStage] = useState<ApplicationStage | null>(null);
  const [stageNotify, setStageNotify] = useState(false);
  const scanStatus = record?.application.cv.scanStatus;

  const load = useCallback(async () => {
    const response = await fetch(`/api/hr/applications/${encodeURIComponent(params.id)}`, { cache: "no-store" });
    const body = await response.json() as DetailResponse & { error?: string };
    if (!response.ok) throw new Error(body.error || "Application not found.");
    setRecord(body);
    setError("");
  }, [params.id]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load().catch(err => {
      if (active) setError(err instanceof Error ? err.message : "Application not found.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [load]);

  useEffect(() => {
    if (scanStatus !== "PENDING" && scanStatus !== "SCAN_FAILED") return;
    let polls = 0;
    const timer = window.setInterval(() => {
      polls += 1;
      if (polls > 15) {
        window.clearInterval(timer);
        return;
      }
      load().catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [load, scanStatus]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-white/[0.04]" />
        <div className="h-48 animate-pulse rounded-2xl bg-white/[0.025]" />
        <div className="h-72 animate-pulse rounded-2xl bg-white/[0.025]" />
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <EmptyState
          title="Application unavailable"
          description={error || "Application not found."}
          icon={UserRound}
          action={<Link href="/hr/applicants" className={secondaryButton}><ArrowLeft size={13} /> Back to applicants</Link>}
        />
      </div>
    );
  }

  const { application, candidate, job } = record;

  const requestStageChange = (stage: ApplicationStage) => {
    if (stage === application.stage || changingStage) return;
    setStageNotify(Boolean(STAGE_NOTIFICATION[stage]));
    setPendingStage(stage);
  };

  const changeStage = async (stage: ApplicationStage, notify: boolean) => {
    if (stage === application.stage || changingStage) return;
    setChangingStage(true);
    try {
      const response = await fetch(`/api/hr/applications/${encodeURIComponent(application.id)}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, notify })
      });
      const body = await response.json() as { error?: string; notificationQueued?: boolean };
      if (!response.ok) throw new Error(body.error || "Could not update the stage.");
      await load();
      setPendingStage(null);
      toast(body.notificationQueued
        ? `Application moved to ${stage}. A stage email was added to the outbox.`
        : `Application moved to ${stage}. No email was queued.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update the stage.", "error");
    } finally {
      setChangingStage(false);
    }
  };

  const saveNote = async () => {
    if (note.trim().length < 2) {
      toast("Write a little more before saving the note.", "error");
      return;
    }
    setSavingNote(true);
    try {
      const response = await fetch(`/api/hr/applications/${encodeURIComponent(application.id)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: note })
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not save the note.");
      setNote("");
      await load();
      toast("Private note saved.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save the note.", "error");
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/hr/applicants" className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 transition hover:text-white">
          <ArrowLeft size={12} /> Applicant pipeline
        </Link>
        <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.12em] text-slate-600">
          <span>Applicants</span><span>/</span><span className="text-slate-400">{application.id}</span>
        </div>
      </div>

      <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a111e]/90 p-5 sm:p-6">
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-start gap-4">
            <Avatar name={candidate.name} size="lg" tone="violet" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white">{candidate.name}</h1>
                <StageBadge stage={application.stage} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] text-slate-500">
                <span className="inline-flex items-center gap-1.5"><Mail size={10} /> {candidate.email}</span>
                <span className="inline-flex items-center gap-1.5"><Phone size={10} /> {candidate.phone}</span>
                <span className="inline-flex items-center gap-1.5"><MapPin size={10} /> {candidate.location}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={application.stage}
              disabled={changingStage}
              onChange={event => requestStageChange(event.target.value as ApplicationStage)}
              className={`${selectClass} h-9 min-w-[145px] py-0 text-[10px]`}
              aria-label="Change application stage"
            >
              {APPLICATION_STAGES.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <Link href="/hr/email/activity" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] px-3 text-[10px] text-slate-500 hover:text-white">
              <Mail size={12} /> Email activity
            </Link>
            <Link href="/hr/interviews" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] px-3 text-[10px] text-slate-500 hover:text-white">
              <CalendarDays size={12} /> Interviews
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_315px]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Application details</h2>
                <p className="mt-1 text-[10px] text-slate-500">Stored in the recruitment database for this organization.</p>
              </div>
              <Badge tone="mint">Verified record</Badge>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5">
                <p className={labelClass}>Selected job</p>
                <p className="text-xs font-medium text-slate-200">{job.title}</p>
                <p className="mt-1.5 text-[9px] text-slate-600">{job.department} · {job.location}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5">
                <p className={labelClass}>Applied</p>
                <p className="text-xs font-medium text-slate-200">{formatDate(application.appliedAt)}</p>
                <p className="mt-1.5 text-[9px] text-slate-600">Source: {application.source}</p>
              </div>
            </div>
            <div className="mt-5 border-t border-white/[0.06] pt-5">
              <p className={labelClass}>Cover letter</p>
              <p className="whitespace-pre-wrap text-xs leading-6 text-slate-400">{application.coverLetter}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">CV & links</h2>
                <p className="mt-1 text-[10px] text-slate-500">Private files are served only to authenticated members of this organization.</p>
              </div>
              <Badge tone="violet">Private storage</Badge>
            </div>
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-black/10 p-4 sm:flex-row sm:items-center">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-400"><FileText size={17} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-200">{application.cv.fileName}</p>
                <p className="mt-1 text-[9px] text-slate-500">{formatFileSize(application.cv.size)} · {scanLabel(application)}</p>
              </div>
              {application.cv.downloadable && application.cv.downloadUrl ? (
                <a href={application.cv.downloadUrl} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-mint/20 bg-mint/[0.06] px-3 py-2 text-[10px] font-medium text-mint hover:bg-mint/[0.1]">
                  <Download size={11} /> Download CV
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/15 px-3 py-2 text-[9px] text-amber-200/75"><ShieldCheck size={11} /> Download blocked</span>
              )}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                { label: "LinkedIn", href: candidate.linkedinUrl, icon: Linkedin },
                { label: "GitHub", href: candidate.githubUrl, icon: Github },
                { label: "Portfolio", href: candidate.portfolioUrl, icon: Globe2 }
              ].map(item => {
                const Icon = item.icon;
                return item.href ? (
                  <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-[10px] text-slate-400 transition hover:border-white/[0.15] hover:text-white">
                    <span className="inline-flex items-center gap-2"><Icon size={12} /> {item.label}</span><ExternalLink size={10} />
                  </a>
                ) : (
                  <span key={item.label} className="flex items-center gap-2 rounded-lg border border-dashed border-white/[0.06] px-3 py-2.5 text-[10px] text-slate-600"><Icon size={12} /> {item.label} not provided</span>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Private HR notes</h2>
                <p className="mt-1 text-[10px] text-slate-500">Notes are scoped to this organization.</p>
              </div>
              <Badge tone="slate">{application.notes.length}</Badge>
            </div>
            <div className="mt-4 space-y-2.5">
              {application.notes.map(item => (
                <div key={item.id} className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5">
                  <div className="flex items-center justify-between gap-3 text-[9px] text-slate-600"><span>{item.author}</span><span>{formatDateTime(item.createdAt)}</span></div>
                  <p className="mt-2 text-[11px] leading-5 text-slate-400">{item.body}</p>
                </div>
              ))}
              {!application.notes.length && <p className="py-3 text-[10px] text-slate-600">No private notes yet.</p>}
            </div>
            <div className="mt-4 border-t border-white/[0.06] pt-4">
              <textarea value={note} onChange={event => setNote(event.target.value)} rows={3} className={`${inputClass} resize-y`} placeholder="Add a private note for the hiring team…" />
              <div className="mt-2 flex justify-end">
                <button onClick={() => void saveNote()} disabled={savingNote} className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-[10px] font-medium text-slate-300 hover:bg-white/[0.1] hover:text-white disabled:opacity-50"><Plus size={10} /> {savingNote ? "Saving…" : "Save note"}</button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
            <h2 className="text-sm font-semibold text-white">Application timeline</h2>
            <div className="mt-5 space-y-0">
              {application.history.map((item, index) => (
                <div key={item.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={cn("mt-1 h-2 w-2 rounded-full", item.type === "note" ? "bg-violet" : item.type === "status" ? "bg-mint" : "bg-slate-500")} />
                    {index < application.history.length - 1 && <span className="my-1 w-px flex-1 bg-white/[0.06]" />}
                  </div>
                  <div className="min-w-0 flex-1 pb-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-medium text-slate-200">{item.label}</p>
                      <span className="text-[9px] text-slate-600">{formatDateTime(item.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">{item.detail}</p>
                    <p className="mt-1 text-[8px] uppercase tracking-[0.08em] text-slate-700">{item.actor}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">Snapshot</p>
            <dl className="mt-3 space-y-2.5 text-[10px]">
              <div className="flex justify-between gap-3"><dt className="text-slate-600">Stage</dt><dd><StageBadge stage={application.stage} /></dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-600">Applied</dt><dd className="text-slate-400">{formatDate(application.appliedAt)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-600">CV scan</dt><dd className="text-slate-400">{application.cv.scanStatus ?? "Unavailable"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-600">Notes</dt><dd className="text-slate-400">{application.notes.length}</dd></div>
            </dl>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-4">
            <div className="flex items-center gap-2 text-[10px] font-medium text-slate-300"><ShieldCheck size={12} className="text-mint" /> Organization isolation</div>
            <p className="mt-2 text-[9px] leading-4 text-slate-600">Every application, note, and CV request is filtered by the signed-in user&apos;s organization membership.</p>
            <Link href="/hr/applicants" className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.07] px-2.5 py-2 text-[9px] text-slate-400 transition hover:text-white">Back to pipeline <ArrowRight size={10} /></Link>
          </section>

          <section className="rounded-2xl border border-amber-300/10 bg-amber-300/[0.025] p-4">
            <div className="flex items-center gap-2 text-[10px] font-medium text-amber-200/80"><CheckCircle2 size={12} /> Explicit notifications</div>
            <p className="mt-2 text-[9px] leading-4 text-slate-500">Stage changes are always persisted. A stage email is added to the outbox only when you explicitly select it. Delivery depends on provider configuration and the email worker.</p>
          </section>
        </aside>
      </div>

      <Modal
        open={Boolean(pendingStage)}
        onClose={() => { if (!changingStage) setPendingStage(null); }}
        title={pendingStage ? `Move to ${pendingStage}?` : "Update stage"}
        description={`The application will move from ${application.stage} to ${pendingStage ?? "the selected stage"}. Stage changes are persisted immediately.`}
        size="sm"
        footer={
          <>
            <button onClick={() => setPendingStage(null)} disabled={changingStage} className={secondaryButton}>Cancel</button>
            <button onClick={() => { if (pendingStage) void changeStage(pendingStage, stageNotify); }} disabled={changingStage || !pendingStage} className="inline-flex items-center justify-center rounded-xl bg-mint px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-50">{changingStage ? "Updating..." : "Update stage"}</button>
          </>
        }
      >
        {pendingStage && STAGE_NOTIFICATION[pendingStage] && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
            <input type="checkbox" checked={stageNotify} onChange={event => setStageNotify(event.target.checked)} className="mt-0.5 h-4 w-4 accent-mint" />
            <span>
              <span className="block text-[11px] font-medium text-slate-200">Queue a {STAGE_NOTIFICATION[pendingStage]} email</span>
              <span className="mt-1 block text-[9px] leading-4 text-slate-500">The message is added to the durable outbox in the same transaction as the stage change. It is not sent synchronously.</span>
            </span>
          </label>
        )}
        {pendingStage && !STAGE_NOTIFICATION[pendingStage] && (
          <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 text-[10px] leading-5 text-slate-500">This stage has no automatic notification template. Only the stage change will be recorded.</p>
        )}
      </Modal>
    </div>
  );
}
