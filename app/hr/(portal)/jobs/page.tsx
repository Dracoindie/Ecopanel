"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  EyeOff,
  Pencil,
  Plus,
  Search,
  Users,
  X
} from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { useIsDatabaseMode } from "@/components/AppModeProvider";
import { DatabaseJobsClient } from "@/components/hr/DatabaseJobsClient";
import { Badge, EmptyState, JobStatusBadge, PageHeader } from "@/components/ui";
import { jobApplicantCount } from "@/lib/demo-service";
import { formatDate } from "@/lib/format";
import { inputClass, selectClass } from "@/lib/ui";

export default function HrJobsPage() {
  return useIsDatabaseMode() ? <DatabaseJobsClient /> : <DemoJobsPage />;
}

function DemoJobsPage() {
  const store = useDemoData();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [department, setDepartment] = useState("All");

  const departments = useMemo(() => Array.from(new Set(store.jobs.map(job => job.department))).sort(), [store.jobs]);
  const filtered = store.jobs
    .filter(job => {
      const text = `${job.title} ${job.department} ${job.location} ${job.employmentType}`.toLowerCase();
      if (q.trim() && !text.includes(q.trim().toLowerCase())) return false;
      if (status !== "All" && job.status !== status) return false;
      if (department !== "All" && job.department !== department) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const published = store.jobs.filter(job => job.status === "Published").length;
  const drafts = store.jobs.filter(job => job.status === "Draft").length;
  const closed = store.jobs.filter(job => job.status === "Closed").length;
  const hasFilters = q || status !== "All" || department !== "All";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Hiring operations"
        title="Job postings"
        description="Manage role content, publication state, and public visibility. Every job feeds the careers site and applicant pipeline."
        actions={<Link href="/hr/jobs/new" className="inline-flex items-center gap-2 rounded-xl bg-mint px-3.5 py-2.5 text-xs font-semibold text-ink transition hover:bg-[#9bf8d5]"><Plus size={13} /> Create job</Link>}
      />

      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-xl border border-white/[0.07] bg-[#0a111e]/70 px-4 py-3"><p className="text-[9px] uppercase tracking-[0.1em] text-slate-600">Published</p><p className="mt-1 text-xl font-semibold text-mint">{published}</p></div>
        <div className="rounded-xl border border-white/[0.07] bg-[#0a111e]/70 px-4 py-3"><p className="text-[9px] uppercase tracking-[0.1em] text-slate-600">Drafts</p><p className="mt-1 text-xl font-semibold text-amber-200">{drafts}</p></div>
        <div className="rounded-xl border border-white/[0.07] bg-[#0a111e]/70 px-4 py-3"><p className="text-[9px] uppercase tracking-[0.1em] text-slate-600">Closed</p><p className="mt-1 text-xl font-semibold text-slate-300">{closed}</p></div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a111e]/80">
        <div className="grid gap-2.5 border-b border-white/[0.06] p-4 lg:grid-cols-[1.5fr_1fr_1fr]">
          <label className="relative block">
            <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
            <input value={q} onChange={event => setQ(event.target.value)} className={`${inputClass} h-10 py-0 pl-9`} placeholder="Search role, team, or locationâ€¦" aria-label="Search jobs" />
          </label>
          <select value={status} onChange={event => setStatus(event.target.value)} className={`${selectClass} h-10 py-0`} aria-label="Filter jobs by status">
            <option value="All">All statuses</option>
            <option value="Published">Published</option>
            <option value="Draft">Draft</option>
            <option value="Closed">Closed</option>
          </select>
          <select value={department} onChange={event => setDepartment(event.target.value)} className={`${selectClass} h-10 py-0`} aria-label="Filter jobs by department">
            <option value="All">All departments</option>
            {departments.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 px-4 py-2.5 text-[10px] text-slate-500">
          <BriefcaseBusiness size={11} /> {filtered.length} role{filtered.length === 1 ? "" : "s"}
          {hasFilters && <button onClick={() => { setQ(""); setStatus("All"); setDepartment("All"); }} className="ml-auto inline-flex items-center gap-1 text-slate-500 hover:text-white"><X size={10} /> Clear</button>}
        </div>

        {filtered.length ? (
          <div className="overflow-x-auto">
            <table className="hr-table w-full min-w-[880px]">
              <thead className="border-y border-white/[0.06] bg-white/[0.015] text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                <tr>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-3 py-3">Department</th>
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3">Applicants</th>
                  <th className="px-3 py-3">Visibility</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.045]">
                {filtered.map(job => {
                  const applicants = jobApplicantCount(store, job.id);
                  return (
                    <tr key={job.id}>
                      <td className="max-w-[280px] px-4 py-3.5">
                        <Link href={`/hr/jobs/${job.id}`} className="group block">
                          <p className="truncate text-[11px] font-semibold text-slate-200 group-hover:text-white">{job.title}</p>
                          <p className="mt-0.5 text-[9px] text-slate-600">{job.employmentType} Â· {formatDate(job.createdAt)}</p>
                        </Link>
                      </td>
                      <td className="px-3 py-3.5 text-[10px] text-slate-400">{job.department}</td>
                      <td className="px-3 py-3.5"><p className="text-[10px] text-slate-400">{job.location}</p><p className="mt-0.5 text-[9px] text-slate-600">{job.workplace}</p></td>
                      <td className="px-3 py-3.5"><span className="inline-flex items-center gap-1.5 text-[10px] text-slate-400"><Users size={10} /> {applicants}</span></td>
                      <td className="px-3 py-3.5">{job.publicVisible && job.status === "Published" ? <Badge tone="mint" dot>Public</Badge> : <span className="inline-flex items-center gap-1.5 text-[9px] text-slate-600"><EyeOff size={10} /> Private</span>}</td>
                      <td className="px-3 py-3.5"><JobStatusBadge status={job.status} /></td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {job.status === "Published" && job.publicVisible && <Link href={`/careers/jobs/${job.id}`} target="_blank" className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.05] hover:text-white" aria-label="View public job"><ArrowUpRight size={12} /></Link>}
                          <Link href={`/hr/jobs/${job.id}/edit`} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.05] hover:text-white" aria-label="Edit job"><Pencil size={12} /></Link>
                          <Link href={`/hr/jobs/${job.id}`} className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-[9px] text-slate-400 hover:text-white">Open</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No jobs match those filters" description="Clear the search or create a new role." icon={BriefcaseBusiness} action={<Link href="/hr/jobs/new" className="inline-flex items-center gap-1.5 rounded-lg bg-mint px-3 py-2 text-[10px] font-semibold text-ink"><Plus size={11} /> Create job</Link>} />
        )}
      </section>
    </div>
  );
}

