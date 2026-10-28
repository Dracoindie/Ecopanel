"use client";

import { MapPin, Clock3 } from "lucide-react";
import type { NewJobInput } from "@/lib/domain";

export function JobPreview({ job }: { job: NewJobInput }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#060910]">
      <div className="border-b border-white/[0.07] bg-[#070b12] px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-[-0.03em] text-white">nexora</span>
          <span className="mt-[-6px] h-1 w-1 rounded-full bg-violet" />
          <span className="ml-auto text-[8px] uppercase tracking-[0.14em] text-slate-600">Public preview · demo</span>
        </div>
      </div>
      <div className="px-5 py-7 sm:px-8">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full border border-violet/25 bg-violet/[0.08] px-2.5 py-1 text-[8px] font-semibold uppercase tracking-wide text-violet-200">{job.department || "Department"}</span>
          <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[8px] text-slate-400">{job.workplace}</span>
          <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[8px] text-slate-400">{job.employmentType}</span>
        </div>
        <h2 className="font-display mt-4 text-3xl leading-[1.02] tracking-[-0.035em] text-white sm:text-4xl">{job.title || "Untitled role"}</h2>
        <p className="mt-3 text-xs leading-5 text-slate-400">{job.shortDescription || "Add a short description to show candidates what this role is about."}</p>
        <div className="mt-4 flex flex-wrap gap-4 text-[9px] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><MapPin size={10} /> {job.location || "Location"} · {job.workplace}</span>
          <span className="inline-flex items-center gap-1.5"><Clock3 size={10} /> {job.salaryRange || "Salary not set"}</span>
        </div>
        <div className="mt-6 border-t border-white/[0.06] pt-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">About the role</p>
          <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-slate-400">{job.description || "Job description will appear here."}</p>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">Responsibilities</p>
            <div className="mt-2 space-y-1.5">
              {job.responsibilities.filter(Boolean).length ? job.responsibilities.filter(Boolean).map(item => (
                <p key={item} className="flex gap-2 text-[10px] leading-4 text-slate-500"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-300/70" /> {item}</p>
              )) : <p className="text-[10px] text-slate-700">No responsibilities added.</p>}
            </div>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">Qualifications</p>
            <div className="mt-2 space-y-1.5">
              {job.qualifications.filter(Boolean).length ? job.qualifications.filter(Boolean).map(item => (
                <p key={item} className="flex gap-2 text-[10px] leading-4 text-slate-500"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-mint/60" /> {item}</p>
              )) : <p className="text-[10px] text-slate-700">No qualifications added.</p>}
            </div>
          </div>
        </div>
        <div className="mt-7 flex items-center justify-between border-t border-white/[0.06] pt-4">
          <span className="text-[9px] text-slate-600">Nexora Labs · Careers</span>
          <span className={`rounded-full px-2.5 py-1 text-[8px] font-semibold ${job.publicVisible ? "bg-mint/10 text-mint" : "bg-amber-300/10 text-amber-200"}`}>{job.publicVisible ? "Public visibility on" : "Private preview"}</span>
        </div>
      </div>
    </div>
  );
}
