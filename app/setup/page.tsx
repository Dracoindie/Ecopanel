"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Clock3,
  FileText,
  Gauge,
  Layers3,
  Mic,
  ShieldCheck,
  Sparkles,
  UserRound
} from "lucide-react";

const SETUP_KEY = "echopanel-interview-setup";

/** A persisted interview id handed over by the HR portal; the token route re-checks ownership. */
function persistedInterviewId(search: string) {
  const id = new URLSearchParams(search).get("interviewId");
  return id && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

export type StoredInterviewSetup = {
  candidateName: string;
  targetRole: string;
  jobDescription: string;
  experienceLevel: string;
  panelMode: string;
  duration: string;
  interviewId: string;
};

const fieldClass =
  "mt-2 w-full rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-mint/40 focus:bg-white/[0.04] focus:ring-4 focus:ring-mint/[0.06]";
const selectClass = `${fieldClass} appearance-none pr-9 [&>option]:bg-panel`;

function FieldLabel({ icon: Icon, children }: { icon: typeof UserRound; children: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
      <Icon size={12} className="text-slate-500" />
      {children}
    </span>
  );
}

function PreviewRow({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.05] bg-black/10 px-3 py-2.5">
      <Icon size={13} className="shrink-0 text-slate-500" />
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className="ml-auto truncate text-right text-[10px] font-medium text-slate-300">{value}</span>
    </div>
  );
}

