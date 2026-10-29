"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  FileText,
  LayoutTemplate,
  Mail,
  PenLine,
  Search,
  Settings,
  SlidersHorizontal,
  SquareArrowOutUpRight,
  TriangleAlert
} from "lucide-react";
import { DatabaseEmailDetail, type DatabaseEmailRecord } from "@/components/hr/DatabaseEmailDetail";
import { Badge, EmptyState, PageHeader, SectionHeading, StatCard } from "@/components/ui";
import {
  EMAIL_LIFECYCLE_STATUSES,
  emailStatusLabel,
  emailStatusTone,
  isQueuedEmail,
  needsEmailAttention,
  normalizeEmailStatus
} from "@/lib/email-status";
import { formatDate, formatTime } from "@/lib/format";
import { inputClass, primaryButton, secondaryButton, selectClass } from "@/lib/ui";

interface EmailTemplateOption {
  id: string;
  name: string;
  category: string;
}

interface Settings {
  providerConfigured: boolean;
  providerMode: "disabled" | "test" | "live";
  fromAddress: string | null;
  webhookConfigured: boolean;
  configurationIssue: string | null;
}

interface MessagesResponse {
  messages?: DatabaseEmailRecord[];
  error?: string;
}

export function DatabaseEmailCenterClient() {
  return <DatabaseEmailLog activity={false} />;
}

export function DatabaseEmailActivityClient() {
  return <DatabaseEmailLog activity />;
}

function providerNotice(settings: Settings | null) {
  if (!settings?.providerConfigured) {
    return "No mail provider is configured. Messages can be drafted or queued durably, but the email worker cannot deliver them. Existing Sent records are historical and provider confirmation is not implied.";
  }
  if (settings.providerMode === "test") {
    return "Resend is configured in test mode. Outbound messages are redirected to the designated test inbox, and webhook delivery states apply only to those test deliveries.";
  }
  return "Resend is configured for live delivery. Queued messages are processed by the email worker. Provider accepted means the API accepted the message; Delivered requires a verified webhook.";
}

