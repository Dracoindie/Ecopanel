"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Braces,
  Eye,
  FilePenLine,
  Mail,
  RotateCcw,
  Save,
  Sparkles
} from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { useToast } from "@/components/ToastProvider";
import { Badge, ConfirmDialog, DemoBanner, EmptyState, PageHeader } from "@/components/ui";
import { TEMPLATE_PLACEHOLDERS } from "@/lib/domain";
import { seedTemplates } from "@/lib/demo-data";
import { buildApplicationRecords, renderTemplate, templateVariables } from "@/lib/demo-service";
import { formatDate } from "@/lib/format";
import { inputClass, labelClass, primaryButton, secondaryButton } from "@/lib/ui";

export function TemplateEditorClient() {
  const params = useParams<{ id: string }>();
  const store = useDemoData();
  const { toast } = useToast();
  const template = store.templates.find(item => item.id === params.id);
  const records = useMemo(() => buildApplicationRecords(store), [store]);
  const sampleRecord = records[0];
  const sampleInterview = sampleRecord ? store.interviews.find(item => item.applicationId === sampleRecord.application.id) : undefined;
  const variables = templateVariables(sampleRecord, store.mailSettings.senderName, sampleInterview);

  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [resetOpen, setResetOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!template) {
    return <EmptyState title="Template not found" description="This demo template may have been removed." icon={FilePenLine} action={<Link href="/hr/email/templates" className={secondaryButton}><ArrowLeft size={13} /> Back to templates</Link>} />;
  }

  const dirty = name !== template.name || subject !== template.subject || body !== template.body;
  const valid = name.trim().length >= 2 && subject.trim().length >= 3 && body.trim().length >= 20;
  const previewSubject = renderTemplate(subject, variables);
  const previewBody = renderTemplate(body, variables);

  const insertPlaceholder = (placeholder: string) => {
    setBody(current => `${current}${current.endsWith(" ") || !current ? "" : " "}${placeholder}`);
    setSaved(false);
  };

  const save = () => {
    if (!valid) {
      toast("Template needs a name, subject, and message body.", "error");
      return;
    }
    store.updateTemplate(template.id, { name: name.trim(), subject: subject.trim(), body });
    setSaved(true);
    toast("Template saved for this demo session.");
  };

  const reset = () => {
    const seed = seedTemplates.find(item => item.id === template.id);
    store.resetTemplate(template.id);
    if (seed) {
      setName(seed.name);
      setSubject(seed.subject);
      setBody(seed.body);
    }
    setResetOpen(false);
    setSaved(false);
    toast("Template restored to its seeded demo content.");
  };

  return (
    <div className="space-y-5">
      <Link href="/hr/email/templates" className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 transition hover:text-white"><ArrowLeft size={12} /> All templates</Link>
      <PageHeader
        eyebrow={`Templates / ${template.category}`}
        title={template.name}
        description="Edit the reusable subject and message. Changes apply only to this browser session until a backend is connected."
        actions={
          <>
            <button onClick={() => setResetOpen(true)} className={secondaryButton}><RotateCcw size={13} /> Reset</button>
            <button onClick={save} disabled={!valid || !dirty} className={primaryButton}><Save size={13} /> Save template</button>
          </>
        }
      />

      <DemoBanner compact>Templates are seeded demo copy. No message will be sent from this screen, and template edits reset when the session ends.</DemoBanner>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Badge tone="violet">{template.category}</Badge><span className="font-mono text-[8px] text-slate-600">{template.id}</span></div>
              <div className="flex items-center gap-2 text-[8px] text-slate-600">{dirty ? <Badge tone="amber">Unsaved changes</Badge> : saved ? <Badge tone="mint">Saved this session</Badge> : `Updated ${formatDate(template.updatedAt)}`}</div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Template name</span>
                <input value={name} onChange={event => { setName(event.target.value); setSaved(false); }} className={inputClass} placeholder="Template name" />
              </label>
              <label className="block">
                <span className={labelClass}>Category</span>
                <div className={`${inputClass} flex items-center bg-white/[0.015] text-slate-500`}>{template.category}<span className="ml-auto text-[8px] text-slate-700">Fixed in demo</span></div>
              </label>
            </div>
            <label className="mt-4 block">
              <span className={labelClass}>Email subject</span>
              <input value={subject} onChange={event => { setSubject(event.target.value); setSaved(false); }} className={inputClass} placeholder="Email subject" />
              <span className="mt-1.5 block text-[8px] text-slate-600">Subject preview: <span className="text-slate-400">{previewSubject}</span></span>
            </label>
            <label className="mt-4 block">
              <span className={labelClass}>Message body</span>
              <textarea value={body} onChange={event => { setBody(event.target.value); setSaved(false); }} rows={16} className={`${inputClass} resize-y font-mono text-[11px] leading-6`} placeholder="Write reusable message copy…" />
            </label>
            <div className="mt-3 border-t border-white/[0.05] pt-3">
              <p className="mb-2 text-[8px] font-bold uppercase tracking-[0.12em] text-slate-600">Insert placeholder</p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_PLACEHOLDERS.map(placeholder => (
                  <button key={placeholder} onClick={() => insertPlaceholder(placeholder)} className="rounded-md border border-white/[0.07] bg-white/[0.02] px-1.5 py-1 font-mono text-[8px] text-slate-500 transition hover:border-white/15 hover:text-white">{placeholder}</button>
                ))}
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Link href="/hr/email/templates" className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs text-slate-500 hover:text-white"><ArrowLeft size={12} /> Cancel</Link>
            <div className="flex gap-2"><button onClick={() => setResetOpen(true)} className={secondaryButton}><RotateCcw size={13} /> Reset to seed</button><button onClick={save} disabled={!valid || !dirty} className={primaryButton}><Save size={13} /> Save changes</button></div>
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a111e]/90">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3"><div className="flex items-center gap-2 text-[10px] font-semibold text-slate-300"><Eye size={12} className="text-violet-200" /> Live sample</div><Badge tone="amber">Demo</Badge></div>
            <div className="p-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="border-b border-white/[0.06] pb-3">
                  <p className="text-[8px] uppercase tracking-[0.1em] text-slate-600">To</p>
                  <p className="mt-1 text-[10px] text-slate-300">{sampleRecord?.candidate.name ?? "Candidate"} &lt;{sampleRecord?.candidate.email ?? "candidate@example.com"}&gt;</p>
                  <p className="mt-2 text-[8px] text-slate-600">See how values resolve for a seeded candidate.</p>
                </div>
                <p className="mt-3 text-[12px] font-semibold leading-5 text-white">{previewSubject}</p>
                <p className="mt-3 whitespace-pre-wrap text-[10px] leading-5 text-slate-400">{previewBody}</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/60 p-4">
            <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-600"><Sparkles size={11} /> Template notes</div>
            <p className="mt-3 text-[10px] leading-5 text-slate-500">{template.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5"><Badge tone="slate"><Braces size={9} /> {TEMPLATE_PLACEHOLDERS.length} supported</Badge><Badge tone="slate"><Mail size={9} /> Simulated</Badge></div>
            <p className="mt-3 border-t border-white/[0.05] pt-3 text-[8px] leading-4 text-slate-600">No template is approved for production. Review data handling, consent, and legal copy before connecting a backend.</p>
          </section>

          <Link href={`/hr/email/compose?template=${template.id}`} className="flex items-center justify-between rounded-xl border border-mint/10 bg-mint/[0.03] px-3.5 py-3 text-[10px] text-mint/80 transition hover:bg-mint/[0.06] hover:text-white"><span className="inline-flex items-center gap-2"><FilePenLine size={12} /> Use in composer</span><ArrowRight size={11} /></Link>
        </aside>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={reset}
        title="Reset template?"
        description="This restores the seeded demo subject and body. Your current edits to this template will be discarded."
        confirmLabel="Reset template"
        tone="danger"
      />
    </div>
  );
}
