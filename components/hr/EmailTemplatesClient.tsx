"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Braces,
  FilePenLine,
  Mail,
  PenLine,
  Search,
  Settings,
  Sparkles
} from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { Badge, DemoBanner, EmptyState, PageHeader } from "@/components/ui";
import type { EmailTemplate } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { inputClass, primaryButton, secondaryButton } from "@/lib/ui";
import { cn } from "@/lib/cn";

const categories = ["All", "Application", "Shortlist", "Interview", "Outcome"] as const;
const categoryTone: Record<EmailTemplate["category"], "mint" | "sky" | "violet" | "amber"> = {
  Application: "sky",
  Shortlist: "mint",
  Interview: "violet",
  Outcome: "amber"
};

export function EmailTemplatesClient() {
  const store = useDemoData();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("All");

  const templates = useMemo(() => {
    const term = q.trim().toLowerCase();
    return store.templates.filter(template => {
      if (category !== "All" && template.category !== category) return false;
      if (term && !`${template.name} ${template.description} ${template.subject} ${template.category}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [store.templates, q, category]);

  return (
    <div className="space-y-5">
      <Link href="/hr/email" className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 transition hover:text-white"><ArrowLeft size={12} /> Email centre</Link>
      <PageHeader
        eyebrow="Email & Communications"
        title="Email templates"
        description="Reusable candidate messages with live placeholders. Edits are kept in this browser session for demonstration."
        actions={
          <>
            <Link href="/hr/email/settings" className={secondaryButton}><Settings size={13} /> Settings</Link>
            <Link href="/hr/email/compose" className={primaryButton}><PenLine size={13} /> Compose</Link>
          </>
        }
      />

      <DemoBanner compact>Templates are seeded examples, not approved legal or recruiting copy. Review wording, links, and placeholders before using them in a real hiring workflow.</DemoBanner>

      <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-card/60 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1">
          {categories.map(item => (
            <button key={item} onClick={() => setCategory(item)} className={cn("rounded-lg px-2.5 py-1.5 text-[9px] font-medium transition", category === item ? "bg-white/[0.08] text-white" : "text-slate-500 hover:bg-white/[0.03] hover:text-slate-300")}>
              {item}
              {item !== "All" && <span className="ml-1.5 text-[8px] text-slate-600">{store.templates.filter(template => template.category === item).length}</span>}
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-[270px]">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
          <input value={q} onChange={event => setQ(event.target.value)} className={`${inputClass} h-9 py-0 pl-8 text-[11px]`} placeholder="Search templates…" />
        </div>
      </div>

      <div className="flex items-center justify-between"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">{templates.length} template{templates.length === 1 ? "" : "s"}</p><span className="inline-flex items-center gap-1.5 text-[9px] text-slate-600"><Braces size={10} /> Placeholders render at compose time</span></div>

      {!templates.length ? (
        <div className="rounded-2xl border border-white/[0.07] bg-card/60"><EmptyState title="No templates match" description="Try another category or search term." icon={Mail} action={<button onClick={() => { setQ(""); setCategory("All"); }} className={secondaryButton}>Clear filters</button>} /></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map(template => (
            <Link key={template.id} href={`/hr/email/templates/${template.id}`} className="group flex flex-col rounded-2xl border border-white/[0.07] bg-card/80 p-5 transition hover:border-white/[0.13] hover:bg-card">
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-slate-500 transition group-hover:text-violet-200"><FilePenLine size={15} /></span>
                <Badge tone={categoryTone[template.category]}>{template.category}</Badge>
              </div>
              <h2 className="mt-4 text-sm font-semibold text-white">{template.name}</h2>
              <p className="mt-1.5 min-h-[32px] text-[10px] leading-5 text-slate-500">{template.description}</p>
              <div className="mt-4 rounded-xl border border-white/[0.05] bg-black/10 p-3">
                <p className="text-[8px] uppercase tracking-[0.1em] text-slate-700">Subject</p>
                <p className="mt-1 truncate text-[10px] text-slate-400">{template.subject}</p>
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-[8px] text-slate-600">
                <span className="inline-flex items-center gap-1.5"><Sparkles size={9} /> {template.body.match(/\{\{\w+\}\}/g)?.length ?? 0} placeholders · updated {formatDate(template.updatedAt)}</span>
                <ArrowUpRight size={11} className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" />
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-3 text-[9px] leading-5 text-slate-600">
        Available placeholders: <span className="font-mono text-slate-500">{"{{candidate_name}}, {{candidate_first_name}}, {{job_title}}, {{company_name}}, {{interview_date}}, {{interview_time}}, {{sender_name}}"}</span>. Unresolved values remain visible so incomplete templates are easy to spot.
      </div>
    </div>
  );
}
