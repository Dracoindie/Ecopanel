"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clipboard,
  Clock3,
  MapPin,
  Sparkles,
  Users
} from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { useIsDatabaseMode } from "@/components/AppModeProvider";
import type { Job } from "@/lib/domain";
import { useToast } from "@/components/ToastProvider";
import { formatDate } from "@/lib/format";

export default function PublicJobPage() {
  const params = useParams<{ id: string }>();
  const { jobs: demoJobs } = useDemoData();
  const { toast } = useToast();
  const isDatabase = useIsDatabaseMode();
  const [databaseJob, setDatabaseJob] = useState<Job | null>(null);
  const [databaseJobs, setDatabaseJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(isDatabase);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!isDatabase) return;
    let active = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/careers/jobs/${encodeURIComponent(params.id)}`, { cache: "no-store" }),
      fetch("/api/careers/jobs", { cache: "no-store" })
    ]).then(async ([jobResponse, jobsResponse]) => {
      const jobBody = await jobResponse.json() as { job?: Job; error?: string };
      const jobsBody = await jobsResponse.json() as { jobs?: Job[] };
      if (!active) return;
      if (jobResponse.status === 404) {
        setDatabaseJob(null);
        setLoadError("");
      } else if (!jobResponse.ok) {
        throw new Error(jobBody.error || "This role is temporarily unavailable.");
      } else {
        setDatabaseJob(jobBody.job ?? null);
        setDatabaseJobs(jobsBody.jobs ?? []);
      }
    }).catch(error => {
      if (active) setLoadError(error instanceof Error ? error.message : "This role is temporarily unavailable.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [isDatabase, params.id]);

  const jobs = isDatabase ? databaseJobs : demoJobs;
  const job = isDatabase ? databaseJob : jobs.find(item => item.id === params.id) ?? null;
  const isPublic = job?.status === "Published" && job.publicVisible;

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[58vh] w-full max-w-[900px] flex-col items-center justify-center px-6 py-20 text-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-mint" />
        <p className="mt-4 text-sm text-slate-500">Loading role…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="mx-auto flex min-h-[58vh] w-full max-w-[900px] flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="font-display text-3xl text-white">This role is temporarily unavailable.</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">{loadError}</p>
        <Link href="/careers" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-[#090b10]">
          Browse open roles <ArrowRight size={13} />
        </Link>
      </main>
    );
  }

  if (!job || !isPublic) {
    return (
      <main className="mx-auto flex min-h-[58vh] w-full max-w-[900px] flex-col items-center justify-center px-6 py-20 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.1] bg-white/[0.03] text-slate-500">
          <MapPin size={18} />
        </span>
        <h1 className="font-display mt-5 text-3xl text-white">This role is not publicly available.</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">The position may have closed, or the link may belong to a private preview. Browse the current open roles to find another fit.</p>
        <Link href="/careers" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-[#090b10]">
          Browse open roles <ArrowRight size={13} />
        </Link>
      </main>
    );
  }

  const related = jobs.filter(item => item.status === "Published" && item.publicVisible && item.id !== job.id && item.department === job.department).slice(0, 2);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Role link copied", "info");
    } catch {
      toast("Could not copy the role link in this browser", "error");
    }
  };

  return (
    <main>
      <div className="border-b border-white/[0.055] bg-[#070a10]">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-10">
          <Link href="/careers#open-roles" className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 transition hover:text-white">
            <ArrowLeft size={13} /> All open roles
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Careers</span>
            <span className="text-slate-700">/</span>
            <span className="max-w-[220px] truncate text-[10px] uppercase tracking-[0.14em] text-slate-400">{job.department}</span>
          </div>
        </div>
      </div>

      <section className="relative overflow-hidden border-b border-white/[0.055]">
        <div className="pointer-events-none absolute inset-0 careers-glow opacity-60" />
        <div className="relative mx-auto grid w-full max-w-[1440px] gap-10 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1fr_340px] lg:px-10">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-violet/25 bg-violet/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-violet-200">{job.department}</span>
              <span className="rounded-full border border-white/[0.08] px-3 py-1 text-[10px] font-medium text-slate-400">{job.workplace}</span>
              <span className="rounded-full border border-white/[0.08] px-3 py-1 text-[10px] font-medium text-slate-400">{job.employmentType}</span>
            </div>
            <h1 className="font-display mt-6 max-w-[820px] text-5xl leading-[0.99] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">{job.title}</h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400">{job.description}</p>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><MapPin size={12} /> {job.location} · {job.workplace}</span>
              <span className="inline-flex items-center gap-1.5"><Clock3 size={12} /> {job.salaryRange}</span>
              <span className="inline-flex items-center gap-1.5"><Users size={12} /> {job.department}</span>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-white/[0.1] bg-[#0a0e15]/90 p-5 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Role snapshot</p>
                <span className="inline-flex items-center gap-1.5 text-[9px] text-mint"><span className="h-1.5 w-1.5 rounded-full bg-mint" /> Open</span>
              </div>
              <dl className="mt-5 space-y-3 border-y border-white/[0.06] py-4 text-xs">
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Team</dt><dd className="text-right font-medium text-slate-200">{job.department}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Location</dt><dd className="text-right font-medium text-slate-200">{job.location}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Type</dt><dd className="text-right font-medium text-slate-200">{job.employmentType}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Posted</dt><dd className="text-right font-medium text-slate-200">{formatDate(job.publishedAt)}</dd></div>
              </dl>
              <Link href={`/careers/apply/${job.id}`} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#090b10] transition hover:bg-slate-100">
                Apply for this role <ArrowRight size={14} />
              </Link>
              <button onClick={copyLink} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.09] px-4 py-2.5 text-xs font-medium text-slate-400 transition hover:border-white/20 hover:text-white">
                <Clipboard size={12} /> Copy role link
              </button>
              <p className="mt-4 text-[9px] leading-4 text-slate-600">
                {isDatabase
                  ? "Your application and CV are stored privately for this hiring team. Email delivery remains simulated."
                  : "This is a frontend demo. Applications stay in the local demo workspace and no CV is uploaded or shared."}
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[1440px] gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1fr_340px] lg:px-10">
        <div className="max-w-3xl space-y-10">
          <div>
            <h2 className="font-display text-3xl tracking-[-0.03em] text-white">What you will do</h2>
            <div className="mt-5 space-y-3">
              {job.responsibilities.map(item => (
                <div key={item} className="flex gap-3 text-sm leading-6 text-slate-400">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-300/80" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-display text-3xl tracking-[-0.03em] text-white">What we are looking for</h2>
            <div className="mt-5 space-y-3">
              {job.qualifications.map(item => (
                <div key={item} className="flex gap-3 text-sm leading-6 text-slate-400">
                  <Check size={14} className="mt-1 shrink-0 text-mint/70" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles size={15} className="text-violet-300" /> How the interview works</div>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Selected candidates take part in an adaptive voice conversation with EchoPanel. The experience includes live technical and product perspectives, a transcript reviewed by the hiring team, and a final human decision. If you need an alternative format or adjustment, tell us in your application.
            </p>
            <Link href="/demo" className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-mint transition hover:text-white">
              Preview the interview demo <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        <aside>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Hiring journey</p>
            <div className="mt-4 space-y-4">
              {["Application review", "Adaptive voice conversation", "Hiring team decision"].map((step, index) => (
                <div key={step} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-violet/20 bg-violet/[0.08] font-mono text-[9px] text-violet-200">{index + 1}</span>
                  <p className="pt-1 text-xs leading-5 text-slate-400">{step}</p>
                </div>
              ))}
            </div>
          </div>
          {related.length > 0 && (
            <div className="mt-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">More in {job.department}</p>
              <div className="mt-3 space-y-2">
                {related.map(item => (
                  <Link key={item.id} href={`/careers/jobs/${item.id}`} className="group flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 transition hover:border-white/[0.14]">
                    <div>
                      <p className="text-xs font-semibold text-slate-200 group-hover:text-white">{item.title}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{item.location} · {item.employmentType}</p>
                    </div>
                    <ArrowRight size={12} className="text-slate-600 group-hover:text-mint" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </section>

      <section className="border-t border-white/[0.055] bg-[#070a10]">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col items-start justify-between gap-5 px-4 py-10 sm:px-6 md:flex-row md:items-center lg:px-10">
          <div>
            <p className="font-display text-2xl text-white">Ready to build what comes next?</p>
            <p className="mt-1 text-xs text-slate-500">The application takes about five minutes.</p>
          </div>
          <Link href={`/careers/apply/${job.id}`} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#090b10] transition hover:bg-slate-100">
            Apply for {job.title} <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </main>
  );
}
