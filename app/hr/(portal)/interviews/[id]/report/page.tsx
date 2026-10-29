"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileText,
  Printer,
  Sparkles,
  TriangleAlert
} from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { useIsDatabaseMode } from "@/components/AppModeProvider";
import { DatabaseInterviewReport } from "@/components/hr/DatabaseInterviewReport";
import { Badge, DemoBanner, EmptyState, ProgressBar } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import { secondaryButton } from "@/lib/ui";

const labels = {
  technical: "Technical depth",
  product: "Product judgement",
  communication: "Communication",
  problemSolving: "Problem solving",
  adaptability: "Adaptability"
} as const;

export default function InterviewReportPage() {
  const params = useParams<{ id: string }>();
  return useIsDatabaseMode() ? <DatabaseInterviewReport interviewId={params.id} /> : <DemoInterviewReportPage />;
}

function DemoInterviewReportPage() {
  const params = useParams<{ id: string }>();
  const store = useDemoData();
  const interview = store.interviews.find(item => item.id === params.id);
  const assessment = interview ? store.assessments.find(item => item.id === interview.assessmentId) : undefined;
  const candidate = store.candidates.find(item => item.id === interview?.candidateId);
  const job = store.jobs.find(item => item.id === interview?.jobId);

  if (!interview || !assessment) {
    return (
      <EmptyState
        title="Report unavailable"
        description="This demo interview does not have an assessment report attached."
        icon={FileText}
        action={<Link href="/hr/schedule" className={secondaryButton}><ArrowLeft size={13} /> Back to schedule</Link>}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/hr/interviews/${interview.id}`} className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 hover:text-white"><ArrowLeft size={12} /> Interview details</Link>
        <button onClick={() => window.print()} className={secondaryButton}><Printer size={13} /> Print demo report</button>
      </div>

      <DemoBanner>
        This is a seeded demo assessment, not an actual AI-generated evaluation. The report is included to demonstrate the future report UI and evidence model.
      </DemoBanner>

      <section className="rounded-3xl border border-white/[0.08] bg-card/90 p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-6 border-b border-white/[0.07] pb-6 md:flex-row md:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="violet">Demo evaluation</Badge>
              <Badge tone="mint">{assessment.recommendation}</Badge>
              <span className="font-mono text-[9px] text-slate-600">{assessment.id}</span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-white">Interview intelligence report</h1>
            <p className="mt-2 text-sm text-slate-400">{candidate?.name} · {job?.title}</p>
            <p className="mt-1 text-[10px] text-slate-600">Generated {formatDate(assessment.generatedAt)} · {interview.round}</p>
          </div>
          <div className="text-left md:text-right">
            <p className="text-5xl font-semibold tracking-[-0.055em] text-white">{assessment.overallScore.toFixed(1)}</p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.14em] text-amber-200/60">Demo score / 10</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Panel summary</p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{assessment.summary}</p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/[0.06] bg-black/10 p-4"><p className="text-[9px] uppercase tracking-[0.1em] text-slate-600">Candidate</p><p className="mt-1.5 text-xs font-medium text-slate-200">{candidate?.name}</p></div>
          <div className="rounded-xl border border-white/[0.06] bg-black/10 p-4"><p className="text-[9px] uppercase tracking-[0.1em] text-slate-600">Interview</p><p className="mt-1.5 text-xs font-medium text-slate-200">{formatDate(interview.scheduledAt)} · {formatTime(interview.scheduledAt)}</p></div>
          <div className="rounded-xl border border-white/[0.06] bg-black/10 p-4"><p className="text-[9px] uppercase tracking-[0.1em] text-slate-600">Evidence model</p><p className="mt-1.5 text-xs font-medium text-slate-200">5 competencies · demo turns</p></div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.07] bg-card/80 p-6">
        <div className="flex items-center gap-2"><Sparkles size={14} className="text-violet-200" /><h2 className="text-sm font-semibold text-white">Competency evidence</h2></div>
        <div className="mt-5 space-y-5">
          {(Object.keys(labels) as Array<keyof typeof labels>).map(key => {
            const dimension = assessment.dimensions[key];
            return (
              <div key={key} className="border-b border-white/[0.05] pb-5 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-xs font-semibold text-slate-200">{labels[key]}</p><p className="mt-0.5 text-[8px] uppercase tracking-[0.1em] text-slate-700">Confidence {(dimension.confidence * 100).toFixed(0)}% · {dimension.sourceTurns.join(", ")}</p></div>
                  <p className="text-sm font-semibold text-white">{dimension.score.toFixed(1)}</p>
                </div>
                <div className="mt-2.5"><ProgressBar value={dimension.score * 10} tone={key === "product" ? "amber" : "mint"} /></div>
                <div className="mt-3 space-y-1.5">{dimension.evidence.map(item => <p key={item} className="text-[11px] leading-5 text-slate-400">“{item}”</p>)}</div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-mint/10 bg-mint/[0.025] p-5">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-mint/80"><CheckCircle2 size={13} /> Strengths</div>
          <div className="mt-3 space-y-2">{assessment.strengths.map(item => <p key={item} className="text-[11px] text-slate-400">· {item}</p>)}</div>
        </section>
        <section className="rounded-2xl border border-amber-300/10 bg-amber-300/[0.025] p-5">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200/70"><TriangleAlert size={13} /> Risks & open questions</div>
          <div className="mt-3 space-y-2">{[...assessment.risks, ...assessment.unresolvedConcerns].map(item => <p key={item} className="text-[11px] text-slate-400">· {item}</p>)}</div>
        </section>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Link href={`/hr/applicants/${interview.applicationId}`} className="inline-flex items-center gap-2 rounded-xl bg-mint px-4 py-2.5 text-xs font-semibold text-ink">Open candidate profile</Link>
        <Link href={`/hr/interviews/${interview.id}`} className={secondaryButton}><CalendarDays size={13} /> Interview details</Link>
      </div>
    </div>
  );
}
