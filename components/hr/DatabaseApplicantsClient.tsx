"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  Users,
  X
} from "lucide-react";
import { Avatar, Badge, EmptyState, PageHeader, StageBadge } from "@/components/ui";
import { APPLICATION_STAGES, type Application, type ApplicationStage, type Candidate, type Job } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { inputClass, selectClass } from "@/lib/ui";

const PAGE_SIZE = 8;

interface ApplicantsResponse {
  applications: Application[];
  candidates: Candidate[];
  jobs: Job[];
  total: number;
  page: number;
  pageCount: number;
  stageCounts: Record<string, number>;
  jobOptions: Array<{ id: string; title: string; status: string }>;
}

interface Row {
  application: Application;
  candidate: Candidate;
  job: Job;
}

export function DatabaseApplicantsClient() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [stage, setStage] = useState(params.get("stage") ?? "All");
  const [jobId, setJobId] = useState(params.get("jobId") ?? "");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApplicantsResponse | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (q.trim()) query.set("q", q.trim());
      if (stage !== "All") query.set("stage", stage);
      if (jobId) query.set("jobId", jobId);
      try {
        const response = await fetch(`/api/hr/applications?${query.toString()}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json() as ApplicantsResponse & { error?: string };
        if (!response.ok) throw new Error(body.error || "Applicants could not be loaded.");
        setData(body);
        const byId = new Map(body.candidates.map(candidate => [candidate.id, candidate]));
        const jobsById = new Map(body.jobs.map(job => [job.id, job]));
        setRows(body.applications.flatMap(application => {
          const candidate = byId.get(application.candidateId);
          const job = jobsById.get(application.jobId);
          return candidate && job ? [{ application, candidate, job }] : [];
        }));
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Applicants could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q, stage, jobId, page, refresh]);

  const resetFilters = () => {
    setQ("");
    setStage("All");
    setJobId("");
    setPage(1);
  };

  const totalPages = data?.pageCount ?? 1;
  const hasFilters = Boolean(q.trim()) || stage !== "All" || Boolean(jobId);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Talent pipeline"
        title="Applicants"
        description="Applicants stored for your organization. Stage changes and notes are written to the recruitment database."
        actions={
          <button onClick={() => setRefresh(value => value + 1)} className="inline-flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.03] px-3.5 py-2.5 text-xs font-medium text-slate-300 transition hover:text-white">
            Refresh
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {APPLICATION_STAGES.map(item => {
          const active = stage === item;
          return (
            <button
              key={item}
              onClick={() => { setStage(active ? "All" : item); setPage(1); }}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                active ? "border-mint/25 bg-mint/[0.06] shadow-[0_0_30px_rgba(124,245,197,.04)]" : "border-white/[0.07] bg-card/70 hover:border-white/[0.14]"
              }`}
            >
              <p className={`text-[9px] font-semibold uppercase tracking-[0.1em] ${active ? "text-mint" : "text-slate-500"}`}>{item}</p>
              <p className="mt-1.5 text-xl font-semibold text-white">{data?.stageCounts[item] ?? 0}</p>
            </button>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-card/80">
        <div className="border-b border-white/[0.06] p-4">
          <div className="grid gap-2.5 lg:grid-cols-[1.5fr_1fr_1fr]">
            <label className="relative block">
              <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
              <input value={q} onChange={event => { setQ(event.target.value); setPage(1); }} className={`${inputClass} h-10 py-0 pl-9`} placeholder="Search name, email, or role…" aria-label="Search applicants" />
            </label>
            <select value={jobId} onChange={event => { setJobId(event.target.value); setPage(1); }} className={`${selectClass} h-10 py-0`} aria-label="Filter by job">
              <option value="">All jobs</option>
              {data?.jobOptions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <Filter size={11} />
              <span>{data?.total ?? 0} applicant{data?.total === 1 ? "" : "s"}</span>
              {stage !== "All" && <Badge tone="sky">{stage}</Badge>}
              {hasFilters && <button onClick={resetFilters} className="ml-auto inline-flex items-center gap-1 text-slate-500 transition hover:text-white"><X size={10} /> Clear</button>}
            </div>
          </div>
        </div>

        {error && <div className="border-b border-rose-400/15 bg-rose-400/[0.04] px-4 py-3 text-[11px] text-rose-200" role="alert">{error}</div>}

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-white/[0.025]" />)}
          </div>
        ) : error ? null : rows.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="hr-table w-full min-w-[760px]">
                <thead className="border-b border-white/[0.06] bg-white/[0.015] text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Candidate</th>
                    <th className="px-3 py-3">Role</th>
                    <th className="px-3 py-3">Applied</th>
                    <th className="px-3 py-3">Stage</th>
                    <th className="px-3 py-3">CV</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.045]">
                  {rows.map(({ application, candidate, job }) => (
                    <tr key={application.id}>
                      <td className="px-4 py-3.5">
                        <Link href={`/hr/applicants/${application.id}`} className="group flex items-center gap-2.5">
                          <Avatar name={candidate.name} size="sm" tone={application.stage === "Selected" ? "mint" : "violet"} />
                          <div>
                            <p className="text-[11px] font-medium text-slate-200 group-hover:text-white">{candidate.name}</p>
                            <p className="mt-0.5 text-[9px] text-slate-600">{candidate.email}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="max-w-[220px] px-3 py-3.5">
                        <p className="truncate text-[10px] text-slate-300">{job.title}</p>
                        <p className="mt-0.5 text-[9px] text-slate-600">{job.department} · {job.location}</p>
                      </td>
                      <td className="px-3 py-3.5 text-[10px] text-slate-500">{formatDate(application.appliedAt)}</td>
                      <td className="px-3 py-3.5"><StageBadge stage={application.stage} /></td>
                      <td className="px-3 py-3.5 text-[9px] text-slate-500">{application.cv.downloadable ? "Available" : application.cv.scanStatus ?? "Pending"}</td>
                      <td className="px-4 py-3.5 text-right">
                        <Link href={`/hr/applicants/${application.id}`} className="inline-flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-[9px] font-medium text-slate-400 transition hover:text-white">Review <ChevronRight size={10} /></Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col justify-between gap-3 border-t border-white/[0.055] px-4 py-3 sm:flex-row sm:items-center">
              <p className="text-[10px] text-slate-500">Showing {(data?.page ?? 1) === 1 ? 1 : ((data?.page ?? 1) - 1) * PAGE_SIZE + 1}–{Math.min((data?.page ?? 1) * PAGE_SIZE, data?.total ?? 0)} of {data?.total ?? 0}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(value => Math.max(1, value - 1))} disabled={(data?.page ?? 1) <= 1} className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.08] text-slate-400 transition hover:bg-white/[0.05] disabled:opacity-30" aria-label="Previous page"><ChevronLeft size={12} /></button>
                <span className="text-[10px] text-slate-500">Page {data?.page ?? 1} of {totalPages}</span>
                <button onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={(data?.page ?? 1) >= totalPages} className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.08] text-slate-400 transition hover:bg-white/[0.05] disabled:opacity-30" aria-label="Next page"><ChevronRight size={12} /></button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            title="No applicants match those filters"
            description="Applications submitted through the public careers site will appear here."
            icon={Users}
            action={<button onClick={resetFilters} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-[10px] text-slate-300 hover:text-white"><ArrowLeft size={11} /> Reset filters</button>}
          />
        )}
      </section>

      <p className="flex items-center gap-1.5 text-[9px] text-slate-600"><CalendarDays size={10} /> Applicant records are persisted in the recruitment database and scoped to your organization.</p>
    </div>
  );
}
