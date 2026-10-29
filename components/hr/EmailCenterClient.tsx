"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Clock3,
  FileText,
  LayoutTemplate,
  Mail,
  PenLine,
  Search,
  Settings,
  SlidersHorizontal,
  TriangleAlert,
  SquareArrowOutUpRight
} from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { EmailDetailDialog } from "@/components/hr/EmailDetailDialog";
import { EmailStatusBadge, EmptyState, PageHeader, SectionHeading, StatCard } from "@/components/ui";
import type { EmailMessage } from "@/lib/domain";
import { buildApplicationRecords, emailStats, filterEmails } from "@/lib/demo-service";
import { formatDate, formatTime } from "@/lib/format";
import { inputClass, primaryButton, secondaryButton, selectClass } from "@/lib/ui";

export function EmailCenterClient() {
  const store = useDemoData();
  const records = buildApplicationRecords(store);
  const stats = emailStats(store.emails);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [template, setTemplate] = useState("All");
  const [candidate, setCandidate] = useState("All");
  const [selected, setSelected] = useState<EmailMessage | null>(null);

  const emails = useMemo(() => {
    const filtered = filterEmails(store.emails, { q, status, template });
    if (candidate === "All") return filtered;
    return filtered.filter(item => item.candidateId === candidate);
  }, [store.emails, q, status, template, candidate]);

  const candidates = Array.from(new Map(records.map(record => [record.candidate.id, record.candidate])).values());
  const filtersActive = Boolean(q || status !== "All" || template !== "All" || candidate !== "All");
  const clear = () => { setQ(""); setStatus("All"); setTemplate("All"); setCandidate("All"); };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Email & Communications"
        title="Email centre"
        description="Draft, preview, and track candidate communication. Every send in this workspace is a simulated demo record."
        actions={
          <>
            <Link href="/hr/email/templates" className={secondaryButton}><LayoutTemplate size={13} /> Templates</Link>
            <Link href="/hr/email/settings" className={secondaryButton}><Settings size={13} /> Settings</Link>
            <Link href="/hr/email/compose" className={primaryButton}><PenLine size={13} /> Compose</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <button onClick={() => setStatus("All")} className="text-left"><StatCard label="All activity" value={stats.total} detail="Seeded + session" icon={Mail} tone="slate" /></button>
        <button onClick={() => setStatus("Sent")} className="text-left"><StatCard label="Simulated sent" value={stats.sent} detail="No delivery made" icon={ArrowRight} tone="mint" /></button>
        <button onClick={() => setStatus("Pending")} className="text-left"><StatCard label="Pending" value={stats.pending} detail="Demo state" icon={Clock3} tone="amber" /></button>
        <button onClick={() => setStatus("Failed")} className="text-left"><StatCard label="Failed" value={stats.failed} detail="Seeded example" icon={TriangleAlert} tone="rose" /></button>
        <button onClick={() => setStatus("Draft")} className="text-left"><StatCard label="Drafts" value={stats.drafts} detail="Browser only" icon={FileText} tone="violet" /></button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-card/80">
        <div className="flex flex-col justify-between gap-3 border-b border-white/[0.06] px-4 py-4 sm:flex-row sm:items-center">
          <SectionHeading title="Communication log" description={`${emails.length} record${emails.length === 1 ? "" : "s"} match the current view.`} />
          <Link href="/hr/email/activity" className="inline-flex items-center gap-1.5 text-[10px] font-medium text-mint hover:text-white">Open full activity</Link>
        </div>

        <div className="grid gap-2 border-b border-white/[0.06] p-4 md:grid-cols-2 xl:grid-cols-[1fr_145px_170px_190px_auto]">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input value={q} onChange={event => setQ(event.target.value)} className={`${inputClass} h-9 py-0 pl-8 text-[11px]`} placeholder="Search recipient, subject, provider state…" />
          </div>
          <select value={status} onChange={event => setStatus(event.target.value)} className={`${selectClass} h-9 py-0 text-[10px]`} aria-label="Filter by status">
            {["All", "Sent", "Pending", "Failed", "Draft"].map(item => <option key={item}>{item}</option>)}
          </select>
          <select value={template} onChange={event => setTemplate(event.target.value)} className={`${selectClass} h-9 py-0 text-[10px]`} aria-label="Filter by template">
            <option value="All">All templates</option>
            {store.templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select value={candidate} onChange={event => setCandidate(event.target.value)} className={`${selectClass} h-9 py-0 text-[10px]`} aria-label="Filter by candidate">
            <option value="All">All candidates</option>
            {candidates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button onClick={clear} disabled={!filtersActive} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/[0.07] px-3 text-[10px] text-slate-500 hover:text-white disabled:opacity-35"><SlidersHorizontal size={11} /> Clear</button>
        </div>

        {!emails.length ? (
          <EmptyState title="No email activity matches" description="Try clearing filters or compose a new simulated message." icon={Mail} action={<button onClick={clear} className={secondaryButton}>Clear filters</button>} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-white/[0.05] text-[8px] uppercase tracking-[0.1em] text-slate-600">
                    <th className="px-4 py-2.5 font-medium">Recipient</th>
                    <th className="px-4 py-2.5 font-medium">Subject</th>
                    <th className="px-4 py-2.5 font-medium">Template</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Activity</th>
                    <th className="px-4 py-2.5 text-right font-medium">View</th>
                  </tr>
                </thead>
                <tbody>
                  {emails.map(email => {
                    const emailTemplate = store.templates.find(item => item.id === email.templateId);
                    return (
                      <tr key={email.id} className="border-b border-white/[0.04] text-[10px] transition last:border-0 hover:bg-white/[0.018]">
                        <td className="px-4 py-3"><p className="font-medium text-slate-200">{email.recipientName}</p><p className="mt-0.5 text-[8px] text-slate-600">{email.recipientEmail}</p></td>
                        <td className="max-w-[260px] px-4 py-3"><p className="truncate text-slate-300">{email.subject}</p><p className="mt-0.5 truncate text-[8px] text-slate-600">{email.preview}</p></td>
                        <td className="px-4 py-3 text-slate-500">{emailTemplate?.name ?? "Ad hoc"}</td>
                        <td className="px-4 py-3"><EmailStatusBadge status={email.status} /></td>
                        <td className="px-4 py-3 text-slate-500">{formatDate(email.createdAt)}<span className="ml-1 text-slate-700">·</span> {formatTime(email.createdAt)}</td>
                        <td className="px-4 py-3 text-right"><button onClick={() => setSelected(email)} className="rounded-lg border border-white/[0.07] p-1.5 text-slate-500 hover:text-white" aria-label={`View ${email.subject}`}><SquareArrowOutUpRight size={11} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-white/[0.05] md:hidden">
              {emails.map(email => (
                <button key={email.id} onClick={() => setSelected(email)} className="block w-full px-4 py-3.5 text-left hover:bg-white/[0.02]">
                  <div className="flex items-start justify-between gap-2"><p className="text-[10px] font-semibold text-slate-200">{email.recipientName}</p><EmailStatusBadge status={email.status} /></div>
                  <p className="mt-1.5 text-[10px] text-slate-400">{email.subject}</p>
                  <p className="mt-1 text-[8px] text-slate-600">{formatDate(email.createdAt)} · {formatTime(email.createdAt)} · {email.status === "Sent" ? "simulated send" : email.status.toLowerCase()}</p>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="border-t border-white/[0.05] px-4 py-3 text-[8px] leading-4 text-slate-600">
          “Sent” means a demo activity record was created, not that an email was delivered. Seeded failed and pending records are fictional workflow examples.
        </div>
      </section>

      <EmailDetailDialog email={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
