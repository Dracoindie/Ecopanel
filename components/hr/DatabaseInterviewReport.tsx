"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  FileText,
  Printer,
  TriangleAlert
} from "lucide-react";
import type { CSSProperties } from "react";
import { interviewerColor } from "@/components/PanelTrio";
import { CountUp } from "@/components/hr/CountUp";
import { Badge, EmptyState, ProgressBar } from "@/components/ui";
import { assessmentStatusMessage } from "@/lib/assessment-status";
import type { Candidate, Interview, Job } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { secondaryButton } from "@/lib/ui";

interface ApiAssessment {
  id: string;
  overallScore: number;
  recommendation: string;
  summary: string;
  dimensions: Record<string, { score: number; evidence: string[]; confidence: number }>;
  strengths: string[];
  risks: string[];
  unresolvedConcerns: string[];
  generatedAt: string;
  source: string;
  isDemo: boolean;
}

interface DetailResponse {
  interview: Interview;
  candidate: Candidate;
  job: Job;
  assessment: ApiAssessment | null;
  transcript?: { id: string } | null;
  assessmentJob?: { status: string; failureCode: string | null } | null;
  assessmentProvider?: { providerConfigured: boolean };
  error?: string;
}

const LABELS: Record<string, string> = {
  technical: "Technical depth",
  product: "Product judgement",
  communication: "Communication",
  problemSolving: "Problem solving",
  adaptability: "Adaptability"
};

// Evidence line colour: the interviewer whose focus the dimension belongs to; problem solving is shared, so neutral.
const DIMENSION_INTERVIEWER: Record<string, string> = {
  technical: "technical",
  product: "product",
  communication: "behavioural",
  adaptability: "behavioural"
};
const NEUTRAL_LINE = "rgb(148 163 184 / .45)";
const BAR_STEP_MS = 140;

