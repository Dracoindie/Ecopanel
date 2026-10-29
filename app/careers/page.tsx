"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock3,
  MapPin,
  Search,
  Sparkles,
  Users,
  X
} from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { PanelTrio } from "@/components/PanelTrio";
import { useIsDatabaseMode } from "@/components/AppModeProvider";
import type { Job } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { publicInputClass } from "@/lib/ui";

const HIRING_STEPS = [
  {
    number: "01",
    title: "Apply with context",
    text: "Tell us what you have built and why this work matters to you. A CV helps, but your thinking matters more."
  },
  {
    number: "02",
    title: "Have a real conversation",
    text: "Selected candidates take part in an adaptive voice interview. A human hiring team reviews every assessment."
  },
  {
    number: "03",
    title: "Decide together",
    text: "We share clear next steps, make space for your questions, and move at a pace that respects your time."
  }
];

const VALUES = [
  { icon: Building2, label: "Infrastructure", text: "We build the dependable layer beneath ambitious products." },
  { icon: Users, label: "High trust", text: "Small teams, clear ownership, and decisions made close to the work." },
  { icon: Sparkles, label: "Craft", text: "We care about the details that make complex systems feel calm." }
];

export default function CareersPage() {
  const { jobs: demoJobs } = useDemoData();
  const isDatabase = useIsDatabaseMode();
  const [databaseJobs, setDatabaseJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("All");
  const [location, setLocation] = useState("All");
  const [employmentType, setEmploymentType] = useState("All");

  useEffect(() => {
    if (!isDatabase) return;
    let active = true;
    setLoading(true);
    fetch("/api/careers/jobs", { cache: "no-store" })
      .then(async response => {
        const body = await response.json() as { jobs?: Job[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Job listings are unavailable.");
        if (active) setDatabaseJobs(body.jobs ?? []);
      })
      .catch(error => {
        if (active) setLoadError(error instanceof Error ? error.message : "Job listings are unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [isDatabase]);

  const jobs = isDatabase ? databaseJobs : demoJobs;
  const publicJobs = useMemo(
    () => jobs.filter(job => job.status === "Published" && job.publicVisible),
    [jobs]
  );
  const departments = useMemo(() => ["All", ...Array.from(new Set(publicJobs.map(job => job.department)))], [publicJobs]);
  const locations = useMemo(() => ["All", ...Array.from(new Set(publicJobs.map(job => job.location)))], [publicJobs]);
  const types = useMemo(() => ["All", ...Array.from(new Set(publicJobs.map(job => job.employmentType)))], [publicJobs]);

  const filtered = publicJobs.filter(job => {
    const text = `${job.title} ${job.department} ${job.location} ${job.shortDescription}`.toLowerCase();
    if (query.trim() && !text.includes(query.trim().toLowerCase())) return false;
    if (department !== "All" && job.department !== department) return false;
    if (location !== "All" && job.location !== location) return false;
    if (employmentType !== "All" && job.employmentType !== employmentType) return false;
    return true;
  });

  const hasFilters = query.trim() || department !== "All" || location !== "All" || employmentType !== "All";

  return (
    <main className="overflow-hidden">
      <section className="relative border-b border-white/[0.055]">
        <div className="pointer-events-none absolute inset-0 careers-glow" />
        <div className="pointer-events-none absolute inset-0 dot-grid opacity-[0.28]" />
        <div className="relative mx-auto grid w-full max-w-[1440px] items-center gap-12 px-4 pb-20 pt-16 sm:px-6 md:pt-24 lg:grid-cols-[1.02fr_.98fr] lg:px-10 lg:pb-28">
          <div className="fade-up">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.12] bg-white/[0.035]">
                <span className="grid h-3.5 w-3.5 rotate-45 place-items-center border border-white/70">
                  <span className="h-1 w-1 bg-violet" />
                </span>
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Careers at Nexora Labs</span>
            </div>

            <h1 className="font-display mt-8 max-w-[720px] text-[52px] leading-[0.98] tracking-[-0.048em] text-white sm:text-[68px] lg:text-[82px]">
              Build the infrastructure for intelligent software.
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-slate-400">
              Nexora Labs builds the high-performance, real-time data and AI primitives powering the next generation of mission-critical systems. We are looking for people who care about the foundations.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="#open-roles" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100">
                Explore open roles
              </Link>
              <Link href="#how-we-hire" className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] px-6 py-3 text-sm font-medium text-slate-300 transition hover:border-white/25 hover:text-white">
                How we hire
              </Link>
            </div>
            <div className="mt-11 flex flex-wrap gap-x-7 gap-y-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-mint" /> {loading ? "Loading roles…" : `${publicJobs.length} open roles`}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-violet" /> {departments.length - 1} teams hiring</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-300" /> Remote-first, globally distributed</span>
            </div>
          </div>

          <div className="fade-up rounded-3xl border border-white/10 bg-card p-6 sm:p-8">
            <p className="text-[14px] font-medium text-slate-400">How you will be interviewed</p>
            <h2 className="mt-2 text-[28px] font-semibold leading-tight text-white">A live voice conversation with a panel of three.</h2>
            <p className="mt-3 text-[15px] leading-7 text-slate-400">Each interviewer listens for something different. They take turns, so you can answer in your own words without being talked over.</p>
            <PanelTrio className="mt-7" />
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[1440px] gap-px border-b border-white/[0.055] bg-white/[0.055] px-0 sm:grid-cols-3 lg:px-10">
        {VALUES.map(value => {
          const Icon = value.icon;
          return (
            <div key={value.label} className="bg-ink px-6 py-8 lg:px-8">
              <Icon size={16} className="text-violet-200/80" />
              <p className="mt-4 text-sm font-semibold text-white">{value.label}</p>
              <p className="mt-2 max-w-xs text-xs leading-5 text-slate-500">{value.text}</p>
            </div>
          );
        })}
      </section>

      <section id="open-roles" className="mx-auto w-full max-w-[1440px] scroll-mt-24 px-4 py-20 sm:px-6 lg:px-10">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">Open roles</p>
            <h2 className="font-display mt-3 text-4xl tracking-[-0.035em] text-white sm:text-5xl">Find your next problem.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">A small number of focused roles across engineering, product, design, and people. Every application is read by a human.</p>
          </div>
          <span className="text-xs text-slate-500">{filtered.length} of {publicJobs.length} roles</span>
        </div>

        {loadError && (
          <div className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] px-4 py-3 text-xs text-rose-200" role="alert">
            {loadError} No demo listings are being shown in database mode.
          </div>
        )}

        <div className="mt-9 rounded-2xl border border-white/[0.08] bg-white/[0.022] p-3 sm:p-4">
          <div className="grid gap-2.5 lg:grid-cols-[1.5fr_1fr_1fr]">
            <label className="relative block">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search roles, teams, or locations"
                className={`${publicInputClass} pl-9`}
                aria-label="Search open roles"
              />
            </label>
            <select value={location} onChange={event => setLocation(event.target.value)} className={`${publicInputClass} appearance-none [&>option]:bg-ink`} aria-label="Filter by location">
              {locations.map(value => <option key={value} value={value}>{value === "All" ? "All locations" : value}</option>)}
            </select>
            <select value={employmentType} onChange={event => setEmploymentType(event.target.value)} className={`${publicInputClass} appearance-none [&>option]:bg-ink`} aria-label="Filter by employment type">
              {types.map(value => <option key={value} value={value}>{value === "All" ? "All employment types" : value}</option>)}
            </select>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {departments.map(value => (
              <button
                key={value}
                onClick={() => setDepartment(value)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[11px] font-medium transition",
                  department === value
                    ? "border-white bg-white text-ink"
                    : "border-white/[0.08] bg-transparent text-slate-500 hover:border-white/20 hover:text-white"
                )}
              >
                {value === "All" ? "All teams" : value}
              </button>
            ))}
            {hasFilters && (
              <button
                onClick={() => { setQuery(""); setDepartment("All"); setLocation("All"); setEmploymentType("All"); }}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] text-slate-500 transition hover:text-white"
              >
                <X size={11} /> Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {filtered.map(job => (
            <Link key={job.id} href={`/careers/jobs/${job.id}`} className="group grid gap-4 py-7 transition md:grid-cols-[1.15fr_.85fr_auto] md:items-center md:gap-8">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5 text-[10px] font-medium uppercase tracking-[0.11em] text-slate-500">
                  <span className="text-violet-300/90">{job.department}</span>
                  <span className="h-0.5 w-0.5 rounded-full bg-slate-600" />
                  <span>{job.workplace}</span>
                  <span className="h-0.5 w-0.5 rounded-full bg-slate-600" />
                  <span>{job.employmentType}</span>
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-[-0.025em] text-white transition group-hover:text-mint sm:text-2xl">{job.title}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{job.shortDescription}</p>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5"><MapPin size={12} /> {job.location}</span>
                <span className="inline-flex items-center gap-1.5"><Clock3 size={12} /> {job.salaryRange}</span>
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={12} className="text-mint/60" /> Posted {formatDate(job.publishedAt)}</span>
              </div>
              <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 transition group-hover:text-mint">
                View role
                <span className="grid h-8 w-8 place-items-center rounded-full border border-white/[0.1] transition group-hover:border-mint/30 group-hover:bg-mint/[0.06]">
                  <ArrowUpRight size={13} />
                </span>
              </span>
            </Link>
          ))}
          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-sm font-semibold text-slate-300">No roles match those filters.</p>
              <p className="mt-2 text-xs text-slate-500">Try clearing the search or choosing a different team.</p>
              <button onClick={() => { setQuery(""); setDepartment("All"); setLocation("All"); setEmploymentType("All"); }} className="mt-4 text-xs font-medium text-mint hover:text-white">
                Reset filters
              </button>
            </div>
          )}
        </div>
      </section>

      <section id="how-we-hire" className="scroll-mt-24 border-y border-white/[0.055] bg-ink">
        <div className="mx-auto w-full max-w-[1440px] px-4 py-20 sm:px-6 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/80">How we hire</p>
              <h2 className="font-display mt-3 text-4xl tracking-[-0.035em] text-white sm:text-5xl">A process with fewer mysteries.</h2>
              <p className="mt-4 max-w-md text-sm leading-6 text-slate-500">We aim to make each step legible. You should always know what we are looking for, who you will meet, and what happens next.</p>
              <Link href="/demo" className="mt-7 inline-flex items-center gap-2 text-xs font-medium text-slate-300 transition hover:text-white">
                Preview the interview experience
              </Link>
            </div>
            <div className="space-y-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06]">
              {HIRING_STEPS.map(step => (
                <div key={step.number} className="grid gap-4 bg-ink px-5 py-6 sm:grid-cols-[44px_1fr] sm:px-7">
                  <span className="font-mono text-[10px] text-violet-300/70">{step.number}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{step.title}</h3>
                    <p className="mt-2 max-w-xl text-xs leading-5 text-slate-500">{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1440px] px-4 py-20 sm:px-6 lg:px-10">
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-card p-8 sm:p-12">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">No perfect profile required</p>
          <h2 className="font-display mt-3 max-w-2xl text-4xl leading-[1.03] tracking-[-0.035em] text-white sm:text-5xl">If the problem interests you, we would like to hear how you think.</h2>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="#open-roles" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100">
              Browse open roles
            </Link>
            <Link href="/hr/login" className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] px-5 py-3 text-sm font-medium text-slate-300 transition hover:border-white/25 hover:text-white">
              Hiring team sign in
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
