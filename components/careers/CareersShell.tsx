"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";

const links = [
  { label: "Open roles", href: "/careers#open-roles" },
  { label: "How we hire", href: "/careers#how-we-hire" },
  { label: "Interview demo", href: "/demo" }
];

export function CareersHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-ink/85 backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] w-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Link href="/careers" className="group flex items-center gap-2" onClick={() => setOpen(false)}>
          <span className="text-[21px] font-semibold tracking-[-0.04em] text-white">nexora</span>
          <span className="mt-[-12px] h-1.5 w-1.5 rounded-full bg-violet" />
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-white/[0.09] bg-white/[0.03] px-1.5 py-1.5 md:flex">
          {links.map(link => (
            <Link key={link.href} href={link.href} className="rounded-full px-4 py-2 text-[12px] font-medium text-slate-400 transition hover:bg-white/[0.05] hover:text-white">
              {link.label}
            </Link>
          ))}
          <Link href="/hr/login" className="rounded-full px-4 py-2 text-[12px] font-medium text-slate-400 transition hover:bg-white/[0.05] hover:text-white">
            Talent portal
          </Link>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/careers#open-roles" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[12px] font-semibold text-ink transition hover:bg-slate-100">
            View open roles

          </Link>
        </div>

        <button className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.1] bg-white/[0.03] text-slate-300 md:hidden" onClick={() => setOpen(value => !value)} aria-label="Toggle navigation">
          {open ? <X size={17} /> : <Menu size={17} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/[0.07] bg-ink px-4 py-4 md:hidden">
          <div className="space-y-1">
            {[...links, { label: "Talent portal", href: "/hr/login" }].map(link => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-white/[0.04] hover:text-white">
                {link.label}
              </Link>
            ))}
            <Link href="/careers#open-roles" onClick={() => setOpen(false)} className={cn("mt-2 flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-ink")}>
              View open roles

            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

export function CareersFooter() {
  return (
    <footer className="border-t border-white/[0.07] bg-ink">
      <div className="mx-auto grid w-full max-w-[1440px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr] lg:px-10">
        <div>
          <Link href="/careers" className="inline-flex items-center gap-2">
            <span className="text-xl font-semibold tracking-[-0.04em] text-white">nexora</span>
            <span className="mt-[-10px] h-1.5 w-1.5 rounded-full bg-violet" />
          </Link>
          <p className="mt-3 max-w-sm text-xs leading-5 text-slate-500">
            Nexora Labs builds high-performance data and AI primitives for mission-critical systems. We are hiring thoughtful people to help shape what comes next.
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Careers</p>
          <div className="mt-3 space-y-2 text-xs text-slate-500">
            <Link href="/careers#open-roles" className="block transition hover:text-white">Open roles</Link>
            <Link href="/careers#how-we-hire" className="block transition hover:text-white">How we hire</Link>
            <Link href="/demo" className="block transition hover:text-white">Interview demo</Link>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">For hiring teams</p>
          <div className="mt-3 space-y-2 text-xs text-slate-500">
            <Link href="/hr/login" className="block transition hover:text-white">EchoPanel talent portal</Link>
            <Link href="/" className="block transition hover:text-white">EchoPanel interview engine</Link>
            <span className="block text-slate-600">Demo experience · no live email delivery</span>
          </div>
        </div>
      </div>
      <div className="border-t border-white/[0.05] px-4 py-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col justify-between gap-2 text-[10px] text-slate-600 sm:flex-row">
          <span>© 2026 Nexora Labs. Frontend demonstration.</span>
          <span>All roles, candidates, and activity shown are fictional demo data.</span>
        </div>
      </div>
    </footer>
  );
}
