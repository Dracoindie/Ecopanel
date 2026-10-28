"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Eye, Loader2, Save, Send } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { JobPreview } from "@/components/hr/JobPreview";
import { Badge, Modal, PageHeader } from "@/components/ui";
import type { EmploymentType, Job, JobStatus, NewJobInput, Workplace } from "@/lib/domain";
import { inputClass, labelClass, primaryButton, secondaryButton, selectClass } from "@/lib/ui";

const employmentTypes: EmploymentType[] = ["Full-time", "Contract", "Part-time", "Internship"];
const workplaces: Workplace[] = ["Remote", "Hybrid", "On-site"];
const departments = ["Engineering", "AI & Research", "Design", "Product", "People", "Customer Success"];

function fromJob(job?: Job): NewJobInput {
  return {
    title: job?.title ?? "",
    department: job?.department ?? "Engineering",
    location: job?.location ?? "",
    workplace: job?.workplace ?? "Hybrid",
    employmentType: job?.employmentType ?? "Full-time",
    shortDescription: job?.shortDescription ?? "",
    description: job?.description ?? "",
    responsibilities: job?.responsibilities ?? [],
    qualifications: job?.qualifications ?? [],
    salaryRange: job?.salaryRange ?? "",
    status: job?.status ?? "Draft",
    publicVisible: job?.publicVisible ?? false
  };
}

