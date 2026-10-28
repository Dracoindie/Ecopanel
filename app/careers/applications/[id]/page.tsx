"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  Mail,
  MapPin,
  ShieldCheck
} from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { useIsDatabaseMode } from "@/components/AppModeProvider";
import { formatDate, formatFileSize } from "@/lib/format";

interface PublicApplicationSummary {
  publicReference: string;
  jobTitle: string;
  candidateName: string;
  submittedAt: string;
  cvStatus: string;
}

export default function ApplicationConfirmationPage() {
  const params = useParams<{ id: string }>();
  const isDatabase = useIsDatabaseMode();
  const { applications, candidates, jobs } = useDemoData();
  const [summary, setSummary] = useState<PublicApplicationSummary | null>(null);
  const [loading, setLoading] = useState(isDatabase);
  const [loadError, setLoadError] = useState("");
  const cvStatus = summary?.cvStatus;
  const application = applications.find(item => item.id === params.id);
  const candidate = candidates.find(item => item.id === application?.candidateId);
  const job = jobs.find(item => item.id === application?.jobId);

  useEffect(() => {
    if (!isDatabase) return;
    let active = true;
    setLoading(true);
    fetch(`/api/careers/applications/${encodeURIComponent(params.id)}`, { cache: "no-store" })
      .then(async response => {
        const body = await response.json() as { application?: PublicApplicationSummary; error?: string };
        if (!response.ok) throw new Error(body.error || "Application not found.");
        if (active) setSummary(body.application ?? null);
      })
      .catch(error => {
        if (active) setLoadError(error instanceof Error ? error.message : "Application not found.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [isDatabase, params.id]);

  useEffect(() => {
    if (!isDatabase || !cvStatus || !/Scanning|Pending scan|scan failed/i.test(cvStatus)) return;
    let active = true;
    let polls = 0;
    const timer = window.setInterval(async () => {
      polls += 1;
      if (polls > 15) {
        window.clearInterval(timer);
        return;
      }
      try {
        const response = await fetch(`/api/careers/applications/${encodeURIComponent(params.id)}`, { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json() as { application?: PublicApplicationSummary };
        if (active && body.application) {
          setSummary(body.application);
          if (!/Scanning|Pending scan|scan failed/i.test(body.application.cvStatus)) window.clearInterval(timer);
        }
      } catch {
        // Leave the last known status visible; the next poll or reload can recover.
      }
    }, 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isDatabase, params.id, cvStatus]);

  if (isDatabase) {
    if (loading) {
      return (
        <main className="mx-auto flex min-h-[58vh] w-full max-w-[780px] flex-col items-center justify-center px-6 py-20 text-center">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-mint" />
          <p className="mt-4 text-sm text-slate-500">Loading application…</p>
        </main>
      );
    }
    if (loadError || !summary) {
      return (
        <main className="mx-auto flex min-h-[58vh] w-full max-w-[780px] flex-col items-center justify-center px-6 py-20 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.1] bg-white/[0.03] text-slate-500"><FileText size={18} /></span>
          <h1 className="font-display mt-5 text-3xl text-white">Application not found.</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">{loadError || "Check the confirmation link or contact the hiring team."}</p>
          <Link href="/careers" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-[#090b10]">Browse open roles <ArrowRight size={13} /></Link>
        </main>
      );
    }
    return (
      <main className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 careers-glow opacity-70" />
        <div className="relative mx-auto w-full max-w-[960px] px-4 py-14 sm:px-6 lg:py-20">
          <div className="text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-mint/25 bg-mint/[0.08] text-mint shadow-[0_0_50px_rgba(124,245,197,.12)]"><Check size={23} /></span>
            <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.22em] text-mint">Application received</p>
            <h1 className="font-display mt-3 text-4xl leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl">Thanks, {summary.candidateName.split(" ")[0]}.</h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-400">
              Your application for <span className="font-medium text-white">{summary.jobTitle}</span> has been stored for the hiring team. Email delivery and interview scheduling are not yet connected.
            </p>
          </div>
          <div className="mt-9 grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-white/[0.08] bg-[#0a0e15]/80 p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Application</p>
              <dl className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Reference</dt><dd className="max-w-[190px] break-all font-mono text-right text-slate-200">{summary.publicReference}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Role</dt><dd className="text-right font-medium text-slate-200">{summary.jobTitle}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Submitted</dt><dd className="text-right text-slate-300">{formatDate(summary.submittedAt)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Stage</dt><dd className="text-right"><span className="rounded-full border border-amber-300/20 bg-amber-300/[0.06] px-2 py-0.5 text-[9px] font-semibold text-amber-200">New</span></dd></div>
              </dl>
            </section>
            <section className="rounded-2xl border border-white/[0.08] bg-[#0a0e15]/80 p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">CV storage</p>
              <div className="mt-4 flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-400"><FileText size={15} /></span>
                <div><p className="text-xs font-medium text-slate-200">Private CV record</p><p className="mt-0.5 text-[10px] text-slate-500">{summary.cvStatus}</p></div>
              </div>
              <p className="mt-4 flex items-start gap-2 text-[10px] leading-4 text-slate-500"><ShieldCheck size={11} className="mt-0.5 shrink-0" /> Recruiter downloads are organization-scoped and subject to the malware-scan policy.</p>
            </section>
          </div>
          <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
            <Link href="/careers#open-roles" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-[#090b10]">Explore more roles <ArrowRight size={13} /></Link>
            <Link href="/hr/login" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.12] px-5 py-2.5 text-xs font-medium text-slate-300 transition hover:text-white">Hiring team sign in</Link>
          </div>
        </div>
      </main>
    );
  }

  if (!application || !candidate || !job) {
    return (
      <main className="mx-auto flex min-h-[58vh] w-full max-w-[780px] flex-col items-center justify-center px-6 py-20 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.1] bg-white/[0.03] text-slate-500">
          <FileText size={18} />
        </span>
        <h1 className="font-display mt-5 text-3xl text-white">This demo submission is no longer in memory.</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
          The frontend demo keeps new applications in the current browser session only. If you refreshed the page, the temporary record has reset. No personal data was stored.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/careers" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-[#090b10]">
            Browse open roles <ArrowRight size={13} />
          </Link>
          <Link href="/hr/applicants" className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] px-5 py-2.5 text-xs font-medium text-slate-300">
            Open recruiter demo
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 careers-glow opacity-70" />
      <div className="relative mx-auto w-full max-w-[960px] px-4 py-14 sm:px-6 lg:py-20">
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-mint/25 bg-mint/[0.08] text-mint shadow-[0_0_50px_rgba(124,245,197,.12)]">
            <Check size={23} />
          </span>
          <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.22em] text-mint">Application submitted · demo</p>
          <h1 className="font-display mt-3 text-4xl leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl">Thanks, {candidate.name.split(" ")[0]}.</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-400">
            Your application for <span className="font-medium text-white">{job.title}</span> was added to the local demo workspace. No data was sent to a server, and no confirmation email was delivered.
          </p>
        </div>

        <div className="mt-9 grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-white/[0.08] bg-[#0a0e15]/80 p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Application</p>
            <dl className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Reference</dt><dd className="font-mono text-slate-200">{application.id}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Role</dt><dd className="text-right font-medium text-slate-200">{job.title}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Department</dt><dd className="text-right text-slate-300">{job.department}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Submitted</dt><dd className="text-right text-slate-300">{formatDate(application.appliedAt)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Current stage</dt><dd className="text-right"><span className="rounded-full border border-amber-300/20 bg-amber-300/[0.06] px-2 py-0.5 text-[9px] font-semibold text-amber-200">New</span></dd></div>
            </dl>
          </section>
          <section className="rounded-2xl border border-white/[0.08] bg-[#0a0e15]/80 p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Candidate</p>
            <dl className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Name</dt><dd className="text-right font-medium text-slate-200">{candidate.name}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Email</dt><dd className="max-w-[210px] truncate text-right text-slate-300">{candidate.email}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Phone</dt><dd className="text-right text-slate-300">{candidate.phone}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Location</dt><dd className="inline-flex items-center gap-1 text-right text-slate-300"><MapPin size={10} /> {job.location}</dd></div>
            </dl>
          </section>
        </div>

        <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#0a0e15]/80 p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">CV metadata</p>
              <div className="mt-3 flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-400"><FileText size={15} /></span>
                <div>
                  <p className="text-xs font-medium text-slate-200">{application.cv.fileName}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">{formatFileSize(application.cv.size)} · {application.cv.storageStatus}</p>
                </div>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-amber-300/15 bg-amber-300/[0.05] px-2.5 py-1 text-[9px] font-semibold text-amber-200/75 sm:self-center">
              <ShieldCheck size={10} /> Local demo record
            </span>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#0a0e15]/80 p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">What happens next</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { icon: CheckCircle2, title: "Demo record created", text: "The recruiter dashboard and applicant pipeline now include this application." },
              { icon: Mail, title: "Email not sent", text: "A confirmation template exists, but no mail provider is connected in this phase." },
              { icon: Clock3, title: "Human review", text: "In production, a recruiter would review the application and decide next steps." }
            ].map(item => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5">
                  <Icon size={14} className="text-violet-200/80" />
                  <p className="mt-2.5 text-[11px] font-semibold text-slate-200">{item.title}</p>
                  <p className="mt-1 text-[10px] leading-4 text-slate-500">{item.text}</p>
                </div>
              );
            })}
          </div>
        </section>

        <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
          <Link href="/careers#open-roles" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-[#090b10]">
            Explore more roles <ArrowRight size={13} />
          </Link>
          <Link href="/hr/applicants" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.12] px-5 py-2.5 text-xs font-medium text-slate-300 transition hover:text-white">
            View in recruiter demo
          </Link>
          <Link href="/demo" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.12] px-5 py-2.5 text-xs font-medium text-slate-300 transition hover:text-white">
            Preview voice interview
          </Link>
        </div>
      </div>
    </main>
  );
}
