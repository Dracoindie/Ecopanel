"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  MapPin,
  Paperclip,
  ShieldCheck,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { useIsDatabaseMode } from "@/components/AppModeProvider";
import type { Job } from "@/lib/domain";
import { useToast } from "@/components/ToastProvider";
import { Modal } from "@/components/ui";
import { formatFileSize } from "@/lib/format";
import { publicInputClass } from "@/lib/ui";

const MAX_CV_BYTES = 5 * 1024 * 1024;

type FormState = {
  name: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  coverLetter: string;
  consent: boolean;
};

const initialForm: FormState = {
  name: "",
  email: "",
  phone: "",
  linkedinUrl: "",
  githubUrl: "",
  portfolioUrl: "",
  coverLetter: "",
  consent: false
};

const isUrl = (value: string) => !value.trim() || /^https?:\/\/.+\..+/i.test(value.trim());
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="mt-1.5 flex items-center gap-1 text-[10px] text-rose-300"><AlertCircle size={10} /> {children}</p>;
}

export default function ApplyPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { jobs: demoJobs, createApplication } = useDemoData();
  const { toast } = useToast();
  const isDatabase = useIsDatabaseMode();
  const [databaseJob, setDatabaseJob] = useState<Job | null>(null);
  const [jobLoading, setJobLoading] = useState(isDatabase);
  const [jobLoadError, setJobLoadError] = useState("");
  const job = isDatabase ? databaseJob : demoJobs.find(item => item.id === params.id) ?? null;
  const isOpen = job?.status === "Published" && job.publicVisible;

  const [form, setForm] = useState<FormState>(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!isDatabase) return;
    let active = true;
    setJobLoading(true);
    fetch(`/api/careers/jobs/${encodeURIComponent(params.id)}`, { cache: "no-store" })
      .then(async response => {
        const body = await response.json() as { job?: Job; error?: string };
        if (response.status === 404) {
          if (active) setDatabaseJob(null);
          return;
        }
        if (!response.ok) throw new Error(body.error || "This role is temporarily unavailable.");
        if (active) setDatabaseJob(body.job ?? null);
      })
      .catch(error => {
        if (active) setJobLoadError(error instanceof Error ? error.message : "This role is temporarily unavailable.");
      })
      .finally(() => {
        if (active) setJobLoading(false);
      });
    return () => { active = false; };
  }, [isDatabase, params.id]);

  if (jobLoading) {
    return (
      <main className="mx-auto flex min-h-[58vh] w-full max-w-[900px] flex-col items-center justify-center px-6 py-20 text-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-mint" />
        <p className="mt-4 text-sm text-slate-500">Loading application…</p>
      </main>
    );
  }

  if (jobLoadError) {
    return (
      <main className="mx-auto flex min-h-[58vh] w-full max-w-[900px] flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="font-display text-3xl text-white">This role is temporarily unavailable.</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">{jobLoadError}</p>
        <Link href="/careers" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-ink">
          Browse open roles
        </Link>
      </main>
    );
  }

  if (!job || !isOpen) {
    return (
      <main className="mx-auto flex min-h-[58vh] w-full max-w-[900px] flex-col items-center justify-center px-6 py-20 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.1] bg-white/[0.03] text-slate-500">
          <FileText size={18} />
        </span>
        <h1 className="font-display mt-5 text-3xl text-white">Applications for this role are closed.</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">This role is not accepting public applications. You can browse other open positions and apply there.</p>
        <Link href="/careers" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-ink">
          Browse open roles
        </Link>
      </main>
    );
  }

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFileError("");
    if (!selected) {
      setFile(null);
      return;
    }
    if (!/\.(pdf|doc|docx)$/i.test(selected.name)) {
      setFileError("Choose a PDF, DOC, or DOCX file.");
      setFile(null);
      event.target.value = "";
      return;
    }
    if (selected.size > MAX_CV_BYTES) {
      setFileError("Your CV must be 5 MB or smaller.");
      setFile(null);
      event.target.value = "";
      return;
    }
    setFile(selected);
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = "Enter your full name.";
    if (!isEmail(form.email)) next.email = "Enter a valid email address.";
    if (form.phone.trim().replace(/\D/g, "").length < 7) next.phone = "Enter a valid phone number.";
    if (!isUrl(form.linkedinUrl)) next.linkedinUrl = "Use a full URL beginning with https://.";
    if (!isUrl(form.githubUrl)) next.githubUrl = "Use a full URL beginning with https://.";
    if (!isUrl(form.portfolioUrl)) next.portfolioUrl = "Use a full URL beginning with https://.";
    if (form.coverLetter.trim().length < 40) next.coverLetter = "Add at least 40 characters so the team can understand your interest.";
    if (!form.consent) next.consent = isDatabase ? "Consent is required to submit your application." : "Consent is required to continue in this demo.";
    if (!file) next.cv = "Attach your CV.";
    setErrors(next);
    setFileError(next.cv ?? "");
    return Object.keys(next).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError("");
    if (!validate() || !file) {
      toast("Check the highlighted fields before submitting.", "error");
      return;
    }
    setSubmitting(true);

    if (!isDatabase) {
      await new Promise(resolve => window.setTimeout(resolve, 900));
      const application = createApplication({
        jobId: job.id,
        name: form.name,
        email: form.email,
        phone: form.phone,
        linkedinUrl: form.linkedinUrl,
        githubUrl: form.githubUrl,
        portfolioUrl: form.portfolioUrl,
        coverLetter: form.coverLetter,
        cv: {
          fileName: file.name,
          size: file.size,
          mimeType: file.type || "application/octet-stream"
        }
      });
      toast("Demo application submitted.", "success");
      router.push(`/careers/applications/${application.id}`);
      return;
    }

    try {
      const body = new FormData();
      body.set("jobId", job.id);
      body.set("name", form.name);
      body.set("email", form.email);
      body.set("phone", form.phone);
      body.set("linkedinUrl", form.linkedinUrl);
      body.set("githubUrl", form.githubUrl);
      body.set("portfolioUrl", form.portfolioUrl);
      body.set("coverLetter", form.coverLetter);
      body.set("consent", "on");
      body.set("cv", file);

      const response = await fetch("/api/careers/applications", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body
      });
      const payload = await response.json() as { application?: { publicReference: string }; error?: string };
      if (!response.ok || !payload.application) {
        throw new Error(payload.error || "The application could not be submitted.");
      }
      toast("Application received.", "success");
      router.push(`/careers/applications/${payload.application.publicReference}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The application could not be submitted.";
      setSubmitError(message);
      toast(message, "error");
      setSubmitting(false);
    }
  };

  const previewFile = () => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) {
      toast("Inline preview is available for PDF CVs in this demo. DOC/DOCX files are accepted but not rendered.", "info");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setPreviewOpen(true);
  };

  const closePreview = () => {
    setPreviewOpen(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
    }
  };

  return (
    <main>
      <div className="border-b border-white/[0.055] bg-ink">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-10">
          <Link href={`/careers/jobs/${job.id}`} className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 transition hover:text-white">
            <ArrowLeft size={13} /> Back to role
          </Link>
          <span className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Application · {isDatabase ? "secure" : "demo"}</span>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_330px] lg:px-10 lg:py-14">
        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">Your application</p>
          <h1 className="font-display mt-3 text-4xl leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl">Tell us how you think.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-500">
            {isDatabase
              ? "Share the context behind your work. Your application and CV are transmitted to this hiring team and stored privately."
              : "Share the context behind your work. This is a frontend demo: your details stay in the local demo workspace and your CV is not uploaded anywhere."}
          </p>

          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] px-4 py-3 text-[10px] leading-5 text-amber-200/75">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            {isDatabase
              ? "Your CV is stored in private storage, checked for file type, and blocked from recruiter download until its malware-scan policy allows it."
              : "Please do not submit real sensitive personal data. No file is transmitted or stored on a server in this phase."}
          </div>

          <form onSubmit={submit} noValidate className="mt-8 space-y-7">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.022] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] pb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Applying for</p>
                  <p className="mt-1 text-sm font-semibold text-white">{job.title}</p>
                </div>
                <span className="rounded-full border border-mint/20 bg-mint/[0.06] px-2.5 py-1 text-[9px] font-semibold text-mint">Open</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5"><MapPin size={11} /> {job.location} · {job.workplace}</span>
                <span>{job.department}</span>
                <span>{job.employmentType}</span>
              </div>
            </div>

            <fieldset>
              <legend className="text-sm font-semibold text-white">Contact details</legend>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-medium text-slate-400">Full name *</span>
                  <input value={form.name} onChange={event => setField("name", event.target.value)} className={publicInputClass} placeholder="Your full name" autoComplete="name" />
                  <FieldError>{errors.name}</FieldError>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-medium text-slate-400">Email address *</span>
                  <input type="email" value={form.email} onChange={event => setField("email", event.target.value)} className={publicInputClass} placeholder="you@example.com" autoComplete="email" />
                  <FieldError>{errors.email}</FieldError>
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-[11px] font-medium text-slate-400">Phone number *</span>
                  <input type="tel" value={form.phone} onChange={event => setField("phone", event.target.value)} className={publicInputClass} placeholder="+44 7700 900000" autoComplete="tel" />
                  <FieldError>{errors.phone}</FieldError>
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold text-white">Links</legend>
              <p className="mt-1 text-[11px] text-slate-500">All optional, but they help us understand your work.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-medium text-slate-400">LinkedIn</span>
                  <input value={form.linkedinUrl} onChange={event => setField("linkedinUrl", event.target.value)} className={publicInputClass} placeholder="https://linkedin.com/in/…" />
                  <FieldError>{errors.linkedinUrl}</FieldError>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-medium text-slate-400">GitHub</span>
                  <input value={form.githubUrl} onChange={event => setField("githubUrl", event.target.value)} className={publicInputClass} placeholder="https://github.com/…" />
                  <FieldError>{errors.githubUrl}</FieldError>
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-[11px] font-medium text-slate-400">Portfolio or personal site</span>
                  <input value={form.portfolioUrl} onChange={event => setField("portfolioUrl", event.target.value)} className={publicInputClass} placeholder="https://your-work.example" />
                  <FieldError>{errors.portfolioUrl}</FieldError>
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold text-white">CV</legend>
              <p className="mt-1 text-[11px] text-slate-500">PDF, DOC, or DOCX · maximum 5 MB. {isDatabase ? "The file is uploaded to private storage after validation." : "The file stays in your browser."}</p>
              <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onFile} className="sr-only" aria-label="Upload CV" />

              {file ? (
                <div className="mt-3 rounded-xl border border-mint/15 bg-mint/[0.035] p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-mint/20 bg-mint/[0.08] text-mint">
                      <FileText size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-white">{file.name}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{formatFileSize(file.size)} · {isDatabase ? "ready to upload securely" : "selected locally, not uploaded"}</p>
                    </div>
                    <button type="button" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-rose-200" aria-label="Remove CV">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={previewFile} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-1.5 text-[10px] font-medium text-slate-300 transition hover:border-white/20 hover:text-white">
                      <FileText size={11} /> Preview
                    </button>
                    <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-1.5 text-[10px] font-medium text-slate-300 transition hover:border-white/20 hover:text-white">
                      <Upload size={11} /> Replace
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => inputRef.current?.click()} className="mt-3 flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.15] bg-white/[0.015] px-4 py-8 transition hover:border-violet/30 hover:bg-violet/[0.025]">
                  <span className="grid h-9 w-9 place-items-center rounded-full border border-white/[0.09] bg-white/[0.03] text-slate-400"><Paperclip size={15} /></span>
                  <span className="mt-3 text-xs font-medium text-slate-300">Choose your CV</span>
                  <span className="mt-1 text-[10px] text-slate-600">PDF, DOC, or DOCX up to 5 MB</span>
                </button>
              )}
              <FieldError>{fileError}</FieldError>
            </fieldset>

            <label className="block">
              <span className="mb-1.5 flex items-center justify-between gap-3 text-[11px] font-medium text-slate-400"><span>Why this role? *</span><span className="font-mono text-[9px] text-slate-600">{form.coverLetter.length} characters</span></span>
              <textarea value={form.coverLetter} onChange={event => setField("coverLetter", event.target.value)} rows={6} className={`${publicInputClass} min-h-[150px] resize-y leading-6`} placeholder="A short note about the work you want to do and the context you would bring…" />
              <FieldError>{errors.coverLetter}</FieldError>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <input type="checkbox" checked={form.consent} onChange={event => setField("consent", event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-mint" />
              <span className="text-[11px] leading-5 text-slate-400">
                {isDatabase
                  ? "I consent to this hiring team storing my application details and CV for recruitment review. I understand that email delivery and interview scheduling are not yet connected. *"
                  : "I understand this is a demo application. My details will appear only in this browser session's demo workspace, and no CV, email, or application is transmitted to Nexora Labs or stored on a server. *"}
              </span>
            </label>
            <FieldError>{errors.consent}</FieldError>
            {submitError && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/[0.05] px-3 py-2 text-[11px] text-rose-200">{submitError}</p>}

            <div className="flex flex-col-reverse gap-3 border-t border-white/[0.07] pt-6 sm:flex-row sm:items-center sm:justify-between">
              <Link href={`/careers/jobs/${job.id}`} className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-white"><ArrowLeft size={12} /> Cancel</Link>
              <button type="submit" disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? <><Loader2 size={14} className="animate-spin" /> {isDatabase ? "Submitting securely…" : "Submitting demo…"}</> : <>Submit application</>}
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.022] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">What happens next</p>
            <div className="mt-4 space-y-4">
              {(isDatabase ? [
                ["Application received", "The hiring team receives your application and private CV reference immediately."],
                ["Human review", "A recruiter reviews your CV and context. No automated rejection."],
                ["Interview", "Selected candidates are invited to an adaptive voice conversation."]
              ] : [
                ["Application received", "The demo workspace updates immediately so you can explore the recruiter side."],
                ["Human review", "In the future, a recruiter reviews your CV and context. No automated rejection."],
                ["Interview", "Selected candidates are invited to an adaptive voice conversation."]
              ]).map(([title, text], index) => (
                <div key={title} className="flex gap-3">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/[0.05] font-mono text-[8px] text-slate-500">{index + 1}</span>
                  <div>
                    <p className="text-[11px] font-medium text-slate-300">{title}</p>
                    <p className="mt-1 text-[10px] leading-4 text-slate-600">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.018] p-4">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-mint/70" />
              <p className="text-[10px] leading-5 text-slate-500">
                {isDatabase
                  ? "No candidate account is required. Do not include passwords, government identifiers, or other unnecessary sensitive data."
                  : "No account is required. Do not include passwords, government identifiers, or other sensitive data in this demo."}
              </p>
            </div>
          </div>
        </aside>
      </div>

      <Modal
        open={previewOpen}
        onClose={closePreview}
        title={file?.name ?? "CV preview"}
        description="Local browser preview · not uploaded anywhere"
        size="xl"
        footer={<button type="button" onClick={closePreview} className="inline-flex items-center gap-2 rounded-xl bg-mint px-4 py-2.5 text-sm font-semibold text-ink"><X size={13} /> Close preview</button>}
      >
        {previewUrl ? (
          <iframe title="CV preview" src={`${previewUrl}#toolbar=0&navpanes=0`} className="h-[64vh] w-full rounded-xl border border-white/[0.08] bg-white" />
        ) : (
          <p className="text-sm text-slate-500">Preview unavailable.</p>
        )}
      </Modal>
    </main>
  );
}