export function DatabaseJobEditor({ jobId }: { jobId?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [job, setJob] = useState<Job | undefined>();
  const [form, setForm] = useState<NewJobInput>(() => fromJob());
  const [responsibilities, setResponsibilities] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(jobId));
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    setLoading(true);
    fetch(`/api/hr/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" })
      .then(async response => {
        const body = await response.json() as { job?: Job; error?: string };
        if (!response.ok || !body.job) throw new Error(body.error || "Job not found.");
        if (!active) return;
        setJob(body.job);
        setForm(fromJob(body.job));
        setResponsibilities(body.job.responsibilities.join("\n"));
        setQualifications(body.job.qualifications.join("\n"));
      })
      .catch(error => {
        if (active) setLoadError(error instanceof Error ? error.message : "Job not found.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [jobId]);

  const setField = <K extends keyof NewJobInput>(key: K, value: NewJobInput[K]) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (form.title.trim().length < 3) next.title = "Enter a role title.";
    if (!form.department) next.department = "Choose a department.";
    if (!form.location.trim()) next.location = "Enter a location.";
    if (form.shortDescription.trim().length < 20) next.shortDescription = "Add a short summary of at least 20 characters.";
    if (form.description.trim().length < 80) next.description = "Add a fuller role description (at least 80 characters).";
    if (!form.salaryRange.trim()) next.salaryRange = "Add a salary range or compensation note.";
    if (responsibilities.split("\n").filter(item => item.trim()).length === 0) next.responsibilities = "Add at least one responsibility.";
    if (qualifications.split("\n").filter(item => item.trim()).length === 0) next.qualifications = "Add at least one qualification.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const persist = async (status?: JobStatus) => {
    if (!validate()) {
      toast("Check the highlighted role fields.", "error");
      return;
    }
    setSaving(true);
    const nextStatus = status ?? form.status;
    const payload: NewJobInput = {
      ...form,
      responsibilities: responsibilities.split("\n").map(item => item.trim()).filter(Boolean),
      qualifications: qualifications.split("\n").map(item => item.trim()).filter(Boolean),
      status: nextStatus,
      publicVisible: nextStatus === "Published" ? true : form.publicVisible
    };
    try {
      const response = await fetch(jobId ? `/api/hr/jobs/${encodeURIComponent(jobId)}` : "/api/hr/jobs", {
        method: jobId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json() as { job?: Job; error?: string };
      if (!response.ok || !body.job) throw new Error(body.error || "The job could not be saved.");
      toast(nextStatus === "Published" ? "Job published. It is now visible on the public careers site." : "Job saved to the database.");
      router.push(`/hr/jobs/${body.job.id}`);
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "The job could not be saved.", "error");
      setSaving(false);
    }
  };

  const previewJob: NewJobInput = {
    ...form,
    responsibilities: responsibilities.split("\n").map(item => item.trim()).filter(Boolean),
    qualifications: qualifications.split("\n").map(item => item.trim()).filter(Boolean)
  };

  if (loading) {
    return <div className="space-y-4"><div className="h-8 w-48 animate-pulse rounded-lg bg-white/[0.04]" /><div className="h-[520px] animate-pulse rounded-2xl bg-white/[0.025]" /></div>;
  }

  if (loadError) {
    return <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[0.04] p-5 text-sm text-rose-200">{loadError}</div>;
  }

  return (
    <div className="space-y-5">
      <Link href={job ? `/hr/jobs/${job.id}` : "/hr/jobs"} className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 transition hover:text-white">
        <ArrowLeft size={12} /> {job ? "Back to job" : "Back to jobs"}
      </Link>
      <PageHeader
        eyebrow={job ? "Edit job posting" : "New job posting"}
        title={job ? job.title : "Create a role"}
        description="Define the public role and internal publishing state. Changes are saved to the recruitment database."
        actions={<Badge tone={statusPreview(job, form) === "Published" ? "mint" : "amber"}>{statusPreview(job, form)}</Badge>}
      />

      <div className="rounded-xl border border-mint/15 bg-mint/[0.035] px-4 py-3 text-[10px] leading-5 text-mint/80">
        This role is stored in PostgreSQL. Publishing makes it available on the public careers site immediately.
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
            <h2 className="text-sm font-semibold text-white">Role essentials</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className={labelClass}>Job title *</span>
                <input value={form.title} onChange={event => setField("title", event.target.value)} className={inputClass} placeholder="e.g. Staff Backend Engineer" />
                {errors.title && <p className="mt-1 text-[10px] text-rose-200">{errors.title}</p>}
              </label>
              <label className="block">
                <span className={labelClass}>Department *</span>
                <select value={form.department} onChange={event => setField("department", event.target.value)} className={selectClass}>
                  {departments.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={labelClass}>Location *</span>
                <input value={form.location} onChange={event => setField("location", event.target.value)} className={inputClass} placeholder="London" />
                {errors.location && <p className="mt-1 text-[10px] text-rose-200">{errors.location}</p>}
              </label>
              <label className="block">
                <span className={labelClass}>Workplace</span>
                <select value={form.workplace} onChange={event => setField("workplace", event.target.value as Workplace)} className={selectClass}>
                  {workplaces.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={labelClass}>Employment type</span>
                <select value={form.employmentType} onChange={event => setField("employmentType", event.target.value as EmploymentType)} className={selectClass}>
                  {employmentTypes.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClass}>Salary range *</span>
                <input value={form.salaryRange} onChange={event => setField("salaryRange", event.target.value)} className={inputClass} placeholder="Competitive / range" />
                {errors.salaryRange && <p className="mt-1 text-[10px] text-rose-200">{errors.salaryRange}</p>}
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
            <h2 className="text-sm font-semibold text-white">Public role copy</h2>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className={labelClass}>Short description *</span>
                <textarea value={form.shortDescription} onChange={event => setField("shortDescription", event.target.value)} rows={2} className={`${inputClass} resize-y`} placeholder="One sentence that explains the opportunity." />
                <div className="mt-1 flex justify-between gap-2"><span className="text-[9px] text-slate-600">Shown on the careers listing.</span><span className="text-[9px] text-slate-600">{form.shortDescription.length} chars</span></div>
                {errors.shortDescription && <p className="mt-1 text-[10px] text-rose-200">{errors.shortDescription}</p>}
              </label>
              <label className="block">
                <span className={labelClass}>Full description *</span>
                <textarea value={form.description} onChange={event => setField("description", event.target.value)} rows={6} className={`${inputClass} resize-y leading-6`} placeholder="Describe the team, the problem, and why this role matters." />
                {errors.description && <p className="mt-1 text-[10px] text-rose-200">{errors.description}</p>}
              </label>
              <label className="block">
                <span className={labelClass}>Responsibilities * <span className="normal-case tracking-normal text-slate-600">— one per line</span></span>
                <textarea value={responsibilities} onChange={event => setResponsibilities(event.target.value)} rows={5} className={`${inputClass} resize-y leading-6`} />
                {errors.responsibilities && <p className="mt-1 text-[10px] text-rose-200">{errors.responsibilities}</p>}
              </label>
              <label className="block">
                <span className={labelClass}>Qualifications * <span className="normal-case tracking-normal text-slate-600">— one per line</span></span>
                <textarea value={qualifications} onChange={event => setQualifications(event.target.value)} rows={5} className={`${inputClass} resize-y leading-6`} />
                {errors.qualifications && <p className="mt-1 text-[10px] text-rose-200">{errors.qualifications}</p>}
              </label>
            </div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <section className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/80 p-5">
            <h2 className="text-sm font-semibold text-white">Publication</h2>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">Control whether the role is visible on the public careers site.</p>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-3.5">
              <input type="checkbox" checked={form.publicVisible} onChange={event => setField("publicVisible", event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#7cf5c5]" />
              <span>
                <span className="block text-[11px] font-medium text-slate-300">Public visibility</span>
                <span className="mt-1 block text-[9px] leading-4 text-slate-600">When published, candidates can find this role at /careers.</span>
              </span>
            </label>
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/10 p-3.5">
              <div className="flex items-center justify-between gap-2 text-[10px]"><span className="text-slate-500">Current state</span><Badge tone={statusPreview(job, form) === "Published" ? "mint" : statusPreview(job, form) === "Closed" ? "slate" : "amber"}>{statusPreview(job, form)}</Badge></div>
              <p className="mt-2 text-[9px] leading-4 text-slate-600">{job?.publishedAt ? `First published ${job.publishedAt.slice(0, 10)}` : "Not yet published."}</p>
            </div>
            <div className="mt-4 space-y-2">
              <button onClick={() => persist()} disabled={saving} className={`${secondaryButton} w-full`}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {job ? "Save changes" : "Save as draft"}
              </button>
              <button onClick={() => persist("Published")} disabled={saving} className={`${primaryButton} w-full`}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                {job?.status === "Published" ? "Save & keep published" : "Publish role"}
              </button>
              <button onClick={() => setPreviewOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium text-slate-500 transition hover:bg-white/[0.04] hover:text-white">
                <Eye size={13} /> Preview public role
              </button>
            </div>
          </section>
          <div className="rounded-2xl border border-white/[0.07] bg-[#0a111e]/50 p-4">
            <p className="text-[10px] font-semibold text-slate-300">Publishing checklist</p>
            <div className="mt-2 space-y-1.5 text-[9px] text-slate-600">
              <p>• Clear role title and location</p>
              <p>• Specific responsibilities</p>
              <p>• Transparent salary range</p>
              <p>• Public visibility enabled</p>
            </div>
          </div>
        </aside>
      </div>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Public role preview" description="This is how the role will appear on the careers site." size="lg" footer={<button onClick={() => setPreviewOpen(false)} className={secondaryButton}>Close preview</button>}>
        <JobPreview job={previewJob} />
      </Modal>
    </div>
  );
}

function statusPreview(job: Job | undefined, form: NewJobInput) {
  return job?.status ?? form.status;
}
