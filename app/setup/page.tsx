"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const SETUP_KEY = "echopanel-interview-setup";

export type StoredInterviewSetup = {
  candidateName: string;
  targetRole: string;
  jobDescription: string;
  experienceLevel: string;
  panelMode: string;
  duration: string;
  interviewId: string;
};

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

  const persistAndGo = (path: string) => {
    const setup: StoredInterviewSetup = {
      candidateName: candidateName.trim() || "Candidate",
      targetRole: targetRole.trim() || "Software Engineer",
      jobDescription: jobDescription.trim(),
      experienceLevel,
      panelMode,
      duration,
      interviewId: `live-${Date.now()}`
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

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-14">
      <Link href="/" className="font-bold">
        echo<span className="text-mint">panel</span>
      </Link>
      <p className="mt-12 text-xs font-bold tracking-[.2em] text-mint">INTERVIEW SETUP</p>
      <h1 className="mt-3 text-4xl font-semibold">Build your interview room.</h1>

      <form onSubmit={onSubmit} className="glass mt-8 space-y-6 rounded-2xl p-6">
        <label className="block text-sm">
          Candidate name
          <input
            value={candidateName}
            onChange={e => setCandidateName(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 p-3"
          />
        </label>

        <label className="block text-sm">
          Target role
          <input
            value={targetRole}
            onChange={e => setTargetRole(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 p-3"
          />
        </label>

        <label className="block text-sm">
          Job description
          <textarea
            value={jobDescription}
            onChange={e => setJobDescription(e.target.value)}
            placeholder="Paste a job description or key requirements"
            className="mt-2 h-28 w-full rounded-lg border border-white/10 bg-white/5 p-3"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">
            Experience
            <select
              value={experienceLevel}
              onChange={e => setExperienceLevel(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 p-3"
            >
              <option>Junior</option>
              <option>Mid</option>
              <option>Senior</option>
              <option>Staff</option>
            </select>
          </label>
          <label className="text-sm">
            Panel mode
            <select
              value={panelMode}
              onChange={e => setPanelMode(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 p-3"
            >
              <option>Full Panel</option>
              <option>Technical Focus</option>
              <option>Product Focus</option>
            </select>
          </label>
          <label className="text-sm">
            Duration
            <select
              value={duration}
              onChange={e => setDuration(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 p-3"
            >
              <option>15 min</option>
              <option>20 min</option>
              <option>30 min</option>
            </select>
          </label>
        </div>

        <div className="rounded-xl border border-mint/20 bg-mint/5 p-4 text-sm leading-6 text-slate-300">
          <b className="text-mint">AI disclosure</b>
          <br />
          You are about to interact with AI interviewers. Your voice, responses, and interview performance may be
          processed to generate your assessment. Human review remains available. EchoPanel&apos;s Moderator controls the
          speaking floor.
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="submit" className="rounded-full bg-mint px-6 py-3 font-semibold text-ink">
            I understand &amp; start live
          </button>
          <button
            type="button"
            onClick={() => persistAndGo("/demo")}
            className="rounded-full border border-white/20 px-6 py-3 font-semibold"
          >
            Use demo mode
          </button>
        </div>
      </form>
    </main>
  );
}
