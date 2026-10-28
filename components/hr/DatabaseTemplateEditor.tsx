"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Braces, Eye, FilePenLine, Mail, Save } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { TEMPLATE_PLACEHOLDERS } from "@/lib/domain";
import { inputClass, labelClass, primaryButton, secondaryButton } from "@/lib/ui";

interface Template {
  id: string;
  name: string;
  category: "Application" | "Shortlist" | "Interview" | "Outcome";
  description: string;
  subject: string;
  body: string;
  updatedAt: string;
}

interface ApplicationOption {
  applicationId: string;
  candidate: { name: string };
  job: { title: string };
}

const CATEGORIES: Template["category"][] = ["Application", "Shortlist", "Interview", "Outcome"];

function replaceVariables(content: string, option: ApplicationOption | undefined) {
  if (!option) return content;
  return content
    .replace(/\{\{candidate_name\}\}/g, option.candidate.name)
    .replace(/\{\{job_title\}\}/g, option.job.title)
    .replace(/\{\{interview_date\}\}/g, "[interview date not scheduled]");
}

export function DatabaseTemplateEditor({ templateId }: { templateId: string }) {
  const isNew = templateId === "new";
  const router = useRouter();
  const { toast } = useToast();
  const [template, setTemplate] = useState<Template | null>(null);
  const [sample, setSample] = useState<ApplicationOption | undefined>();
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Template["category"]>("Application");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    let active = true;
    const requests: Promise<unknown>[] = [
      fetch("/api/hr/interviews/options", { cache: "no-store" }).then(async response => {
        if (!response.ok) return;
        const data = await response.json() as { applications?: ApplicationOption[] };
        if (active) setSample(data.applications?.[0]);
      })
    ];
    if (!isNew) {
      requests.push(fetch(`/api/hr/email/templates/${encodeURIComponent(templateId)}`, { cache: "no-store" }).then(async response => {
        const data = await response.json() as { template?: Template; error?: string };
        if (!response.ok || !data.template) throw new Error(data.error || "Template could not be loaded.");
        if (!active) return;
        setTemplate(data.template);
        setName(data.template.name);
        setCategory(data.template.category);
        setDescription(data.template.description);
        setSubject(data.template.subject);
        setBody(data.template.body);
      }));
    }
    Promise.all(requests)
      .then(() => { if (active) setError(""); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "Template could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isNew, templateId]);

  const variables = useMemo(() => [...TEMPLATE_PLACEHOLDERS], []);
  const valid = name.trim().length >= 2 && subject.trim().length >= 3 && body.trim().length >= 20;
  const previewSubject = replaceVariables(subject || "Your subject preview", sample);
  const previewBody = replaceVariables(body || "Your message preview will appear here.", sample);

  const insertPlaceholder = (placeholder: string) => {
    setBody(current => `${current}${current.endsWith(" ") || !current ? "" : " "}${placeholder}`);
  };

  const save = async () => {
    if (!valid) {
      toast("Template needs a name, subject, and message body.", "error");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(isNew ? "/api/hr/email/templates" : `/api/hr/email/templates/${encodeURIComponent(templateId)}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, description, subject, body })
      });
      const data = await response.json() as { template?: Template; error?: string };
      if (!response.ok || !data.template) throw new Error(data.error || "Template could not be saved.");
      toast(isNew ? "Template created in PostgreSQL. Nothing was sent." : "Template saved in PostgreSQL. Nothing was sent.");
      router.push(`/hr/email/templates/${data.template.id}`);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Template could not be saved.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="space-y-4"><div className="h-10 w-52 animate-pulse rounded-lg bg-white/[0.04]" /><div className="h-[520px] animate-pulse rounded-2xl bg-white/[0.03]" /></div>;
  }

  if (error || (!isNew && !template)) {
    return <EmptyState title="Template unavailable" description={error || "This template could not be found."} icon={FilePenLine} action={<Link href="/hr/email/templates" className={secondaryButton}><ArrowLeft size={13} /> Back to templates</Link>} />;
  }

  const dirty = isNew || (template && (name !== template.name || subject !== template.subject || body !== template.body || category !== template.category || description !== template.description));

  return (
    <div className="space-y-5">
      <Link href="/hr/email/templates" className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 transition hover:text-white"><ArrowLeft size={12} /> All templates</Link>
      <PageHeader
        eyebrow={`Templates / ${category}`}
        title={isNew ? "New email template" : template?.name ?? "Email template"}
        description="Edit reusable subject and message content persisted in PostgreSQL. Saving does not send any email."
        actions={<button onClick={save} disabled={!valid || !dirty || busy} className={primaryButton}><Save size={13} /> {busy ? "Saving..." : isNew ? "Create template" : "Save template"}</button>}
      />

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-2.5 text-[10px] leading-5 text-slate-500">
        Templates are stored per organization. No mail provider is configured, so saving or previewing a template cannot deliver a message.
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Badge tone="violet">{category}</Badge>{template && <span className="font-mono text-[8px] text-slate-600">{template.id}</span>}</div>
              {dirty && <span className="text-[9px] text-amber-200/70">Unsaved changes</span>}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Template name</span>
                <input value={name} onChange={event => setName(event.target.value)} className={inputClass} placeholder="Interview invitation" />
              </label>
              <label className="block">
                <span className={labelClass}>Category</span>
                <select value={category} onChange={event => setCategory(event.target.value as Template["category"])} className={inputClass}>
                  {CATEGORIES.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClass}>Description</span>
                <input value={description} onChange={event => setDescription(event.target.value)} className={inputClass} placeholder="When this template should be used" />
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClass}>Subject</span>
                <input value={subject} onChange={event => setSubject(event.target.value)} className={inputClass} placeholder="Interview invitation for {{job_title}}" />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">Message body</h2>
              <span className="inline-flex items-center gap-1.5 text-[9px] text-slate-600"><Braces size={10} /> {variables.length} placeholders</span>
            </div>
            <textarea value={body} onChange={event => setBody(event.target.value)} rows={16} className={`${inputClass} mt-4 resize-y font-mono text-[11px] leading-6`} placeholder="Hi {{candidate_name}}, ..." />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {variables.map(key => <button key={key} onClick={() => insertPlaceholder(key)} className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-2 py-1 font-mono text-[9px] text-slate-500 hover:text-white">{key}</button>)}
            </div>
            {!valid && <p className="mt-2 text-[9px] text-amber-200/70">Add a name, subject, and at least 20 characters of message content.</p>}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-300"><Eye size={12} /> Live preview</div>
            <p className="mt-1 text-[8px] text-slate-600">{sample ? `Using a real application sample: ${sample.candidate.name}.` : "No application sample is available; unknown placeholders remain visible."}</p>
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/10 p-4">
              <p className="text-[8px] uppercase tracking-[0.1em] text-slate-700">Subject</p>
              <p className="mt-1 text-[11px] font-medium text-slate-200">{previewSubject}</p>
              <div className="mt-4 border-t border-white/[0.06] pt-4">
                <p className="whitespace-pre-wrap text-[10px] leading-6 text-slate-400">{previewBody}</p>
              </div>
            </div>
          </section>
          <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-4 text-[9px] leading-5 text-amber-200/70">
            <div className="flex items-center gap-2 font-semibold uppercase tracking-[0.1em]"><Mail size={11} /> Not a send action</div>
            <p className="mt-2">This editor only stores template content. Composing a draft or queueing a message never delivers without a configured provider.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