function DatabaseEmailLog({ activity }: { activity: boolean }) {
  const [messages, setMessages] = useState<DatabaseEmailRecord[]>([]);
  const [templates, setTemplates] = useState<EmailTemplateOption[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [template, setTemplate] = useState("All");
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<DatabaseEmailRecord | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetch("/api/hr/email/messages", { cache: "no-store" }).then(async response => {
        const body = await response.json() as MessagesResponse;
        if (!response.ok || !body.messages) throw new Error(body.error || "Email activity could not be loaded.");
        return body.messages;
      }),
      fetch("/api/hr/email/templates", { cache: "no-store" }).then(async response => {
        const body = await response.json() as { templates?: EmailTemplateOption[]; error?: string };
        if (!response.ok || !body.templates) throw new Error(body.error || "Templates could not be loaded.");
        return body.templates;
      }),
      fetch("/api/hr/email/settings", { cache: "no-store" }).then(async response => {
        const body = await response.json() as { settings?: Settings; error?: string };
        if (!response.ok || !body.settings) throw new Error(body.error || "Email settings could not be loaded.");
        return body.settings;
      })
    ])
      .then(([loadedMessages, loadedTemplates, loadedSettings]) => {
        if (!active) return;
        setMessages(loadedMessages);
        setTemplates(loadedTemplates);
        setSettings(loadedSettings);
        setError("");
      })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "Email activity could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const stats = useMemo(() => ({
    total: messages.length,
    drafts: messages.filter(item => normalizeEmailStatus(item.status) === "Draft").length,
    queued: messages.filter(item => isQueuedEmail(item.status)).length,
    accepted: messages.filter(item => normalizeEmailStatus(item.status) === "Sent").length,
    delivered: messages.filter(item => normalizeEmailStatus(item.status) === "Delivered").length,
    attention: messages.filter(item => needsEmailAttention(item.status)).length
  }), [messages]);

  const emails = useMemo(() => {
    const term = q.trim().toLowerCase();
    return messages.filter(item => {
      if (status !== "All" && normalizeEmailStatus(item.status) !== status) return false;
      if (template !== "All" && item.templateId !== template) return false;
      if (term && !`${item.recipientName} ${item.recipientEmail} ${item.subject} ${item.preview}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [messages, q, status, template]);

  const candidates = useMemo(() => Array.from(new Map(messages.filter(item => item.candidateId).map(item => [item.candidateId!, { id: item.candidateId!, name: item.recipientName }])).values()), [messages]);
  const clear = () => { setQ(""); setStatus("All"); setTemplate("All"); };
  const filtersActive = Boolean(q || status !== "All" || template !== "All");
  const groups = useMemo(() => emails.reduce<Record<string, DatabaseEmailRecord[]>>((acc, email) => {
    const day = email.createdAt.slice(0, 10);
    acc[day] = [...(acc[day] ?? []), email];
    return acc;
  }, {}), [emails]);

  if (loading) {
    return <div className="space-y-4"><div className="h-16 animate-pulse rounded-2xl bg-white/[0.03]" /><div className="h-[420px] animate-pulse rounded-2xl bg-white/[0.025]" /></div>;
  }

  if (error) {
    return <EmptyState title="Email activity unavailable" description={error} icon={Mail} action={<button onClick={() => setReload(value => value + 1)} className={secondaryButton}>Retry</button>} />;
  }

  return (
    <div className="space-y-5">
      {activity && <Link href="/hr/email" className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 transition hover:text-white"><ArrowLeft size={12} /> Email centre</Link>}
      <PageHeader
        eyebrow="Email & Communications"
        title={activity ? "Email activity" : "Email centre"}
        description={activity
          ? "Provider-aware drafts, queued messages, and confirmed delivery activity. Seeded history is labelled separately."
          : "Persisted candidate communication, templates, provider status, and delivery outcomes."}
        actions={
          <>
            <Link href="/hr/email/templates" className={secondaryButton}><LayoutTemplate size={13} /> Templates</Link>
            <Link href="/hr/email/settings" className={secondaryButton}><Settings size={13} /> Settings</Link>
            <Link href="/hr/email/compose" className={primaryButton}><PenLine size={13} /> Compose</Link>
          </>
        }
      />

      <div className={`rounded-xl border px-4 py-2.5 text-[10px] leading-5 ${settings?.providerConfigured ? "border-mint/15 bg-mint/[0.035] text-mint/80" : "border-amber-300/15 bg-amber-300/[0.04] text-amber-200/75"}`}>
        {providerNotice(settings)}
        {!settings?.webhookConfigured && settings?.providerConfigured && <span className="block text-amber-200/75">Delivery webhooks are not configured, so Delivered, Bounced, and Complained states cannot be confirmed yet.</span>}
        {settings?.configurationIssue && <span className="block">{settings.configurationIssue}</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <button onClick={() => setStatus("All")} className="text-left"><StatCard label="All activity" value={stats.total} detail="Persisted records" icon={Mail} tone="slate" /></button>
        <button onClick={() => setStatus("Draft")} className="text-left"><StatCard label="Drafts" value={stats.drafts} detail="Not queued" icon={FileText} tone="violet" /></button>
        <button onClick={() => setStatus("Queued")} className="text-left"><StatCard label="Queued" value={stats.queued} detail="Outbox" icon={Clock3} tone="amber" /></button>
        <button onClick={() => setStatus("Sent")} className="text-left"><StatCard label="Accepted" value={stats.accepted} detail="Provider API" icon={ArrowRight} tone="sky" /></button>
        <button onClick={() => setStatus("Delivered")} className="text-left"><StatCard label="Delivered" value={stats.delivered} detail="Webhook confirmed" icon={Mail} tone="mint" /></button>
        <button onClick={() => setStatus("Failed")} className="text-left"><StatCard label="Attention" value={stats.attention} detail="Failed or bounced" icon={TriangleAlert} tone="rose" /></button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-card/80">
        <div className="flex flex-col justify-between gap-3 border-b border-white/[0.06] px-4 py-4 sm:flex-row sm:items-center">
          <SectionHeading title="Communication log" description={`${emails.length} record${emails.length === 1 ? "" : "s"} match the current view.`} />
          {!activity && <Link href="/hr/email/activity" className="inline-flex items-center gap-1.5 text-[10px] font-medium text-mint hover:text-white">Open full activity</Link>}
        </div>

        <div className="grid gap-2 border-b border-white/[0.06] p-4 md:grid-cols-2 xl:grid-cols-[1fr_170px_190px_auto]">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input value={q} onChange={event => setQ(event.target.value)} className={`${inputClass} h-9 py-0 pl-8 text-[11px]`} placeholder="Search recipient or subject..." />
          </div>
          <select value={status} onChange={event => setStatus(event.target.value)} className={`${selectClass} h-9 py-0 text-[10px]`} aria-label="Filter by status">
            <option value="All">All statuses</option>
            {EMAIL_LIFECYCLE_STATUSES.map(item => <option key={item} value={item}>{emailStatusLabel(item)}</option>)}
          </select>
          <select value={template} onChange={event => setTemplate(event.target.value)} className={`${selectClass} h-9 py-0 text-[10px]`} aria-label="Filter by template">
            <option value="All">All templates</option>
            {templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button onClick={clear} disabled={!filtersActive} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/[0.07] px-3 text-[10px] text-slate-500 hover:text-white disabled:opacity-35"><SlidersHorizontal size={11} /> Clear</button>
        </div>

        {!emails.length ? (
          <EmptyState title={messages.length ? "No messages match those filters" : "No email activity yet"} description={messages.length ? "Clear the filters to see persisted email records." : "Compose a draft or queue a message. Delivery requires provider configuration and the email worker."} icon={Mail} action={messages.length ? <button onClick={clear} className={secondaryButton}>Clear filters</button> : <Link href="/hr/email/compose" className={primaryButton}><PenLine size={13} /> Compose</Link>} />
        ) : activity ? (
          <div className="divide-y divide-white/[0.055]">
            {Object.entries(groups).map(([day, dayEmails]) => (
              <div key={day}>
                <div className="bg-white/[0.015] px-4 py-2 text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-600">{formatDate(day)}</div>
                {dayEmails.map(email => <EmailRow key={email.id} email={email} onView={() => setSelected(email)} />)}
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.055]">{emails.slice(0, 12).map(email => <EmailRow key={email.id} email={email} onView={() => setSelected(email)} />)}</div>
        )}
      </section>

      <div className="flex flex-wrap gap-2 text-[9px] text-slate-600">
        <span>{candidates.length} recipient{candidates.length === 1 ? "" : "s"} in persisted activity</span>
        <span>-</span>
        <span>{templates.length} template{templates.length === 1 ? "" : "s"}</span>
      </div>

      <DatabaseEmailDetail
        email={selected}
        onClose={() => setSelected(null)}
        onChanged={() => setReload(value => value + 1)}
      />
    </div>
  );
}

function EmailRow({ email, onView }: { email: DatabaseEmailRecord; onView: () => void }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 transition hover:bg-white/[0.018] sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[10px] font-medium text-slate-200">{email.recipientName}</p>
          <Badge tone={emailStatusTone(email.status)}>{emailStatusLabel(email.status, { isDemo: email.isDemo })}</Badge>
          {email.isDemo && <Badge tone="amber">Seeded</Badge>}
          {email.providerMode === "test" && <Badge tone="sky">Test</Badge>}
        </div>
        <p className="mt-0.5 truncate text-[9px] text-slate-500">{email.subject}</p>
      </div>
      <div className="text-[9px] text-slate-600 sm:w-40">{email.templateName ?? "Ad hoc"}<p className="mt-0.5">{formatDate(email.createdAt)} - {formatTime(email.createdAt)}</p></div>
      <button onClick={onView} className="self-start rounded-lg border border-white/[0.07] p-1.5 text-slate-500 hover:text-white sm:self-auto" aria-label={`View ${email.subject}`}><SquareArrowOutUpRight size={11} /></button>
    </div>
  );
}
