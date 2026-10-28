"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Clock3,
  FileText,
  LayoutTemplate,
  Mail,
  PenLine,
  Search,
  SlidersHorizontal
} from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { EmailDetailDialog } from "@/components/hr/EmailDetailDialog";
import { Badge, DemoBanner, EmailStatusBadge, EmptyState, PageHeader } from "@/components/ui";
import type { EmailMessage } from "@/lib/domain";
import { DEMO_TODAY } from "@/lib/demo-data";
import { buildApplicationRecords, emailStats, filterEmails } from "@/lib/demo-service";
import { formatDate, formatTime } from "@/lib/format";
import { inputClass, primaryButton, secondaryButton, selectClass } from "@/lib/ui";

export function EmailActivityClient() {
  const store = useDemoData();
  const stats = emailStats(store.emails);
  const records = buildApplicationRecords(store);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [template, setTemplate] = useState("All");
  const [candidate, setCandidate] = useState("All");
  const [range, setRange] = useState("All");
  const [selected, setSelected] = useState<EmailMessage | null>(null);

  const emails = useMemo(() => {
    let filtered = filterEmails(store.emails, { q, status, template });
    if (candidate !== "All") filtered = filtered.filter(item => item.candidateId === candidate);
    if (range !== "All") {
      const days = Number(range);
      const cutoff = new Date(`${DEMO_TODAY}T23:59:59Z`).getTime() - days * 86_400_000;
      filtered = filtered.filter(item => new Date(item.createdAt).getTime() >= cutoff);
    }
    return filtered;
  }, [store.emails, q, status, template, candidate, range]);

  const candidates = Array.from(new Map(records.map(record => [record.candidate.id, record.candidate])).values());
  const groups = emails.reduce<Record<string, EmailMessage[]>>((acc, email) => {
    const day = email.createdAt.slice(0, 10);
    acc[day] = [...(acc[day] ?? []), email];
    return acc;
  }, {});
  const filtersActive = Boolean(q || status !== "All" || template !== "All" || candidate !== "All" || range !== "All");
  const clear = () => { setQ(""); setStatus("All"); setTemplate("All"); setCandidate("All"); setRange("All"); };

  return (
    <div className="space-y-5">
      <Link href="/hr/email" className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 transition hover:text-white"><ArrowLeft size={12} /> Email centre</Link>
      <PageHeader
        eyebrow="Email & Communications"
        title="Email activity"
        description="A complete, session-local history of seeded and simulated communication. Nothing on this page represents real delivery."
        actions={
          <>
            <Link href="/hr/email/templates" className={secondaryButton}><LayoutTemplate size={13} /> Templates</Link>
            <Link href="/hr/email/compose" className={primaryButton}><PenLine size={13} /> Compose</Link>
          </>
        }
      />

      <DemoBanner compact>Seeded sent, pending, and failed states demonstrate future provider workflows. No messages were delivered, and no external mail service was contacted.</DemoBanner>

      <div className="flex flex-wrap gap-2 text-[9px]">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-slate-500"><Mail size={10} /> {stats.total} total</span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-mint/10 bg-mint/[0.03] px-2.5 py-1.5 text-mint/80">{stats.sent} simulated sent</span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/10 bg-amber-300/[0.03] px-2.5 py-1.5 text-amber-200/70">{stats.pending} pending seeds</span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/10 bg-rose-400/[0.03] px-2.5 py-1.5 text-rose-200/70">{stats.failed} failed seeds</span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-violet/10 bg-violet/[0.03] px-2.5 py-1.5 text-violet-200/70">{stats.drafts} drafts</span>
      </div>

      <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80">
        <div className="grid gap-2 border-b border-white/[0.06] p-4 md:grid-cols-2 xl:grid-cols-[1fr_135px_155px_175px_120px_auto]">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input value={q} onChange={event => setQ(event.target.value)} className={`${inputClass} h-9 py-0 pl-8 text-[11px]`} placeholder="Search recipient or subject…" />
          </div>
          <select value={status} onChange={event => setStatus(event.target.value)} className={`${selectClass} h-9 py-0 text-[10px]`} aria-label="Filter activity by status">
            {["All", "Sent", "Pending", "Failed", "Draft"].map(item => <option key={item}>{item}</option>)}
          </select>
          <select value={template} onChange={event => setTemplate(event.target.value)} className={`${selectClass} h-9 py-0 text-[10px]`} aria-label="Filter activity by template">
            <option value="All">All templates</option>
            {store.templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select value={candidate} onChange={event => setCandidate(event.target.value)} className={`${selectClass} h-9 py-0 text-[10px]`} aria-label="Filter activity by candidate">
            <option value="All">All candidates</option>
            {candidates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select value={range} onChange={event => setRange(event.target.value)} className={`${selectClass} h-9 py-0 text-[10px]`} aria-label="Filter activity by date">
            <option value="All">All dates</option><option value="7">7 days</option><option value="30">30 days</option>
          </select>
          <button onClick={clear} disabled={!filtersActive} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/[0.07] px-3 text-[10px] text-slate-500 hover:text-white disabled:opacity-35"><SlidersHorizontal size={11} /> Clear</button>
        </div>

        {!emails.length ? (
          <EmptyState title="No activity matches" description="Clear the filters to see all seeded and session-local email records." icon={Mail} action={<button onClick={clear} className={secondaryButton}>Clear filters</button>} />
        ) : (
          <div className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">Activity timeline</p><span className="text-[9px] text-slate-600">{emails.length} records</span></div>
            <div className="space-y-5">
              {Object.entries(groups).map(([day, dayEmails]) => (
                <div key={day}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-slate-300">{day === DEMO_TODAY ? "Today" : formatDate(day)}</span>
                    <span className="h-px flex-1 bg-white/[0.05]" />
                    <span className="text-[8px] text-slate-600">{dayEmails.length} event{dayEmails.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-white/[0.06]">
                    {dayEmails.map((email, index) => {
                      const emailTemplate = store.templates.find(item => item.id === email.templateId);
                      return (
                        <button key={email.id} onClick={() => setSelected(email)} className={`flex w-full flex-col gap-2 px-3.5 py-3 text-left transition hover:bg-white/[0.025] sm:flex-row sm:items-center sm:gap-3 ${index ? "border-t border-white/[0.04]" : ""}`}>
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-black/15 text-slate-500">{email.status === "Draft" ? <FileText size={12} /> : <Mail size={12} />}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold text-slate-200">{email.recipientName}</span><EmailStatusBadge status={email.status} /></span>
                            <span className="mt-1 block truncate text-[9px] text-slate-500">{email.subject}</span>
                          </span>
                          <span className="hidden w-[150px] shrink-0 truncate text-[9px] text-slate-600 md:block">{emailTemplate?.name ?? "Ad hoc"}</span>
                          <span className="flex shrink-0 items-center gap-2 text-[8px] text-slate-600"><Clock3 size={9} /> {formatTime(email.createdAt)} <ChevronRight size={11} /></span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.05] px-4 py-3 text-[8px] text-slate-600"><Badge tone="amber">Demo only</Badge> Activity is lost when this browser session ends. Phase 2 will replace this in-memory service with persisted records.</div>
      </section>

      <EmailDetailDialog email={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
