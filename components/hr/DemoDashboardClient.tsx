"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileSearch,
  Mail,
  Mic,
  Plus,
  Sparkles,
  UserCheck,
  Users
} from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { Avatar, Badge, DemoBanner, PageHeader, SectionHeading, StatCard, StageBadge } from "@/components/ui";
import { buildApplicationRecords, countByStage, emailStats, jobApplicantCount, upcomingInterviews } from "@/lib/demo-service";
import { formatDate, formatTime } from "@/lib/format";

export default function HrDashboardPage() {
  const store = useDemoData();
  const records = buildApplicationRecords(store);
  const counts = countByStage(records);
  const upcoming = upcomingInterviews(store);
  const selected = counts.Selected;
  const activeJobs = store.jobs.filter(job => job.status === "Published").length;
  const newApplications = counts.New;
  const mails = emailStats(store.emails);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sunday, 25 October 2026 · Demo workspace"
        title="Good morning, Maya."
        description="A connected view of the Nexora Labs hiring pipeline, interviews, openings, and candidate communications."
        actions={
          <>
            <Link href="/hr/schedule" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.035] px-3.5 py-2.5 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:text-white">
              <CalendarDays size={13} /> Schedule
            </Link>
            <Link href="/hr/jobs/new" className="inline-flex items-center gap-2 rounded-xl bg-mint px-3.5 py-2.5 text-xs font-semibold text-ink transition hover:bg-mint-hover">
              <Plus size={13} /> New role
            </Link>
          </>
        }
      />

      <DemoBanner compact>
        Demo workspace: metrics are calculated from seeded frontend records. Interview scheduling and email activity are simulated and are not delivered to external systems.
      </DemoBanner>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        <StatCard label="Total applicants" value={records.length} detail="Across all roles" icon={Users} tone="slate" href="/hr/applicants" />
        <StatCard label="New applications" value={newApplications} detail="Awaiting first review" icon={Sparkles} tone="amber" href="/hr/applicants?stage=New" />
        <StatCard label="In review" value={counts["In Review"]} detail="Active screening" icon={FileSearch} tone="sky" href="/hr/applicants?stage=In+Review" />
        <StatCard label="Shortlisted" value={counts.Shortlisted} detail="Ready for interview" icon={UserCheck} tone="violet" href="/hr/applicants?stage=Shortlisted" />
        <StatCard label="Upcoming" value={upcoming.length} detail="Scheduled interviews" icon={Mic} tone="purple" href="/hr/schedule" />
        <StatCard label="Selected" value={selected} detail="Offer-stage candidates" icon={CheckCircle2} tone="mint" href="/hr/applicants?stage=Selected" />
        <StatCard label="Active openings" value={activeJobs} detail={`${store.jobs.filter(job => job.status === "Draft").length} drafts`} icon={BriefcaseBusiness} tone="slate" href="/hr/jobs" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-card/80">
          <SectionHeading
            title="Upcoming interviews"
            description="Scheduled demo sessions across the hiring pipeline."
            action={<Link href="/hr/schedule" className="inline-flex items-center gap-1 text-[10px] font-medium text-mint hover:text-white">Calendar</Link>}
          />
          <div className="divide-y divide-white/[0.055]">
            {upcoming.slice(0, 4).map(interview => {
              const candidate = store.candidates.find(item => item.id === interview.candidateId);
              const job = store.jobs.find(item => item.id === interview.jobId);
              return (
                <div key={interview.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={candidate?.name ?? "Candidate"} tone="violet" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white">{candidate?.name}</p>
                      <p className="mt-0.5 truncate text-[10px] text-slate-500">{job?.title} · {interview.round}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 pl-[52px] sm:pl-0">
                    <div className="text-left sm:text-right">
                      <p className="text-[11px] font-medium text-violet-200">{formatDate(interview.scheduledAt)} · {formatTime(interview.scheduledAt)}</p>
                      <p className="mt-0.5 text-[9px] text-slate-600">{interview.durationMinutes} min · {interview.timezone}</p>
                    </div>
                    <Link href={`/hr/interviews/${interview.id}`} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-medium text-slate-400 transition hover:text-white">Open</Link>
                  </div>
                </div>
              );
            })}
            {upcoming.length === 0 && <p className="px-5 py-10 text-center text-xs text-slate-500">No interviews are scheduled.</p>}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-card/80">
          <SectionHeading
            title="Active job postings"
            description="Public roles currently accepting applications."
            action={<Link href="/hr/jobs" className="inline-flex items-center gap-1 text-[10px] font-medium text-mint hover:text-white">All jobs</Link>}
          />
          <div className="divide-y divide-white/[0.055]">
            {store.jobs.filter(job => job.status === "Published").slice(0, 5).map(job => (
              <Link key={job.id} href={`/hr/jobs/${job.id}`} className="group flex items-center gap-3 px-5 py-3.5 transition hover:bg-white/[0.018]">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-slate-200 group-hover:text-white">{job.title}</p>
                  <p className="mt-1 text-[9px] text-slate-500">{job.department} · {job.location} · {jobApplicantCount(store, job.id)} applicants</p>
                </div>
                <ArrowUpRight size={12} className="text-slate-600 transition group-hover:text-mint" />
              </Link>
            ))}
          </div>
          <div className="border-t border-white/[0.055] p-3">
            <Link href="/hr/jobs/new" className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.1] px-3 py-2.5 text-[10px] font-medium text-slate-500 transition hover:border-mint/25 hover:text-mint">
              <Plus size={11} /> Create a job posting
            </Link>
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-card/80">
          <SectionHeading
            title="Recent applications"
            description="Newest applications across every open role."
            action={<Link href="/hr/applicants" className="inline-flex items-center gap-1 text-[10px] font-medium text-mint hover:text-white">Pipeline</Link>}
          />
          <div className="overflow-x-auto">
            <table className="hr-table w-full min-w-[600px]">
              <thead className="border-b border-white/[0.055] text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                <tr>
                  <th className="px-5 py-2.5">Candidate</th>
                  <th className="px-3 py-2.5">Role</th>
                  <th className="px-3 py-2.5">Applied</th>
                  <th className="px-3 py-2.5">Stage</th>
                  <th className="px-5 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.045]">
                {records.slice(0, 6).map(record => (
                  <tr key={record.application.id}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={record.candidate.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-medium text-slate-200">{record.candidate.name}</p>
                          <p className="truncate text-[9px] text-slate-600">{record.candidate.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[190px] truncate px-3 py-3 text-[10px] text-slate-400">{record.job.title}</td>
                    <td className="px-3 py-3 text-[10px] text-slate-500">{formatDate(record.application.appliedAt)}</td>
                    <td className="px-3 py-3"><StageBadge stage={record.application.stage} /></td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/hr/applicants/${record.application.id}`} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.05] hover:text-white" aria-label={`Review ${record.candidate.name}`}>
                        <ArrowRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Pipeline health</p>
                <p className="mt-1 text-[10px] text-slate-500">Stage distribution · demo records</p>
              </div>
              <Badge tone="violet">6 stages</Badge>
            </div>
            <div className="mt-5 space-y-3">
              {[
                ["New", counts.New, "bg-amber-300"],
                ["In review", counts["In Review"], "bg-sky-400"],
                ["Shortlisted", counts.Shortlisted, "bg-violet"],
                ["Interview", counts.Interview, "bg-purple-400"],
                ["Selected", counts.Selected, "bg-mint"]
              ].map(([label, value, color]) => {
                const numeric = Number(value);
                const width = records.length ? Math.max(6, Math.round((numeric / records.length) * 100)) : 0;
                return (
                  <div key={String(label)}>
                    <div className="mb-1.5 flex items-center justify-between text-[10px]">
                      <span className="text-slate-500">{label}</span>
                      <span className="font-medium text-slate-300">{numeric}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <Link href="/hr/applicants" className="mt-5 flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-2.5 text-[10px] font-medium text-slate-400 transition hover:text-white">
              Review applicant pipeline
            </Link>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Email activity</p>
                <p className="mt-1 text-[10px] text-slate-500">Simulated mail centre</p>
              </div>
              <Badge tone="amber">Demo</Badge>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-white/[0.06] bg-black/10 p-2.5"><p className="text-lg font-semibold text-white">{mails.sent}</p><p className="text-[9px] text-slate-500">Sent</p></div>
              <div className="rounded-xl border border-white/[0.06] bg-black/10 p-2.5"><p className="text-lg font-semibold text-white">{mails.pending}</p><p className="text-[9px] text-slate-500">Pending</p></div>
              <div className="rounded-xl border border-white/[0.06] bg-black/10 p-2.5"><p className="text-lg font-semibold text-white">{mails.drafts}</p><p className="text-[9px] text-slate-500">Drafts</p></div>
            </div>
            <div className="mt-3 flex gap-2">
              <Link href="/hr/email" className="flex-1 rounded-xl border border-white/[0.07] px-3 py-2 text-center text-[10px] font-medium text-slate-400 transition hover:text-white">Centre</Link>
              <Link href="/hr/email/compose" className="flex-1 rounded-xl bg-white/[0.06] px-3 py-2 text-center text-[10px] font-medium text-slate-300 transition hover:bg-white/[0.09] hover:text-white">Compose</Link>
            </div>
          </section>
        </div>
      </div>

      <section className="rounded-2xl border border-white/[0.07] bg-card/60 px-5 py-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <Clock3 size={14} className="text-slate-500" />
            <p className="text-[11px] text-slate-500">Quick actions remain in sync with the demo workspace.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/hr/email/compose" className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] px-3 py-1.5 text-[10px] text-slate-400 transition hover:text-white"><Mail size={11} /> Compose email</Link>
            <Link href="/hr/email/templates" className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] px-3 py-1.5 text-[10px] text-slate-400 transition hover:text-white"><FileSearch size={11} /> Templates</Link>
            <Link href="/hr/applicants?stage=New" className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] px-3 py-1.5 text-[10px] text-slate-400 transition hover:text-white"><Users size={11} /> Review new applicants</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