export default function Setup() {
  const router = useRouter();
  const [candidateName, setCandidateName] = useState("Alex Sharma");
  const [targetRole, setTargetRole] = useState("Software Engineer");
  const [jobDescription, setJobDescription] = useState(
    "Build reliable payment APIs with low latency, Redis caching, strong ownership of incidents, and clear customer impact metrics for merchants."
  );
  const [experienceLevel, setExperienceLevel] = useState("Mid");
  const [panelMode, setPanelMode] = useState("Full Panel");
  const [duration, setDuration] = useState("20 min");

  // Opened from the HR portal: start from the persisted candidate and role, not the demo defaults.
  useEffect(() => {
    const interviewId = persistedInterviewId(window.location.search);
    if (!interviewId) return;
    let active = true;
    fetch(`/api/hr/interviews/${encodeURIComponent(interviewId)}`, { cache: "no-store" })
      .then(response => (response.ok ? response.json() : null))
      .then((detail: { candidate?: { name?: string }; job?: { title?: string; description?: string; shortDescription?: string } } | null) => {
        if (!active || !detail) return;
        if (detail.candidate?.name) setCandidateName(detail.candidate.name);
        if (detail.job?.title) setTargetRole(detail.job.title);
        const description = detail.job?.description || detail.job?.shortDescription;
        if (description) setJobDescription(description.slice(0, 4000));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const persistAndGo = (path: string) => {
    const setup: StoredInterviewSetup = {
      candidateName: candidateName.trim() || "Candidate",
      targetRole: targetRole.trim() || "Software Engineer",
      jobDescription: jobDescription.trim(),
      experienceLevel,
      panelMode,
      duration,
      interviewId: persistedInterviewId(window.location.search) ?? `live-${Date.now()}`
    };
    try {
      sessionStorage.setItem(SETUP_KEY, JSON.stringify(setup));
    } catch {
      /* ignore quota */
    }
    router.push(path);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    persistAndGo("/live");
  };

  const previewName = candidateName.trim() || "Your candidate";
  const previewRole = targetRole.trim() || "Software Engineer";
  const previewInitials =
    previewName
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part[0])
      .join("")
      .toUpperCase() || "C";
  const briefLength = jobDescription.trim().length;

  return (
    <main className="relative min-h-screen overflow-hidden bg-ink">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_16%_8%,rgba(124,245,197,.07),transparent_30%),radial-gradient(circle_at_86%_20%,rgba(156,140,255,.08),transparent_28%),radial-gradient(circle_at_55%_100%,rgba(124,245,197,.035),transparent_32%)]" />
      <div className="page-noise pointer-events-none fixed inset-0 opacity-[0.16]" />
      <div className="pointer-events-none absolute inset-0 gridline opacity-[0.18]" />

      <div className="relative z-10 mx-auto max-w-[1380px] px-5 pb-12 lg:px-8">
        <header className="flex items-center justify-between gap-4 py-5">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl border border-mint/15 bg-gradient-to-br from-mint/[0.12] to-violet/[0.08] transition group-hover:border-mint/30">
              <AudioLines size={14} className="text-mint" />
            </span>
            <span className="text-[15px] font-bold tracking-[-0.02em] text-white">
              echo<span className="text-mint">panel</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/demo"
              className="hidden rounded-full px-3 py-2 text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500 transition hover:text-white sm:block"
            >
              Demo
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400 transition hover:border-white/15 hover:text-white"
            >
              <ArrowLeft size={12} />
              Home
            </Link>
          </div>
        </header>

        <div className="grid gap-8 pb-10 pt-8 lg:grid-cols-[minmax(0,1fr)_370px] lg:gap-10 lg:pt-12">
          <section className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-mint">
              <span className="h-1 w-1 rounded-full bg-mint" />
              Interview setup
            </div>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-[1.04] tracking-[-0.035em] text-white sm:text-5xl">
              Build your interview room.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">
              Set the role, brief, and panel context. Your answers shape the conversation once the room opens.
            </p>

            <form onSubmit={onSubmit} className="surface mt-7 rounded-[28px] p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Interview brief</p>
                  <h2 className="mt-1 text-lg font-semibold tracking-[-0.01em] text-white">The essentials</h2>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-mint/15 bg-mint/[0.05] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-mint/85">
                  <Sparkles size={10} />
                  Adaptive room
                </span>
              </div>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <label className="block">
                  <FieldLabel icon={UserRound}>Candidate name</FieldLabel>
                  <input
                    value={candidateName}
                    onChange={e => setCandidateName(e.target.value)}
                    className={fieldClass}
                    placeholder="Candidate name"
                  />
                </label>

                <label className="block">
                  <FieldLabel icon={Gauge}>Target role</FieldLabel>
                  <input
                    value={targetRole}
                    onChange={e => setTargetRole(e.target.value)}
                    className={fieldClass}
                    placeholder="e.g. Senior Backend Engineer"
                  />
                </label>
              </div>

              <label className="mt-5 block">
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel icon={FileText}>Job description or key requirements</FieldLabel>
                  <span className="font-mono text-[9px] text-slate-600">{briefLength} characters</span>
                </div>
                <textarea
                  value={jobDescription}
                  onChange={e => setJobDescription(e.target.value)}
                  placeholder="Paste a job description or the outcomes this role needs to deliver."
                  className={`${fieldClass} min-h-[132px] resize-y leading-6`}
                />
              </label>

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <FieldLabel icon={Gauge}>Experience</FieldLabel>
                  <div className="relative">
                    <select
                      value={experienceLevel}
                      onChange={e => setExperienceLevel(e.target.value)}
                      className={selectClass}
                    >
                      <option>Junior</option>
                      <option>Mid</option>
                      <option>Senior</option>
                      <option>Staff</option>
                    </select>
                    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-600">
                      ▾
                    </span>
                  </div>
                </label>
                <label className="block">
                  <FieldLabel icon={Layers3}>Panel mode</FieldLabel>
                  <div className="relative">
                    <select value={panelMode} onChange={e => setPanelMode(e.target.value)} className={selectClass}>
                      <option>Full Panel</option>
                      <option>Technical Focus</option>
                      <option>Product Focus</option>
                    </select>
                    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-600">
                      ▾
                    </span>
                  </div>
                </label>
                <label className="block">
                  <FieldLabel icon={Clock3}>Duration</FieldLabel>
                  <div className="relative">
                    <select value={duration} onChange={e => setDuration(e.target.value)} className={selectClass}>
                      <option>15 min</option>
                      <option>20 min</option>
                      <option>30 min</option>
                    </select>
                    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-600">
                      ▾
                    </span>
                  </div>
                </label>
              </div>

              <div className="mt-6 rounded-2xl border border-mint/10 bg-mint/[0.035] p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-mint/15 bg-mint/[0.06] text-mint">
                    <ShieldCheck size={14} />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-mint">AI disclosure</p>
                    <p className="mt-1.5 text-[10px] leading-5 text-slate-400">
                      You are about to interact with AI interviewers. Your voice, responses, and interview performance
                      may be processed to generate your assessment. Human review remains available. EchoPanel&apos;s
                      Moderator controls the speaking floor.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-mint px-5 py-3 text-xs font-semibold text-ink shadow-[0_0_30px_rgba(124,245,197,.12)] transition hover:bg-mint-hover"
                >
                  I understand &amp; enter live room
                </button>
                <button
                  type="button"
                  onClick={() => persistAndGo("/demo")}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.025] px-5 py-3 text-xs font-semibold text-slate-300 transition hover:border-white/15 hover:bg-white/[0.05] hover:text-white"
                >
                  <Sparkles size={14} />
                  Explore demo room
                </button>
              </div>

              <p className="mt-4 flex items-center gap-1.5 text-[9px] text-slate-600">
                <Clock3 size={10} />
                Setup is stored for this browser tab and does not require an account.
              </p>
            </form>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-6">
            <section className="surface overflow-hidden rounded-[28px] p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Room preview</p>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.025] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                  <span className="h-1 w-1 rounded-full bg-mint/60" />
                  Session setup
                </span>
              </div>

              <div className="mt-5 flex flex-col items-center border-b border-white/[0.055] pb-5 text-center">
                <div className="relative grid h-20 w-20 place-items-center rounded-full border border-mint/20 bg-gradient-to-br from-mint/[0.12] via-card to-violet/[0.12] text-xl font-semibold tracking-[0.04em] text-white">
                  <span className="absolute inset-[5px] rounded-full border border-white/[0.05]" />
                  {previewInitials}
                </div>
                <p className="mt-3 max-w-full truncate text-sm font-semibold text-white">{previewName}</p>
                <p className="mt-1 max-w-full truncate text-[10px] text-slate-500">{previewRole}</p>
                <span className="mt-2.5 rounded-full border border-violet/15 bg-violet/[0.06] px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-violet-200/80">
                  AI interview panel
                </span>
              </div>

              <div className="mt-4 space-y-2">
                <PreviewRow icon={Gauge} label="Experience" value={experienceLevel} />
                <PreviewRow icon={Layers3} label="Panel mode" value={panelMode} />
                <PreviewRow icon={Clock3} label="Duration" value={duration} />
                <PreviewRow
                  icon={FileText}
                  label="Role brief"
                  value={briefLength > 0 ? `${briefLength} characters attached` : "Not attached"}
                />
              </div>

              <div className="mt-5 border-t border-white/[0.055] pt-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">Interviewers in the room</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {["Moderator", "Technical", "Product", "Behavioural"].map(role => (
                    <span
                      key={role}
                      className="rounded-full border border-white/[0.06] bg-white/[0.025] px-2.5 py-1 text-[9px] text-slate-400"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-white/[0.05] bg-black/10 p-3">
                <Mic size={13} className="mt-0.5 shrink-0 text-mint/80" />
                <p className="text-[9px] leading-4 text-slate-500">
                  Microphone access is requested only when you start the live voice room.
                </p>
              </div>
            </section>

            <section className="rounded-[24px] border border-white/[0.06] bg-white/[0.018] p-5">
              <div className="flex items-center gap-2">
                <Sparkles size={13} className="text-violet-200/80" />
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">How the room works</p>
              </div>
              <div className="mt-4 space-y-4">
                {[
                  ["01", "Voice handshake", "The live room requests a secure Agora audio session."],
                  ["02", "Moderator-led floor", "One AI interviewer speaks at a time, sequenced from your answers."],
                  ["03", "Evidence-linked review", "Finalized turns build the transcript, claims, and assessment trail."]
                ].map(([step, title, text]) => (
                  <div key={step} className="flex gap-3">
                    <span className="mt-0.5 font-mono text-[9px] text-mint/60">{step}</span>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-300">{title}</p>
                      <p className="mt-0.5 text-[9px] leading-4 text-slate-600">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
