"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  Mail,
  Search,
  Users,
  X
} from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { useToast } from "@/components/ToastProvider";
import { Avatar, Badge, EmptyState, PageHeader, StageBadge } from "@/components/ui";
import { APPLICATION_STAGES, type ApplicationStage } from "@/lib/domain";
import {
  buildApplicationRecords,
  countByStage,
  filterApplicationRecords
} from "@/lib/demo-service";
import { formatDate } from "@/lib/format";
import { inputClass, selectClass } from "@/lib/ui";

const PAGE_SIZE = 8;

export function ApplicantsClient() {
  const store = useDemoData();
  const { toast } = useToast();
  const params = useSearchParams();
  const initialStage = params.get("stage");
  const initialQuery = params.get("q") ?? "";

  const records = useMemo(() => buildApplicationRecords(store), [store]);
  const counts = countByStage(records);
  const [q, setQ] = useState(initialQuery);
  const [stage, setStage] = useState(initialStage && initialStage !== "All" ? initialStage : "All");
  const [job, setJob] = useState("All");
  const [department, setDepartment] = useState("All");
  const [date, setDate] = useState("All");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStage, setBulkStage] = useState<ApplicationStage>("In Review");

  const departments = useMemo(() => Array.from(new Set(store.jobs.map(item => item.department))).sort(), [store.jobs]);

  const filtered = useMemo(
    () => filterApplicationRecords(records, { q, stage, job, department, date }),
    [records, q, stage, job, department, date]
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRecords = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const allPageSelected = pageRecords.length > 0 && pageRecords.every(record => selected.includes(record.application.id));
  const selectedRecords = records.filter(record => selected.includes(record.application.id));
  const hasFilters = q || stage !== "All" || job !== "All" || department !== "All" || date !== "All";

  const updateFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  const toggleAll = () => {
    const ids = pageRecords.map(record => record.application.id);
    setSelected(current => (allPageSelected ? current.filter(id => !ids.includes(id)) : Array.from(new Set([...current, ...ids]))));
  };

  const toggleOne = (id: string) => {
    setSelected(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]));
  };

  const applyBulkStage = () => {
    if (!selected.length) return;
    store.bulkUpdateApplicationStage(selected, bulkStage);
    toast(`${selected.length} demo application${selected.length === 1 ? "" : "s"} moved to ${bulkStage}.`);
    setSelected([]);
  };

  const resetFilters = () => {
    setQ("");
    setStage("All");
    setJob("All");
    setDepartment("All");
    setDate("All");
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Talent pipeline"
        title="Applicants"
        description="Search, filter, and progress candidates through the demo hiring pipeline. Status changes update every connected view."
        actions={
          <Link href="/hr/email/compose" className="inline-flex items-center gap-2 rounded-xl bg-mint px-3.5 py-2.5 text-xs font-semibold text-ink transition hover:bg-[#9bf8d5]">
            <Mail size={13} /> Compose email
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {APPLICATION_STAGES.map(item => {
          const active = stage === item;
          return (
            <button
              key={item}
              onClick={() => updateFilter(setStage, active ? "All" : item)}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                active
                  ? "border-mint/25 bg-mint/[0.06] shadow-[0_0_30px_rgba(124,245,197,.04)]"
                  : "border-white/[0.07] bg-[#0a111e]/70 hover:border-white/[0.14]"
              }`}
            >
              <p className={`text-[9px] font-semibold uppercase tracking-[0.1em] ${active ? "text-mint" : "text-slate-500"}`}>{item}</p>
              <p className="mt-1.5 text-xl font-semibold text-white">{counts[item]}</p>
            </button>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a111e]/80">
        <div className="border-b border-white/[0.06] p-4">
          <div className="grid gap-2.5 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <label className="relative block">
              <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                value={q}
                onChange={event => updateFilter(setQ, event.target.value)}
                className={`${inputClass} h-10 py-0 pl-9`}
                placeholder="Search name, email, role, source…"
                aria-label="Search applicants"
              />
            </label>
            <select value={job} onChange={event => updateFilter(setJob, event.target.value)} className={`${selectClass} h-10 py-0`} aria-label="Filter by job">
              <option value="All">All jobs</option>
              {store.jobs.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            <select value={department} onChange={event => updateFilter(setDepartment, event.target.value)} className={`${selectClass} h-10 py-0`} aria-label="Filter by department">
              <option value="All">All departments</option>
              {departments.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={date} onChange={event => updateFilter(setDate, event.target.value)} className={`${selectClass} h-10 py-0`} aria-label="Filter by application date">
              <option value="All">Any date</option>
              <option value="7 days">Last 7 days</option>
              <option value="30 days">Last 30 days</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
            <Filter size={11} />
            <span>{filtered.length} applicant{filtered.length === 1 ? "" : "s"}</span>
            {stage !== "All" && <Badge tone="sky">{stage}</Badge>}
            {hasFilters && <button onClick={resetFilters} className="ml-auto inline-flex items-center gap-1 text-slate-500 transition hover:text-white"><X size={10} /> Clear filters</button>}
          </div>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-col gap-3 border-b border-mint/10 bg-mint/[0.035] px-4 py-3 sm:flex-row sm:items-center">
            <p className="text-[11px] font-medium text-mint">{selected.length} selected</p>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <select value={bulkStage} onChange={event => setBulkStage(event.target.value as ApplicationStage)} className={`${selectClass} h-8 w-auto py-0 text-[10px]`} aria-label="Bulk stage">
                {APPLICATION_STAGES.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
              <button onClick={applyBulkStage} className="rounded-lg bg-mint px-3 py-1.5 text-[10px] font-semibold text-ink">Apply stage</button>
              <Link
                href={`/hr/email/compose?candidates=${selectedRecords.map(record => record.candidate.id).join(",")}`}
                className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-[10px] font-medium text-slate-300 hover:text-white"
              >
                Email selected
              </Link>
              <button onClick={() => setSelected([])} className="rounded-lg p-1.5 text-slate-500 hover:text-white" aria-label="Clear selection"><X size={12} /></button>
            </div>
          </div>
        )}

        {pageRecords.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="hr-table w-full min-w-[880px]">
                <thead className="border-b border-white/[0.06] bg-white/[0.015] text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                  <tr>
                    <th className="w-10 px-4 py-3"><input type="checkbox" checked={allPageSelected} onChange={toggleAll} aria-label="Select all applicants on this page" className="h-3.5 w-3.5 accent-[#7cf5c5]" /></th>
                    <th className="px-3 py-3">Candidate</th>
                    <th className="px-3 py-3">Role</th>
                    <th className="px-3 py-3">Applied</th>
                    <th className="px-3 py-3">Stage</th>
                    <th className="px-3 py-3">Evaluation</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.045]">
                  {pageRecords.map(record => (
                    <tr key={record.application.id}>
                      <td className="px-4 py-3.5"><input type="checkbox" checked={selected.includes(record.application.id)} onChange={() => toggleOne(record.application.id)} aria-label={`Select ${record.candidate.name}`} className="h-3.5 w-3.5 accent-[#7cf5c5]" /></td>
                      <td className="px-3 py-3.5">
                        <Link href={`/hr/applicants/${record.application.id}`} className="group flex items-center gap-2.5">
                          <Avatar name={record.candidate.name} size="sm" tone={record.application.stage === "Selected" ? "mint" : "violet"} />
                          <div>
                            <p className="text-[11px] font-medium text-slate-200 group-hover:text-white">{record.candidate.name}</p>
                            <p className="mt-0.5 text-[9px] text-slate-600">{record.candidate.email}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="max-w-[220px] px-3 py-3.5">
                        <p className="truncate text-[10px] text-slate-300">{record.job.title}</p>
                        <p className="mt-0.5 text-[9px] text-slate-600">{record.job.department} · {record.job.location}</p>
                      </td>
                      <td className="px-3 py-3.5 text-[10px] text-slate-500">{formatDate(record.application.appliedAt)}</td>
                      <td className="px-3 py-3.5"><StageBadge stage={record.application.stage} /></td>
                      <td className="px-3 py-3.5">
                        {record.score !== undefined ? (
                          <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-300"><span className="font-semibold text-white">{record.score.toFixed(1)}</span><span className="text-[8px] uppercase tracking-wide text-amber-200/60">demo</span></span>
                        ) : (
                          <span className="text-[9px] text-slate-600">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/hr/email/compose?candidate=${record.candidate.id}`} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.05] hover:text-white" aria-label={`Email ${record.candidate.name}`}><Mail size={12} /></Link>
                          <Link href={`/hr/applicants/${record.application.id}`} className="inline-flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-[9px] font-medium text-slate-400 transition hover:text-white">Review <ChevronRight size={10} /></Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col justify-between gap-3 border-t border-white/[0.055] px-4 py-3 sm:flex-row sm:items-center">
              <p className="text-[10px] text-slate-500">Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(current => Math.max(1, current - 1))} disabled={safePage === 1} className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.08] text-slate-400 transition hover:bg-white/[0.05] disabled:opacity-30" aria-label="Previous page"><ChevronLeft size={12} /></button>
                <span className="text-[10px] text-slate-500">Page {safePage} of {totalPages}</span>
                <button onClick={() => setPage(current => Math.min(totalPages, current + 1))} disabled={safePage === totalPages} className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.08] text-slate-400 transition hover:bg-white/[0.05] disabled:opacity-30" aria-label="Next page"><ChevronRight size={12} /></button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            title="No applicants match those filters"
            description="Try a broader search, another stage, or clear the filters."
            icon={Users}
            action={<button onClick={resetFilters} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-[10px] text-slate-300 hover:text-white"><ArrowLeft size={11} /> Reset filters</button>}
          />
        )}
      </section>

      <p className="flex items-center gap-1.5 text-[9px] text-slate-600">
        <CalendarDays size={10} /> Demo pipeline data is held in the current browser session. No applicant information is written to persistent storage.
      </p>
    </div>
  );
}

export function ApplicantsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-20 animate-pulse rounded-2xl bg-white/[0.035]" />
      <div className="h-[480px] animate-pulse rounded-2xl bg-white/[0.025]" />
    </div>
  );
}
