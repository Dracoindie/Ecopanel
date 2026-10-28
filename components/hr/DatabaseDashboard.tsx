import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  FileSearch,
  Users
} from "lucide-react";
import type { ApplicationStage } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import type { listHrApplications } from "@/lib/server/recruitment/hr";

type RecentData = Awaited<ReturnType<typeof listHrApplications>>;

const stageTone: Record<ApplicationStage, string> = {
  New: "border-amber-300/20 bg-amber-300/[0.06] text-amber-200",
  "In Review": "border-sky-400/20 bg-sky-400/[0.06] text-sky-200",
  Shortlisted: "border-violet/20 bg-violet/[0.06] text-violet-200",
  Interview: "border-purple-400/20 bg-purple-400/[0.06] text-purple-200",
  Selected: "border-mint/20 bg-mint/[0.06] text-mint",
  Rejected: "border-rose-400/20 bg-rose-400/[0.06] text-rose-200"
};

function Stat({ label, value, detail, href }: { label: string; value: number; detail: string; href: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-4 transition hover:border-white/[0.14]">
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-[9px] text-slate-600">{detail}</p>
    </Link>
  );
}

export function DatabaseDashboard({
  organizationName,
  userName,
  counts,
  recent
}: {
  organizationName: string;
  userName: string;
  counts: { applications: number; jobs: number; interviews: number };
  recent: RecentData;
}) {
  const candidates = new Map(recent.candidates.map(candidate => [candidate.id, candidate]));
  const jobs = new Map(recent.jobs.map(job => [job.id, job]));
  const stageCounts = recent.stageCounts;
  const firstName = userName.split(/\s+/)[0] || userName;
  const maxStage = Math.max(1, ...Object.values(stageCounts));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-mint/70">Recruitment database · {organizationName}</p>
          <h1 className="font-display mt-2 text-3xl tracking-[-0.035em] text-white">Good morning, {firstName}.</h1>
          <p className="mt-2 text-xs text-slate-500">Applications, stage changes, notes, and private CV references are stored for this organization.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/careers" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.03] px-3.5 py-2.5 text-xs font-medium text-slate-300 transition hover:text-white">
            Public careers
          </Link>
          <Link href="/hr/applicants" className="inline-flex items-center gap-2 rounded-xl bg-mint px-3.5 py-2.5 text-xs font-semibold text-ink transition hover:bg-[#9bf8d5]">
            Review applicants <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.035] px-4 py-3 text-[10px] leading-5 text-amber-200/75">
        Phase 2B persists job management, interview scheduling and status, linked assessments, and email drafts and queues. No email provider or calendar is connected, so nothing is delivered or invited automatically.
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="Total applicants" value={counts.applications} detail="Stored applications" href="/hr/applicants" />
        <Stat label="New" value={stageCounts.New ?? 0} detail="Awaiting first review" href="/hr/applicants?stage=New" />
        <Stat label="In review" value={stageCounts["In Review"] ?? 0} detail="Active screening" href="/hr/applicants?stage=In+Review" />
        <Stat label="Shortlisted" value={stageCounts.Shortlisted ?? 0} detail="Ready for interview" href="/hr/applicants?stage=Shortlisted" />
        <Stat label="Selected" value={stageCounts.Selected ?? 0} detail="Offer-stage candidates" href="/hr/applicants?stage=Selected" />
        <Stat label="Open roles" value={counts.jobs} detail="Published openings" href="/hr/applicants" />
        <Stat label="Upcoming" value={counts.interviews} detail="Scheduled interviews" href="/hr/applicants" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a111e]/80">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Recent applications</h2>
              <p className="mt-1 text-[10px] text-slate-500">Newest applications stored for {organizationName}.</p>
            </div>
            <Link href="/hr/applicants" className="inline-flex items-center gap-1 text-[10px] font-medium text-mint hover:text-white">Pipeline <ArrowRight size={11} /></Link>
          </div>
          <div className="overflow-x-auto">
            <table className="hr-table w-full min-w-[600px]">
              <thead className="border-b border-white/[0.055] text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                <tr><th className="px-5 py-2.5">Candidate</th><th className="px-3 py-2.5">Role</th><th className="px-3 py-2.5">Applied</th><th className="px-3 py-2.5">Stage</th><th className="px-5 py-2.5 text-right">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-white/[0.045]">
                {recent.applications.map(application => {
                  const candidate = candidates.get(application.candidateId);
                  const job = jobs.get(application.jobId);
                  return (
                    <tr key={application.id}>
                      <td className="px-5 py-3">
                        <p className="text-[11px] font-medium text-slate-200">{candidate?.name ?? "Candidate"}</p>
                        <p className="mt-0.5 text-[9px] text-slate-600">{candidate?.email}</p>
                      </td>
                      <td className="max-w-[190px] truncate px-3 py-3 text-[10px] text-slate-400">{job?.title}</td>
                      <td className="px-3 py-3 text-[10px] text-slate-500">{formatDate(application.appliedAt)}</td>
                      <td className="px-3 py-3"><span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${stageTone[application.stage]}`}>{application.stage}</span></td>
                      <td className="px-5 py-3 text-right"><Link href={`/hr/applicants/${application.id}`} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.05] hover:text-white" aria-label={`Review ${candidate?.name ?? "candidate"}`}><ArrowRight size={13} /></Link></td>
                    </tr>
                  );
                })}
                {!recent.applications.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-[11px] text-slate-500">No applications yet. Submit one through the public careers site.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-sm font-semibold text-white">Pipeline health</h2><p className="mt-1 text-[10px] text-slate-500">Persisted stage distribution</p></div>
            <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[9px] text-slate-500">6 stages</span>
          </div>
          <div className="mt-5 space-y-3">
            {(["New", "In Review", "Shortlisted", "Interview", "Selected", "Rejected"] as ApplicationStage[]).map(stage => {
              const value = stageCounts[stage] ?? 0;
              return (
                <div key={stage}>
                  <div className="mb-1.5 flex items-center justify-between text-[10px]"><span className="text-slate-500">{stage}</span><span className="font-medium text-slate-300">{value}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-mint/70" style={{ width: `${Math.round((value / maxStage) * 100)}%` }} /></div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Users, label: "Applicant pipeline", text: "Review and progress persisted applications." },
          { icon: FileSearch, label: "Private CV access", text: "Downloads are authorized by session and organization." },
          { icon: CalendarDays, label: "Persisted scheduling", text: "Interviews are stored. No calendar invitation is sent." }
        ].map(item => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <Icon size={14} className="text-violet-200/80" />
              <p className="mt-2.5 text-[11px] font-semibold text-slate-200">{item.label}</p>
              <p className="mt-1 text-[9px] leading-4 text-slate-500">{item.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
