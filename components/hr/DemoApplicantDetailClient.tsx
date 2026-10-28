"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
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
  MessageSquare,
  Mic,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRound
} from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { useToast } from "@/components/ToastProvider";
import { CancelInterviewDialog, RescheduleInterviewDialog, ScheduleInterviewDialog } from "@/components/hr/ScheduleDialogs";
import { Avatar, Badge, DemoBanner, EmptyState, Modal, ProgressBar, StageBadge } from "@/components/ui";
import { APPLICATION_STAGES, type ApplicationStage } from "@/lib/domain";
import { getApplicationRecord } from "@/lib/demo-service";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatFileSize, formatTime, initials } from "@/lib/format";
import { inputClass, labelClass, primaryButton, secondaryButton, selectClass } from "@/lib/ui";

type Tab = "profile" | "assessment" | "activity";

const stageTemplate: Record<ApplicationStage, string> = {
  New: "tpl-app-received",
  "In Review": "tpl-status-update",
  Shortlisted: "tpl-shortlisted",
  Interview: "tpl-interview-invite",
  Selected: "tpl-offer",
  Rejected: "tpl-rejection"
};

const dimensionLabels = {
  technical: "Technical depth",
  product: "Product judgement",
  communication: "Communication",
  problemSolving: "Problem solving",
  adaptability: "Adaptability"
} as const;