export function DatabaseInterviewReport({ interviewId }: { interviewId: string }) {
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/hr/interviews/${encodeURIComponent(interviewId)}`, { cache: "no-store" })
      .then(async response => {
        const body = await response.json() as DetailResponse;
        if (!response.ok || !body.interview) throw new Error(body.error || "Report could not be loaded.");
        return body;
      })
      .then(body => { if (active) { setDetail(body); setError(""); } })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "Report could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [interviewId]);

  if (loading) {
    return <div className="mx-auto max-w-[1100px] space-y-4"><div className="h-10 w-56 animate-pulse rounded-lg bg-white/[0.04]" /><div className="h-[520px] animate-pulse rounded-2xl bg-white/[0.03]" /></div>;
  }

  if (error || !detail) {
    return <EmptyState title="Report unavailable" description={error || "This interview could not be found."} icon={FileText} action={<Link href="/hr/schedule" className={secondaryButton}><ArrowLeft size={13} /> Back to schedule</Link>} />;
  }

  const { interview, candidate, job, assessment } = detail;

  if (!assessment) {
    const status = assessmentStatusMessage({
      hasTranscript: Boolean(detail.transcript),
      job: detail.assessmentJob ?? null,
      provider: { providerConfigured: Boolean(detail.assessmentProvider?.providerConfigured) }
    });
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Link href={`/hr/interviews/${interview.id}`} className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 hover:text-white"><ArrowLeft size={12} /> Interview details</Link>
        <section className="rounded-3xl border border-white/[0.08] bg-card/90 p-7 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-amber-300/15 bg-amber-300/[0.05]"><TriangleAlert size={20} className="text-amber-200/80" /></div>
          <p className="mt-4"><Badge tone={status.tone}>Report not available</Badge></p>
          <h1 className="mt-3 text-xl font-semibold text-white">{status.title}</h1>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-6 text-slate-500">
            {candidate.name}, {job.title}. {status.detail} A report is never generated from scheduling data or fabricated for this page.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href={`/hr/interviews/${interview.id}`} className={secondaryButton}><ArrowLeft size={13} /> Interview details</Link>
            <Link href={`/setup?interviewId=${encodeURIComponent(interview.id)}`} className="inline-flex items-center gap-2 rounded-xl bg-mint px-4 py-2.5 text-sm font-semibold text-ink">Open live interview</Link>
          </div>
        </section>
      </div>
    );
  }

  const dimensionEntries = Object.entries(assessment.dimensions);

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/hr/interviews/${interview.id}`} className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 hover:text-white"><ArrowLeft size={12} /> Interview details</Link>
        <button onClick={() => window.print()} className={secondaryButton}><Printer size={13} /> Print report</button>
      </div>

      {assessment.isDemo && (
        <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.04] px-4 py-2.5 text-[10px] leading-5 text-amber-200/75">
          This assessment is marked as seeded demo data in PostgreSQL. It is not an actual live evaluation.
        </div>
      )}

      <section className="rounded-3xl border border-white/[0.08] bg-card/90 p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-6 border-b border-white/[0.07] pb-6 md:flex-row md:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={assessment.isDemo ? "amber" : "mint"}>{assessment.isDemo ? "Seeded demo" : "Persisted assessment"}</Badge>
              <Badge tone="violet">{assessment.recommendation}</Badge>
              <span className="font-mono text-[9px] text-slate-600">{assessment.id}</span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-white">Interview intelligence report</h1>
            <p className="mt-2 text-sm text-slate-400">{candidate.name} · {job.title}</p>
            <p className="mt-1 text-[10px] text-slate-600">Generated {formatDate(assessment.generatedAt)} · {interview.round} · Source {assessment.source}</p>
          </div>
          <div className="text-left md:text-right">
            <p className="text-5xl font-semibold tabular-nums tracking-[-0.055em] text-white"><CountUp value={assessment.overallScore} /></p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.14em] text-amber-200/60">Score / 10</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Panel summary</p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{assessment.summary}</p>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {dimensionEntries.map(([key, value], index) => (
            <div key={key} className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5">
              <p className="text-[9px] text-slate-500">{LABELS[key] ?? key}</p>
              <div className="mt-2 flex items-end justify-between gap-2">
                <span className="text-lg font-semibold text-white">{typeof value.score === "number" ? value.score.toFixed(1) : "–"}</span>
                <span className="text-[8px] text-slate-600">{Math.round(value.confidence * 100)}% conf.</span>
              </div>
              <div className="mt-2"><ProgressBar value={typeof value.score === "number" ? value.score * 10 : 0} tone={value.score >= 8 ? "mint" : value.score >= 6 ? "violet" : "amber"} fillDelayMs={index * BAR_STEP_MS} /></div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
          <h2 className="flex items-center gap-2 text-xs font-semibold text-mint"><CheckCircle2 size={13} /> Strengths</h2>
          <div className="mt-3 space-y-2">
            {assessment.strengths.map((item, index) => <p key={`${item}-${index}`} className="flex gap-2 text-[11px] leading-5 text-slate-400"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-mint/70" /> {item}</p>)}
            {!assessment.strengths.length && <p className="text-[10px] text-slate-600">No strengths recorded.</p>}
          </div>
        </section>
        <section className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
          <h2 className="flex items-center gap-2 text-xs font-semibold text-rose-200"><TriangleAlert size={13} /> Risks</h2>
          <div className="mt-3 space-y-2">
            {assessment.risks.map((item, index) => <p key={`${item}-${index}`} className="flex gap-2 text-[11px] leading-5 text-slate-400"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-rose-300/70" /> {item}</p>)}
            {!assessment.risks.length && <p className="text-[10px] text-slate-600">No risks recorded.</p>}
          </div>
        </section>
        <section className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
          <h2 className="flex items-center gap-2 text-xs font-semibold text-amber-200"><CalendarDays size={13} /> Unresolved concerns</h2>
          <div className="mt-3 space-y-2">
            {assessment.unresolvedConcerns.map((item, index) => <p key={`${item}-${index}`} className="flex gap-2 text-[11px] leading-5 text-slate-400"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-300/70" /> {item}</p>)}
            {!assessment.unresolvedConcerns.length && <p className="text-[10px] text-slate-600">No unresolved concerns recorded.</p>}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
        <h2 className="text-sm font-semibold text-white">Dimension evidence</h2>
        <div className="mt-4 space-y-4">
          {dimensionEntries.map(([key, value], dimensionIndex) => (
            <div key={key} className="rounded-xl border border-white/[0.06] bg-black/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[11px] font-semibold text-slate-200">{LABELS[key] ?? key}</h3>
                <span className="text-[9px] text-slate-500">{typeof value.score === "number" ? `${value.score.toFixed(1)} / 10` : "Insufficient evidence"}</span>
              </div>
              {value.evidence.length ? value.evidence.map((item, index) => (
                <p
                  key={`${item}-${index}`}
                  className="slide-in mt-2 border-l-2 pl-2.5 text-[10px] leading-5 text-slate-500"
                  style={{ borderLeftColor: interviewerColor(DIMENSION_INTERVIEWER[key] ?? "") ?? NEUTRAL_LINE, "--d": `${dimensionIndex * 120 + index * 80}ms` } as CSSProperties}
                >“{item}”</p>
              )) : <p className="mt-2 text-[10px] text-slate-600">No evidence was persisted for this dimension.</p>}
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-3 text-[9px] leading-5 text-slate-600">
        This report reflects only the assessment record saved against interview {interview.id}. It is not proof of a live call and no email or calendar action is implied.
      </div>
    </div>
  );
}
