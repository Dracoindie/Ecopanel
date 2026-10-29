"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Loader2,
  Mail,
  Paperclip,
  Search,
  Send,
  Sparkles,
  Users,
  X
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { Avatar, Badge, ConfirmDialog, EmptyState, PageHeader } from "@/components/ui";
import { TEMPLATE_PLACEHOLDERS } from "@/lib/domain";
import { inputClass, labelClass, primaryButton, secondaryButton, selectClass } from "@/lib/ui";
import { cn } from "@/lib/cn";

interface Option {
  applicationId: string;
  stage: string;
  candidate: { id: string; name: string; email: string };
  job: { id: string; title: string };
}

interface Template {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
}

interface Settings {
  senderName: string;
  signature: string;
  providerConfigured: boolean;
  providerMode: "disabled" | "test" | "live";
  configurationIssue: string | null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function render(content: string, option: Option | undefined, settings: Settings | null) {
  if (!option) return content;
  const first = option.candidate.name.split(" ")[0] ?? option.candidate.name;
  const values: Record<string, string> = {
    candidate_name: option.candidate.name,
    candidate_first_name: first,
    job_title: option.job.title,
    company_name: "[company]",
    interview_date: "[not scheduled]",
    interview_time: "[not scheduled]",
    sender_name: settings?.senderName ?? "[sender]"
  };
  return Object.entries(values).reduce((result, [key, value]) => result.replace(new RegExp(`\\{\\{${escapeRegExp(key)}\\}\\}`, "g"), value), content);
}

export function DatabaseComposeClient() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const [options, setOptions] = useState<Option[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [templateId, setTemplateId] = useState(params.get("template") ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/hr/interviews/options", { cache: "no-store" }).then(async response => {
        const data = await response.json() as { applications?: Option[]; error?: string };
        if (!response.ok || !data.applications) throw new Error(data.error || "Candidates could not be loaded.");
        return data.applications;
      }),
      fetch("/api/hr/email/templates", { cache: "no-store" }).then(async response => {
        const data = await response.json() as { templates?: Template[]; error?: string };
        if (!response.ok || !data.templates) throw new Error(data.error || "Templates could not be loaded.");
        return data.templates;
      }),
      fetch("/api/hr/email/settings", { cache: "no-store" }).then(async response => {
        const data = await response.json() as { settings?: Settings; error?: string };
        if (!response.ok || !data.settings) throw new Error(data.error || "Sender settings could not be loaded.");
        return data.settings;
      })
    ])
      .then(([loadedOptions, loadedTemplates, loadedSettings]) => {
        if (!active) return;
        setOptions(loadedOptions);
        setTemplates(loadedTemplates);
        setSettings(loadedSettings);
        const initialCandidate = params.get("candidate") ?? params.get("candidates")?.split(",")[0] ?? "";
        const candidateOption = loadedOptions.find(item => item.candidate.id === initialCandidate);
        if (candidateOption) setSelectedIds([candidateOption.applicationId]);
        const initialTemplate = loadedTemplates.find(item => item.id === (params.get("template") ?? ""));
        if (initialTemplate) {
          setSubject(initialTemplate.subject);
          setBody(initialTemplate.body);
          setTemplateId(initialTemplate.id);
        }
        setError("");
      })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "Composer could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params]);

  const selected = options.filter(item => selectedIds.includes(item.applicationId));
  const first = selected[0];
  const previewSubject = render(subject || "Your subject preview", first, settings);
  const previewBody = render(body || "Your message preview will appear here.", first, settings);
  const filtered = options.filter(option => {
    const term = recipientSearch.trim().toLowerCase();
    if (!term) return true;
    return `${option.candidate.name} ${option.candidate.email} ${option.job.title}`.toLowerCase().includes(term);
  });

  const toggle = (id: string) => {
    setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
    setErrors(current => { const next = { ...current }; delete next.recipients; return next; });
  };

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates.find(item => item.id === id);
    if (template) {
      setSubject(template.subject);
      setBody(template.body);
      setErrors({});
    }
  };

  const insertPlaceholder = (placeholder: string) => {
    setBody(current => `${current}${current.endsWith(" ") || !current ? "" : " "}${placeholder}`);
  };

  const onFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const accepted = files.filter(file => file.size <= 3 * 1024 * 1024);
    if (accepted.length !== files.length) toast("Attachments over 3 MB were skipped.", "error");
    setAttachments(current => [...current, ...accepted.map(file => file.name)].slice(0, 3));
    event.target.value = "";
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!selected.length) next.recipients = "Choose at least one candidate.";
    if (subject.trim().length < 3) next.subject = "Add a subject.";
    if (body.trim().length < 20) next.body = "Write a slightly longer message.";
    setErrors(next);
    return !Object.keys(next).length;
  };

  const submit = async (mode: "draft" | "queue") => {
    if (!validate()) return;
    if (mode === "queue" && !confirmOpen) {
      setConfirmOpen(true);
      return;
    }
    setBusy(true);
    let created = 0;
    try {
      for (const option of selected) {
        const response = await fetch("/api/hr/email/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicationId: option.applicationId,
            templateId: templateId || null,
            subject: render(subject, option, settings),
            body: render(body, option, settings),
            attachments,
            mode
          })
        });
        const data = await response.json() as { message?: unknown; error?: string };
        if (!response.ok || !data.message) throw new Error(data.error || `Could not save the message for ${option.candidate.name}.`);
        created += 1;
      }
      setConfirmOpen(false);
      toast(mode === "queue"
        ? settings?.providerConfigured
          ? `Queued ${created} message${created === 1 ? "" : "s"} for delivery. The email worker will process the outbox.`
          : `Queued ${created} message${created === 1 ? "" : "s"}. No provider is configured, so they cannot be delivered yet.`
        : `Saved ${created} draft${created === 1 ? "" : "s"}. Nothing was sent.`);
      router.push("/hr/email/activity");
    } catch (err) {
      toast(err instanceof Error ? err.message : "The message could not be saved.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="space-y-4"><div className="h-10 w-52 animate-pulse rounded-lg bg-white/[0.04]" /><div className="h-[560px] animate-pulse rounded-2xl bg-white/[0.03]" /></div>;
  }

  if (error) {
    return <EmptyState title="Composer unavailable" description={error} icon={Mail} action={<Link href="/hr/email" className={secondaryButton}><ArrowLeft size={13} /> Email centre</Link>} />;
  }

  return (
    <div className="space-y-5">
      <Link href="/hr/email" className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 transition hover:text-white"><ArrowLeft size={12} /> Email centre</Link>
      <PageHeader
        eyebrow="Email & Communications"
        title="Compose message"
        description="Select persisted applications, personalise a template, and save a draft or add it to the durable delivery outbox."
        actions={<button onClick={() => { void submit("draft"); }} disabled={busy} className={secondaryButton}><FileText size={13} /> Save draft</button>}
      />

      <div className={`rounded-xl border px-4 py-2.5 text-[10px] leading-5 ${settings?.providerConfigured ? "border-mint/15 bg-mint/[0.035] text-mint/80" : "border-amber-300/15 bg-amber-300/[0.04] text-amber-200/75"}`}>
        {settings?.providerConfigured
          ? settings.providerMode === "test"
            ? "Test delivery is configured. Queued messages are redirected to the designated test inbox."
            : "Live delivery is configured. Queueing adds messages to the durable outbox for the email worker; it does not send synchronously."
          : "No mail provider is connected. Saving a draft is not a send. Queueing stores durable Queued records, but nothing can be delivered until the server environment is configured."}
        {settings?.configurationIssue && <span className="block">{settings.configurationIssue}</span>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="text-sm font-semibold text-white">Recipients</h2><p className="mt-1 text-[10px] text-slate-500">Choose applications from this organization.</p></div>
              <Badge tone={selected.length ? "mint" : "slate"}>{selected.length} selected</Badge>
            </div>
            {selected.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {selected.map(option => (
                  <span key={option.applicationId} className="inline-flex items-center gap-1.5 rounded-full border border-mint/15 bg-mint/[0.05] px-2.5 py-1 text-[9px] text-mint">
                    {option.candidate.name}
                    <button onClick={() => toggle(option.applicationId)} aria-label={`Remove ${option.candidate.name}`}><X size={9} /></button>
                  </span>
                ))}
                <button onClick={() => setSelectedIds([])} className="text-[9px] text-slate-500 hover:text-white">Clear all</button>
              </div>
            )}
            <div className="relative mt-3">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input value={recipientSearch} onChange={event => setRecipientSearch(event.target.value)} className={`${inputClass} h-9 py-0 pl-8 text-[11px]`} placeholder="Search candidates or roles..." />
            </div>
            <div className="scrollbar-thin mt-2 max-h-[245px] space-y-0.5 overflow-y-auto pr-1">
              {filtered.map(option => {
                const isSelected = selectedIds.includes(option.applicationId);
                return (
                  <button key={option.applicationId} onClick={() => toggle(option.applicationId)} className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition", isSelected ? "bg-mint/[0.055]" : "hover:bg-white/[0.025]")}>
                    <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border", isSelected ? "border-mint bg-mint text-ink" : "border-white/[0.15] text-transparent")}><Check size={10} /></span>
                    <Avatar name={option.candidate.name} size="sm" tone="violet" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-medium text-slate-200">{option.candidate.name}</span><span className="block truncate text-[8px] text-slate-600">{option.candidate.email} · {option.job.title}</span></span>
                  </button>
                );
              })}
              {!filtered.length && <p className="px-2 py-6 text-center text-[10px] text-slate-500">No applications match.</p>}
            </div>
            {errors.recipients && <p className="mt-2 text-[10px] text-rose-200">{errors.recipients}</p>}
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-sm font-semibold text-white">Message</h2><p className="mt-1 text-[10px] text-slate-500">Use a template or write a message. Placeholders resolve in the preview.</p></div>
              <select value={templateId} onChange={event => applyTemplate(event.target.value)} className={`${selectClass} h-9 w-48 py-0 text-[10px]`} aria-label="Choose template">
                <option value="">No template</option>
                {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </div>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className={labelClass}>Subject</span>
                <input value={subject} onChange={event => setSubject(event.target.value)} className={inputClass} placeholder="Interview invitation for {{job_title}}" />
                {errors.subject && <p className="mt-1 text-[10px] text-rose-200">{errors.subject}</p>}
              </label>
              <label className="block">
                <span className={labelClass}>Message body</span>
                <textarea value={body} onChange={event => setBody(event.target.value)} rows={12} className={`${inputClass} resize-y font-mono text-[11px] leading-6`} placeholder="Hi {{candidate_name}}, ..." />
                {errors.body && <p className="mt-1 text-[10px] text-rose-200">{errors.body}</p>}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_PLACEHOLDERS.map(placeholder => <button key={placeholder} onClick={() => insertPlaceholder(placeholder)} className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-2 py-1 font-mono text-[9px] text-slate-500 hover:text-white">{placeholder}</button>)}
              </div>
              <div>
                <p className={labelClass}>Attachments (names only)</p>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-white/[0.12] px-3 py-2 text-[10px] text-slate-500 hover:text-white">
                  <Paperclip size={11} /> Add files
                  <input type="file" multiple className="hidden" onChange={onFiles} />
                </label>
                {attachments.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{attachments.map(name => <span key={name} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] px-2 py-1 text-[9px] text-slate-400">{name}<button onClick={() => setAttachments(current => current.filter(item => item !== name))} aria-label={`Remove ${name}`}><X size={9} /></button></span>)}</div>}
                <p className="mt-1 text-[8px] text-slate-600">Only file names are stored. File contents are never uploaded.</p>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
            <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-white">Preview</h2><Badge tone={selected.length ? "mint" : "slate"}><Users size={9} /> {selected.length || "No"} recipient{selected.length === 1 ? "" : "s"}</Badge></div>
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/10 p-4">
              <p className="text-[8px] uppercase tracking-[0.1em] text-slate-700">To</p>
              <p className="mt-1 truncate text-[10px] text-slate-400">{selected.map(item => item.candidate.email).join(", ") || "No recipients selected"}</p>
              <div className="mt-3 border-t border-white/[0.06] pt-3">
                <p className="text-[11px] font-semibold text-slate-200">{previewSubject}</p>
                <p className="mt-3 whitespace-pre-wrap text-[10px] leading-6 text-slate-400">{previewBody}</p>
                {settings?.signature && <p className="mt-4 whitespace-pre-wrap border-t border-white/[0.05] pt-3 text-[9px] leading-5 text-slate-500">{settings.signature}</p>}
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <button onClick={() => { void submit("queue"); }} disabled={busy || !selected.length} className="flex w-full items-center justify-center gap-2 rounded-xl bg-mint px-4 py-2.5 text-xs font-semibold text-ink disabled:opacity-40">{busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} {settings?.providerConfigured ? "Queue for delivery" : "Queue message"}</button>
              <p className="text-center text-[8px] text-slate-600">{settings?.providerConfigured ? "Adds durable messages to the outbox. A worker sends them asynchronously." : "Queues as Queued. No provider is configured, so nothing is delivered."}</p>
            </div>
          </section>

          <div className="rounded-2xl border border-white/[0.07] bg-card/60 p-4">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-300"><Sparkles size={12} className="text-violet-200" /> Personalisation</div>
            <p className="mt-2 text-[9px] leading-5 text-slate-600">Preview uses the first selected real application. Each queued message is rendered separately for its recipient before being stored.</p>
          </div>

          <Link href="/hr/email/activity" className="flex items-center justify-between rounded-xl border border-white/[0.07] px-3.5 py-3 text-[10px] text-slate-400 hover:text-white"><span className="inline-flex items-center gap-2"><Mail size={12} /> View activity</span><ArrowRight size={11} /></Link>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { void submit("queue"); }}
        title="Queue these messages?"
        description={settings?.providerConfigured
          ? "Messages will be stored in the durable outbox and may be sent by the email worker. Confirm the recipients and content are correct."
          : "Messages will be stored as Queued, but no provider is configured, so they cannot be sent or delivered yet."}
        confirmLabel={settings?.providerConfigured ? "Queue for delivery" : "Queue without provider"}
        busy={busy}
      />
    </div>
  );
}