export default function CandidateProfilePage() {
  const params = useParams<{ id: string }>();
  const store = useDemoData();
  const { toast } = useToast();
  const record = getApplicationRecord(store, params.id);
  const [tab, setTab] = useState<Tab>("profile");
  const [note, setNote] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [cvOpen, setCvOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const assessment = useMemo(
    () => (record ? store.assessments.find(item => item.applicationId === record.application.id) : undefined),
    [record, store.assessments]
  );
  const candidateEmails = useMemo(
    () => (record ? store.emails.filter(item => item.candidateId === record.candidate.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []),
    [record, store.emails]
  );
  const interviews = useMemo(
    () => (record ? store.interviews.filter(item => item.applicationId === record.application.id).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)) : []),
    [record, store.interviews]
  );

  if (!record) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <EmptyState
          title="Application not found"
          description="This demo applicant may have been removed with the browser session."
          icon={UserRound}
          action={<Link href="/hr/applicants" className={secondaryButton}><ArrowLeft size={13} /> Back to applicants</Link>}
        />
      </div>
    );
  }

  const { application, candidate, job } = record;
  const interview = interviews[0] ?? record.interview;
  const emailHref = `/hr/email/compose?candidate=${candidate.id}&application=${application.id}&template=${stageTemplate[application.stage]}`;

  const changeStage = (stage: ApplicationStage) => {
    if (stage === application.stage) return;
    store.updateApplicationStage(application.id, stage);
    toast(`Demo application moved to ${stage}.`);
  };

  const saveNote = () => {
    if (note.trim().length < 3) {
      toast("Write a little more before saving the note.", "error");
      return;
    }
    store.addApplicationNote(application.id, note);
    setNote("");
    toast("Private demo note saved.");
  };

  const activity = [
    ...application.history.map(item => ({
      id: item.id,
      at: item.createdAt,
      type: item.type,
      title: item.label,
      detail: item.detail,
      actor: item.actor
    })),
    ...candidateEmails.map(item => ({
      id: item.id,
      at: item.createdAt,
      type: "email" as const,
      title: `Email ${item.status.toLowerCase()} (demo)`,
      detail: item.subject,
      actor: "EchoPanel mail centre"
    })),
    ...interviews.map(item => ({
      id: `activity-${item.id}`,
      at: item.scheduledAt,
      type: "interview" as const,
      title: item.status === "Completed" ? "Interview completed" : item.status === "Cancelled" ? "Interview cancelled" : "Interview scheduled",
      detail: `${item.round} · ${formatDateTime(item.scheduledAt, item.timezone)}`,
      actor: "EchoPanel demo calendar"
    }))
  ].sort((a, b) => b.at.localeCompare(a.at));

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
        <div className="pointer-events-none absolute right-0 top-0 h-56 w-56 bg-[radial-gradient(circle,rgba(156,140,255,.1),transparent_68%)]" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-start gap-4">
            <Avatar name={candidate.name} size="lg" tone="violet" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white">{candidate.name}</h1>
                <StageBadge stage={application.stage} />
              </div>
              <p className="mt-1.5 text-xs text-slate-400">{candidate.headline}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] text-slate-500">
                <span className="inline-flex items-center gap-1.5"><Mail size={10} /> {candidate.email}</span>
                <span className="inline-flex items-center gap-1.5"><Phone size={10} /> {candidate.phone}</span>
                <span className="inline-flex items-center gap-1.5"><MapPin size={10} /> {candidate.location}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select value={application.stage} onChange={event => changeStage(event.target.value as ApplicationStage)} className={`${selectClass} h-9 min-w-[145px] py-0 text-[10px]`} aria-label="Change application stage">
                {APPLICATION_STAGES.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <button onClick={() => setScheduleOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 text-[10px] font-medium text-slate-300 transition hover:text-white">
              <CalendarDays size={12} /> Schedule
            </button>
            <Link href={emailHref} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-mint px-3 text-[10px] font-semibold text-ink transition hover:bg-[#9bf8d5]">
              <Mail size={12} /> Email candidate
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_315px]">
        <div className="min-w-0">
          <div className="flex gap-1 overflow-x-auto border-b border-white/[0.07]">
            {([
              ["profile", "Candidate profile", UserRound],
              ["assessment", "Interview intelligence", Sparkles],
              ["activity", "Activity & communication", MessageSquare]
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-[11px] font-medium transition",
                  tab === value ? "border-mint text-white" : "border-transparent text-slate-500 hover:text-slate-200"
                )}
              >
                <Icon size={13} className={tab === value ? "text-mint" : ""} />
                {label}
                {value === "assessment" && assessment && <span className="h-1.5 w-1.5 rounded-full bg-mint" />}
              </button>
            ))}
          </div>

          {tab === "profile" && (
            <div className="mt-5 space-y-4">
              <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
                <h2 className="text-sm font-semibold text-white">Application details</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5">
                    <p className={labelClass}>Selected job</p>
                    <p className="text-xs font-medium text-slate-200">{job.title}</p>
                    <Link href={`/hr/jobs/${job.id}`} className="mt-1.5 inline-flex items-center gap-1 text-[9px] text-mint hover:text-white">View job <ArrowRight size={9} /></Link>
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
                    <p className="mt-1 text-[10px] text-slate-500">Private candidate material remains demo-only.</p>
                  </div>
                  <Badge tone="amber">Demo storage</Badge>
                </div>
                <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-black/10 p-4 sm:flex-row sm:items-center">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-400"><FileText size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-200">{application.cv.fileName}</p>
                    <p className="mt-1 text-[9px] text-slate-500">{formatFileSize(application.cv.size)} · seeded metadata, no file stored</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setCvOpen(true)} className="rounded-lg border border-white/[0.09] px-2.5 py-1.5 text-[9px] font-medium text-slate-300 hover:text-white">Preview placeholder</button>
                  </div>
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
                <p className="mt-3 flex items-center gap-1.5 text-[9px] text-slate-600"><ShieldCheck size={10} /> External links open in a new tab. Never upload sensitive files in this demo.</p>
              </section>

              <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Private HR notes</h2>
                    <p className="mt-1 text-[10px] text-slate-500">Visible only in this demo recruiter workspace.</p>
                  </div>
                  <Badge tone="slate">{application.notes.length}</Badge>
                </div>
                <div className="mt-4 space-y-2.5">
                  {application.notes.map(item => (
                    <div key={item.id} className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5">
                      <div className="flex items-center justify-between gap-3 text-[9px] text-slate-600"><span>{item.author}</span><span>{formatDate(item.createdAt)}</span></div>
                      <p className="mt-2 text-[11px] leading-5 text-slate-400">{item.body}</p>
                    </div>
                  ))}
                  {!application.notes.length && <p className="py-3 text-[10px] text-slate-600">No private notes yet.</p>}
                </div>
                <div className="mt-4 border-t border-white/[0.06] pt-4">
                  <textarea value={note} onChange={event => setNote(event.target.value)} rows={3} className={`${inputClass} resize-y`} placeholder="Add a private note for the hiring team…" />
                  <div className="mt-2 flex justify-end">
                    <button onClick={saveNote} className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-[10px] font-medium text-slate-300 hover:bg-white/[0.1] hover:text-white"><Plus size={10} /> Save note</button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {tab === "assessment" && (
            <div className="mt-5 space-y-4">
              {assessment ? (
                <>
                  <DemoBanner>
                    Seeded demo assessment — not generated by a live AI system. In Phase 2, this panel will render the persisted assessment report linked to a completed interview.
                  </DemoBanner>
                  <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
                    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2"><Badge tone="violet">Demo report</Badge><Badge tone="mint">{assessment.recommendation}</Badge></div>
                        <h2 className="mt-4 text-lg font-semibold text-white">Panel evaluation summary</h2>
                        <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-400">{assessment.summary}</p>
                      </div>
                      <div className="shrink-0 text-left md:text-right">
                        <p className="text-4xl font-semibold tracking-[-0.04em] text-white">{assessment.overallScore.toFixed(1)}<span className="text-sm text-slate-600"> / 10</span></p>
                        <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-amber-200/60">Demo score</p>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3 border-t border-white/[0.06] pt-5 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-mint/80">Strengths</p>
                        <div className="mt-2.5 space-y-1.5">{assessment.strengths.map(item => <p key={item} className="flex gap-2 text-[11px] text-slate-400"><CheckCircle2 size={11} className="mt-0.5 shrink-0 text-mint/60" /> {item}</p>)}</div>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200/70">Risks & open questions</p>
                        <div className="mt-2.5 space-y-1.5">{[...assessment.risks, ...assessment.unresolvedConcerns].map(item => <p key={item} className="flex gap-2 text-[11px] text-slate-400"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-300/70" /> {item}</p>)}</div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-sm font-semibold text-white">Competency evidence</h2>
                      <span className="text-[9px] text-slate-600">Demo seed data</span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {(Object.keys(dimensionLabels) as Array<keyof typeof dimensionLabels>).map(key => {
                        const dimension = assessment.dimensions[key];
                        return (
                          <div key={key} className="rounded-xl border border-white/[0.06] bg-black/10 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[11px] font-medium text-slate-200">{dimensionLabels[key]}</p>
                              <p className="text-[11px] font-semibold text-white">{dimension.score.toFixed(1)}</p>
                            </div>
                            <div className="mt-2"><ProgressBar value={dimension.score * 10} tone={key === "product" ? "amber" : "mint"} /></div>
                            <div className="mt-3 space-y-1.5">
                              {dimension.evidence.map(evidence => <p key={evidence} className="text-[10px] leading-4 text-slate-500">“{evidence}”</p>)}
                            </div>
                            <p className="mt-2 text-[8px] uppercase tracking-[0.1em] text-slate-700">Demo turns: {dimension.sourceTurns.join(", ")} · confidence {(dimension.confidence * 100).toFixed(0)}%</p>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <div className="flex flex-wrap gap-2">
                    {interview && <Link href={`/hr/interviews/${interview.id}/report`} className={primaryButton}><FileText size={13} /> Open full demo report</Link>}
                    {interview && <Link href={`/hr/interviews/${interview.id}`} className={secondaryButton}><CalendarDays size={13} /> Interview details</Link>}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/70">
                  <EmptyState
                    title="No assessment yet"
                    description={interview ? "The demo report becomes available after an interview is completed." : "Schedule an interview to begin the assessment journey."}
                    icon={Sparkles}
                    action={interview ? <Link href={`/hr/interviews/${interview.id}`} className={secondaryButton}>View interview</Link> : <button onClick={() => setScheduleOpen(true)} className={primaryButton}><CalendarDays size={13} /> Schedule interview</button>}
                  />
                </div>
              )}
            </div>
          )}

          {tab === "activity" && (
            <div className="mt-5 space-y-4">
              <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Application timeline</h2>
                    <p className="mt-1 text-[10px] text-slate-500">Status changes, interviews, and demo email events.</p>
                  </div>
                  <Link href={emailHref} className="text-[10px] font-medium text-mint hover:text-white">Compose email</Link>
                </div>
                <div className="mt-5 space-y-0">
                  {activity.map((item, index) => (
                    <div key={item.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className={cn("mt-1 h-2 w-2 rounded-full", item.type === "email" ? "bg-violet" : item.type === "assessment" ? "bg-mint" : item.type === "interview" ? "bg-sky-400" : "bg-slate-500")} />
                        {index < activity.length - 1 && <span className="my-1 w-px flex-1 bg-white/[0.06]" />}
                      </div>
                      <div className="min-w-0 flex-1 pb-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] font-medium text-slate-200">{item.title}</p>
                          <span className="text-[9px] text-slate-600">{formatDate(item.at)}</span>
                        </div>
                        <p className="mt-1 text-[10px] leading-4 text-slate-500">{item.detail}</p>
                        <p className="mt-1 text-[8px] uppercase tracking-[0.08em] text-slate-700">{item.actor}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-white">Candidate communication</h2>
                  <Badge tone="amber">Simulated mail</Badge>
                </div>
                <div className="mt-4 divide-y divide-white/[0.055]">
                  {candidateEmails.map(email => (
                    <div key={email.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-medium text-slate-200">{email.subject}</p>
                        <Badge tone={email.status === "Sent" ? "mint" : email.status === "Failed" ? "rose" : email.status === "Pending" ? "amber" : "slate"}>{email.status} · demo</Badge>
                      </div>
                      <p className="mt-1 text-[9px] text-slate-600">{formatDate(email.createdAt)} · {email.recipientEmail} · {email.attachments.length} attachments</p>
                    </div>
                  ))}
                  {!candidateEmails.length && <p className="py-4 text-[10px] text-slate-600">No email activity for this candidate.</p>}
                </div>
              </section>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">Next step</p>
            <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/10 p-3.5">
              <div className="flex items-center gap-2 text-[10px] font-medium text-slate-300"><CalendarDays size={12} className="text-violet-200" /> {interview ? (interview.status === "Completed" ? "Interview completed" : interview.status === "Cancelled" ? "Interview cancelled" : "Interview scheduled") : "No interview scheduled"}</div>
              {interview ? (
                <>
                  <p className="mt-2 text-[10px] text-slate-500">{formatDate(interview.scheduledAt)} · {formatTime(interview.scheduledAt)}</p>
                  <p className="mt-0.5 text-[9px] text-slate-600">{interview.round} · {interview.timezone}</p>
                  <Link href={`/hr/interviews/${interview.id}`} className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.07] px-2.5 py-2 text-[9px] text-slate-400 transition hover:text-white">Open interview <ArrowRight size={10} /></Link>
                  {interview.status === "Scheduled" && (
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => setRescheduleOpen(true)} className="flex-1 rounded-lg border border-white/[0.07] px-2 py-1.5 text-[9px] text-slate-400 hover:text-white">Reschedule</button>
                      <button onClick={() => setCancelOpen(true)} className="flex-1 rounded-lg border border-rose-400/15 px-2 py-1.5 text-[9px] text-rose-200/70 hover:text-rose-200">Cancel</button>
                    </div>
                  )}
                </>
              ) : (
                <button onClick={() => setScheduleOpen(true)} className="mt-3 w-full rounded-lg bg-mint px-3 py-2 text-[9px] font-semibold text-ink">Schedule interview</button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link href={`/hr/applicants?job=${job.id}`} className="rounded-lg border border-white/[0.06] px-2.5 py-2 text-[9px] text-slate-500 transition hover:text-white">Same role</Link>
              <Link href={`/hr/jobs/${job.id}`} className="rounded-lg border border-white/[0.06] px-2.5 py-2 text-[9px] text-slate-500 transition hover:text-white">Job details</Link>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">Snapshot</p>
            <dl className="mt-3 space-y-2.5 text-[10px]">
              <div className="flex justify-between gap-3"><dt className="text-slate-600">Stage</dt><dd><StageBadge stage={application.stage} /></dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-600">Applied</dt><dd className="text-slate-400">{formatDate(application.appliedAt)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-600">Evaluation</dt><dd className="text-slate-400">{assessment ? `${assessment.overallScore.toFixed(1)} / 10` : "Pending"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-600">Emails</dt><dd className="text-slate-400">{candidateEmails.length} demo records</dd></div>
            </dl>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-4">
            <div className="flex items-center gap-2 text-[10px] font-medium text-slate-300"><Mic size={12} className="text-violet-200" /> Interview room</div>
            <p className="mt-2 text-[9px] leading-4 text-slate-600">The production room link will be tied to this interview. The existing voice room remains available at /live.</p>
            <Link href="/setup" className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.07] px-2.5 py-2 text-[9px] text-slate-400 transition hover:text-white">Open live setup <ArrowRight size={10} /></Link>
          </section>

          <Link href={emailHref} className="flex items-center justify-between rounded-2xl border border-violet/15 bg-violet/[0.05] p-4 text-[10px] font-medium text-violet-200 transition hover:border-violet/30">
            <span className="inline-flex items-center gap-2"><Mail size={12} /> Send a status update</span>
            <ArrowRight size={11} />
          </Link>
        </aside>
      </div>

      <ScheduleInterviewDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} defaultApplicationId={application.id} />
      <RescheduleInterviewDialog interview={interview ?? null} open={rescheduleOpen} onClose={() => setRescheduleOpen(false)} />
      <CancelInterviewDialog interview={interview ?? null} open={cancelOpen} onClose={() => setCancelOpen(false)} />

      <Modal
        open={cvOpen}
        onClose={() => setCvOpen(false)}
        title="CV preview unavailable"
        description="Seeded demo metadata · no document is stored"
        size="md"
        footer={<button onClick={() => setCvOpen(false)} className={secondaryButton}>Close</button>}
      >
        <div className="rounded-2xl border border-dashed border-white/[0.12] bg-black/10 px-6 py-12 text-center">
          <FileText size={28} className="mx-auto text-slate-600" />
          <p className="mt-4 text-sm font-semibold text-slate-200">{application.cv.fileName}</p>
          <p className="mt-1 text-[10px] text-slate-500">{formatFileSize(application.cv.size)} · {application.cv.storageStatus}</p>
          <p className="mx-auto mt-4 max-w-sm text-[10px] leading-5 text-slate-600">CV binaries are intentionally not embedded in this frontend demo. Phase 2 will fetch a short-lived, authorized preview URL from private object storage.</p>
          <button disabled className={`${secondaryButton} mt-5 opacity-40`}><Download size={12} /> Download unavailable in demo</button>
        </div>
      </Modal>
    </div>
  );
}
