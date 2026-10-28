"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Eye, Loader2, Save, Send } from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { useToast } from "@/components/ToastProvider";
import { JobPreview } from "@/components/hr/JobPreview";
import { Badge, DemoBanner, Modal, PageHeader } from "@/components/ui";
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

export function JobEditor({ job }: { job?: Job }) {
  const router = useRouter();
  const store = useDemoData();
  const { toast } = useToast();
  const [form, setForm] = useState<NewJobInput>(() => fromJob(job));
  const [responsibilities, setResponsibilities] = useState(form.responsibilities.join("\n"));
  const [qualifications, setQualifications] = useState(form.qualifications.join("\n"));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

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
    await new Promise(resolve => window.setTimeout(resolve, 500));
    const payload: NewJobInput = {
      ...form,
      responsibilities: responsibilities.split("\n").map(item => item.trim()).filter(Boolean),
      qualifications: qualifications.split("\n").map(item => item.trim()).filter(Boolean),
      status: status ?? form.status,
      publicVisible: (status ?? form.status) === "Published" ? true : form.publicVisible
    };
    if (job) {
      store.updateJob(job.id, payload);
      toast(status === "Published" ? "Demo job published to the public careers site." : "Demo job changes saved.");
      router.push(`/hr/jobs/${job.id}`);
    } else {
      const created = store.createJob(payload);
      toast(status === "Published" ? "Demo job published to the public careers site." : "Demo job saved as a draft.");
      router.push(`/hr/jobs/${created.id}`);
    }
    setSaving(false);
  };

  const previewJob: NewJobInput = {
    ...form,
    responsibilities: responsibilities.split("\n").map(item => item.trim()).filter(Boolean),
    qualifications: qualifications.split("\n").map(item => item.trim()).filter(Boolean)
  };

  return (
    <div className="space-y-5">
      <Link href={job ? `/hr/jobs/${job.id}` : "/hr/jobs"} className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500 transition hover:text-white">
        <ArrowLeft size={12} /> {job ? "Back to job" : "Back to jobs"}
      </Link>
      <PageHeader
        eyebrow={job ? "Edit job posting" : "New job posting"}
        title={job ? job.title : "Create a role"}
        description="Define the public role and internal publishing state. Changes are held in the frontend demo workspace."
        actions={<Badge tone={job?.status === "Published" ? "mint" : "amber"}>{statusLabel(statusPreview(job, form))}</Badge>}
      />

      <DemoBanner compact>Publishing updates the public careers demo immediately. Job records are stored in browser memory only and reset on refresh.</DemoBanner>

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
                <input value={form.salaryRange} onChange={event => setField("salaryRange", event.target.value)} className={inputClass} placeholder="£115,000 – £145,000" />
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
                <textarea value={responsibilities} onChange={event => setResponsibilities(event.target.value)} rows={5} className={`${inputClass} resize-y leading-6`} placeholder={"Lead the design of…\nPartner with…\nImprove…"} />
                {errors.responsibilities && <p className="mt-1 text-[10px] text-rose-200">{errors.responsibilities}</p>}
              </label>
              <label className="block">
                <span className={labelClass}>Qualifications * <span className="normal-case tracking-normal text-slate-600">— one per line</span></span>
                <textarea value={qualifications} onChange={event => setQualifications(event.target.value)} rows={5} className={`${inputClass} resize-y leading-6`} placeholder={"5+ years of…\nExperience with…\nClear communication…"} />
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
              <div className="flex items-center justify-between gap-2 text-[10px]"><span className="text-slate-500">Current state</span><Badge tone={job?.status === "Published" ? "mint" : job?.status === "Closed" ? "slate" : "amber"}>{statusPreview(job, form)}</Badge></div>
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
              <p>· Clear role title and location</p>
              <p>· Specific responsibilities</p>
              <p>· Transparent salary range</p>
              <p>· Public visibility enabled</p>
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

function statusLabel(status: JobStatus) {
  return status === "Published" ? "Published" : status === "Closed" ? "Closed" : "Draft";
}
