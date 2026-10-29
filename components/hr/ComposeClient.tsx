"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
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
  Trash2,
  Users,
  X
} from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { useToast } from "@/components/ToastProvider";
import { Avatar, Badge, DemoBanner, EmptyState, Modal, PageHeader } from "@/components/ui";
import { TEMPLATE_PLACEHOLDERS } from "@/lib/domain";
import { buildApplicationRecords, renderTemplate, templateVariables } from "@/lib/demo-service";
import { formatDate, formatFileSize } from "@/lib/format";
import { inputClass, labelClass, primaryButton, secondaryButton, selectClass } from "@/lib/ui";
import { cn } from "@/lib/cn";

export function ComposeClient() {
  const store = useDemoData();
  const router = useRouter();
  const { toast } = useToast();
  const params = useSearchParams();
  const records = useMemo(() => buildApplicationRecords(store), [store]);

  const initialCandidate = params.get("candidate") ?? params.get("candidates")?.split(",")[0] ?? "";
  const initialTemplateId = params.get("template") ?? "";
  const initialTemplate = store.templates.find(item => item.id === initialTemplateId);

  const [selectedIds, setSelectedIds] = useState<string[]>(initialCandidate ? [initialCandidate] : []);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const [subject, setSubject] = useState(initialTemplate?.subject ?? "");
  const [body, setBody] = useState(initialTemplate?.body ?? "");
  const [attachments, setAttachments] = useState<Array<{ name: string; size: number }>>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const selectedRecords = records.filter(record => selectedIds.includes(record.candidate.id));
  const firstRecord = selectedRecords[0];
  const firstInterview = firstRecord
    ? store.interviews
        .filter(item => item.applicationId === firstRecord.application.id)
        .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))[0]
    : undefined;
  const variables = templateVariables(firstRecord, store.mailSettings.senderName, firstInterview);
  const previewSubject = renderTemplate(subject || "Your subject preview", variables);
  const previewBody = renderTemplate(body || "Your message preview will appear here.", variables);
  const templates = store.templates;

  const filteredRecipients = records.filter(record => {
    const q = recipientSearch.trim().toLowerCase();
    if (!q) return true;
    return `${record.candidate.name} ${record.candidate.email} ${record.job.title}`.toLowerCase().includes(q);
  });

  const selectedNames = selectedRecords.map(record => record.candidate.name);

  const toggleRecipient = (id: string) => {
    setSelectedIds(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]));
    setErrors(current => {
      if (!current.recipients) return current;
      const next = { ...current };
      delete next.recipients;
      return next;
    });
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

  const onAttachments = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const accepted = files.filter(file => file.size <= 3 * 1024 * 1024);
    if (accepted.length !== files.length) toast("Attachments over 3 MB were skipped in this demo.", "error");
    setAttachments(current => [...current, ...accepted.map(file => ({ name: file.name, size: file.size }))].slice(0, 3));
    event.target.value = "";
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!selectedIds.length) next.recipients = "Choose at least one candidate.";
    if (subject.trim().length < 3) next.subject = "Add a subject.";
    if (body.trim().length < 20) next.body = "Write a slightly longer message.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const send = async () => {
    setSending(true);
    await new Promise(resolve => window.setTimeout(resolve, 800));
    const created = store.sendEmail({
      candidateIds: selectedIds,
      templateId: templateId || null,
      subject: previewSubject,
      body: previewBody,
      attachments: attachments.map(item => item.name)
    });
    setSending(false);
    setConfirmOpen(false);
    if (!created.length) {
      toast("No demo recipients could be matched.", "error");
      return;
    }
    toast(`Simulated message recorded for ${created.length} recipient${created.length === 1 ? "" : "s"}. No email was delivered.`);
    router.push("/hr/email/activity");
  };

  const saveDraft = () => {
    if (!selectedIds.length || !subject.trim() || !body.trim()) {
      setErrors({ recipients: !selectedIds.length ? "Choose at least one candidate." : "", subject: !subject.trim() ? "Add a subject." : "", body: !body.trim() ? "Add a message." : "" });
      return;
    }
    store.sendEmail({
      candidateIds: selectedIds,
      templateId: templateId || null,
      subject: previewSubject,
      body: previewBody,
      attachments: attachments.map(item => item.name),
      asDraft: true
    });
    toast("Demo email draft saved. Nothing was sent.");
    router.push("/hr/email");
  };

  return (
    <div className="space-y-5">
      <Link href="/hr/email" className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 transition hover:text-white"><ArrowLeft size={12} /> Email centre</Link>
      <PageHeader
        eyebrow="Email & Communications"
        title="Compose message"
        description="Select recipients, personalise a template, and review the final message. Sending is simulated in this frontend phase."
        actions={<button onClick={saveDraft} className={secondaryButton}><FileText size={13} /> Save draft</button>}
      />

      <DemoBanner compact>Demo composer: no mail provider is connected. Subject, body, and attachment names are stored only as simulated activity for this browser session.</DemoBanner>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="text-sm font-semibold text-white">Recipients</h2><p className="mt-1 text-[10px] text-slate-500">Choose one candidate or build a small demo bulk send.</p></div>
              <Badge tone={selectedIds.length ? "mint" : "slate"}>{selectedIds.length} selected</Badge>
            </div>
            {selectedNames.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {selectedRecords.map(record => (
                  <span key={record.candidate.id} className="inline-flex items-center gap-1.5 rounded-full border border-mint/15 bg-mint/[0.05] px-2.5 py-1 text-[9px] text-mint">
                    {record.candidate.name}
                    <button onClick={() => toggleRecipient(record.candidate.id)} aria-label={`Remove ${record.candidate.name}`}><X size={9} /></button>
                  </span>
                ))}
                <button onClick={() => setSelectedIds([])} className="text-[9px] text-slate-500 hover:text-white">Clear all</button>
              </div>
            )}
            <div className="relative mt-3">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input value={recipientSearch} onChange={event => setRecipientSearch(event.target.value)} className={`${inputClass} h-9 py-0 pl-8 text-[11px]`} placeholder="Search candidates or roles…" />
            </div>
            <div className="scrollbar-thin mt-2 max-h-[245px] space-y-0.5 overflow-y-auto pr-1">
              {filteredRecipients.map(record => {
                const selected = selectedIds.includes(record.candidate.id);
                return (
                  <button key={record.candidate.id} onClick={() => toggleRecipient(record.candidate.id)} className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition", selected ? "bg-mint/[0.055]" : "hover:bg-white/[0.025]")}>
                    <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border", selected ? "border-mint bg-mint text-ink" : "border-white/[0.15] text-transparent")}><Check size={10} /></span>
                    <Avatar name={record.candidate.name} size="sm" tone="violet" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-medium text-slate-200">{record.candidate.name}</span><span className="block truncate text-[8px] text-slate-600">{record.candidate.email} · {record.job.title}</span></span>
                    <Badge tone="slate">{record.application.stage}</Badge>
                  </button>
                );
              })}
              {!filteredRecipients.length && <p className="px-3 py-4 text-center text-[10px] text-slate-600">No candidates match that search.</p>}
            </div>
            {errors.recipients && <p className="mt-2 text-[10px] text-rose-200">{errors.recipients}</p>}
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <label className="block">
                <span className={labelClass}>Template</span>
                <select value={templateId} onChange={event => applyTemplate(event.target.value)} className={selectClass}>
                  <option value="">Start without a template</option>
                  {templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <div className="flex items-end">
                <span className="rounded-xl border border-violet/15 bg-violet/[0.05] px-3 py-2.5 text-[9px] text-violet-200/75"><Sparkles size={10} className="mr-1 inline" /> Placeholders render live</span>
              </div>
            </div>
            <label className="mt-4 block">
              <span className={labelClass}>Subject</span>
              <input value={subject} onChange={event => { setSubject(event.target.value); setErrors(current => ({ ...current, subject: "" })); }} className={inputClass} placeholder="Email subject" />
              {errors.subject && <p className="mt-1 text-[10px] text-rose-200">{errors.subject}</p>}
            </label>
            <label className="mt-4 block">
              <span className={labelClass}>Message</span>
              <textarea value={body} onChange={event => { setBody(event.target.value); setErrors(current => ({ ...current, body: "" })); }} rows={12} className={`${inputClass} resize-y leading-6`} placeholder="Write your message…" />
              {errors.body && <p className="mt-1 text-[10px] text-rose-200">{errors.body}</p>}
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[9px] text-slate-600">Insert:</span>
              {TEMPLATE_PLACEHOLDERS.slice(0, 5).map(placeholder => (
                <button key={placeholder} onClick={() => insertPlaceholder(placeholder)} className="rounded-md border border-white/[0.07] bg-white/[0.02] px-1.5 py-1 font-mono text-[8px] text-slate-500 transition hover:border-white/15 hover:text-white">{placeholder}</button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-card/80 p-5">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="text-sm font-semibold text-white">Attachments</h2><p className="mt-1 text-[10px] text-slate-500">Metadata only · no file is uploaded or sent.</p></div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[9px] text-slate-400 transition hover:text-white">
                <Paperclip size={10} /> Add file
                <input type="file" multiple className="sr-only" onChange={onAttachments} />
              </label>
            </div>
            <div className="mt-3 space-y-2">
              {attachments.map(item => (
                <div key={`${item.name}-${item.size}`} className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2.5">
                  <FileText size={12} className="text-slate-500" />
                  <span className="min-w-0 flex-1 truncate text-[10px] text-slate-300">{item.name}</span>
                  <span className="text-[8px] text-slate-600">{formatFileSize(item.size)}</span>
                  <button onClick={() => setAttachments(current => current.filter(file => file.name !== item.name))} className="text-slate-600 hover:text-rose-200" aria-label={`Remove ${item.name}`}><Trash2 size={11} /></button>
                </div>
              ))}
              {!attachments.length && <p className="py-2 text-[9px] text-slate-600">No attachments added.</p>}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Link href="/hr/email" className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs text-slate-500 hover:text-white"><ArrowLeft size={12} /> Cancel</Link>
            <div className="flex flex-wrap gap-2">
              <button onClick={saveDraft} className={secondaryButton}>Save draft</button>
              <button onClick={() => { if (validate()) setConfirmOpen(true); else toast("Choose recipients and complete the message.", "error"); }} className={primaryButton}><Send size={13} /> Review & send</button>
            </div>
          </div>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card/90">
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-300"><Mail size={12} className="text-violet-200" /> Live preview</div>
              <Badge tone="amber">Demo</Badge>
            </div>
            <div className="p-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="border-b border-white/[0.06] pb-3">
                  <p className="text-[8px] uppercase tracking-[0.1em] text-slate-600">From</p>
                  <p className="mt-1 text-[10px] text-slate-300">{store.mailSettings.senderName} &lt;{store.mailSettings.senderAddress}&gt;</p>
                  <p className="mt-2 text-[8px] uppercase tracking-[0.1em] text-slate-600">To</p>
                  <p className="mt-1 text-[10px] text-slate-300">{selectedNames.length ? selectedNames.join(", ") : "No recipients selected"}</p>
                  {firstRecord && <p className="mt-2 truncate text-[8px] text-slate-600">Preview variables: {firstRecord.candidate.name} · {firstRecord.job.title}</p>}
                </div>
                <p className="mt-3 text-[12px] font-semibold text-white">{previewSubject}</p>
                <p className="mt-3 whitespace-pre-wrap text-[10px] leading-5 text-slate-400">{previewBody}</p>
              </div>
              <p className="mt-3 text-[8px] leading-4 text-slate-600">Preview uses the first selected candidate. Bulk sends create one simulated record per recipient with their own placeholders.</p>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-card/60 p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">Send checklist</p>
            <div className="mt-3 space-y-2 text-[9px]">
              <div className="flex items-center gap-2 text-slate-500"><span className={cn("grid h-4 w-4 place-items-center rounded-full border", selectedIds.length ? "border-mint/30 bg-mint/[0.08] text-mint" : "border-white/[0.1]")}><Check size={8} /></span> Recipients selected</div>
              <div className="flex items-center gap-2 text-slate-500"><span className={cn("grid h-4 w-4 place-items-center rounded-full border", subject.trim() ? "border-mint/30 bg-mint/[0.08] text-mint" : "border-white/[0.1]")}><Check size={8} /></span> Subject ready</div>
              <div className="flex items-center gap-2 text-slate-500"><span className={cn("grid h-4 w-4 place-items-center rounded-full border", body.trim().length >= 20 ? "border-mint/30 bg-mint/[0.08] text-mint" : "border-white/[0.1]")}><Check size={8} /></span> Message ready</div>
            </div>
            <div className="mt-3 rounded-lg border border-amber-300/10 bg-amber-300/[0.03] p-2.5 text-[8px] leading-4 text-amber-200/60">
              Sending simulates a demo activity record. No email is delivered and no provider error is fabricated.
            </div>
          </section>
        </aside>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm simulated send"
        description="Review recipients before recording demo email activity."
        size="md"
        footer={
          <>
            <button onClick={() => setConfirmOpen(false)} className={secondaryButton} disabled={sending}>Cancel</button>
            <button onClick={send} className={primaryButton} disabled={sending}>{sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {sending ? "Recording…" : "Confirm demo send"}</button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3.5 text-[10px] leading-5 text-amber-200/75">
            This action does not send email. It adds simulated records to the local demo activity history.
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Recipients ({selectedIds.length})</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{selectedRecords.map(record => <Badge key={record.candidate.id} tone="slate">{record.candidate.name}</Badge>)}</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5">
            <p className="text-[9px] text-slate-600">Subject</p><p className="mt-1 text-xs text-slate-200">{previewSubject}</p>
            <p className="mt-3 text-[9px] text-slate-600">Preview</p><p className="mt-1 whitespace-pre-wrap text-[10px] leading-5 text-slate-400">{previewBody.slice(0, 420)}{previewBody.length > 420 ? "…" : ""}</p>
          </div>
          {attachments.length > 0 && <p className="text-[9px] text-slate-500"><Users size={10} className="mr-1 inline" /> {attachments.length} attachment name{attachments.length === 1 ? "" : "s"} will be recorded. No files are included.</p>}
        </div>
      </Modal>
    </div>
  );
}

export function ComposeSkeleton() {
  return <div className="space-y-4"><div className="h-20 animate-pulse rounded-2xl bg-white/[0.03]" /><div className="grid gap-4 xl:grid-cols-[1fr_380px]"><div className="h-[600px] animate-pulse rounded-2xl bg-white/[0.025]" /><div className="h-[400px] animate-pulse rounded-2xl bg-white/[0.02]" /></div></div>;
}
