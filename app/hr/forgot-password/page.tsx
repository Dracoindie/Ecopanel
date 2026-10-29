"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { inputClass, labelClass } from "@/lib/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    await new Promise(resolve => window.setTimeout(resolve, 650));
    setLoading(false);
    setSent(true);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-5 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(156,140,255,.12),transparent_32%),radial-gradient(circle_at_80%_80%,rgba(124,245,197,.05),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-20" />
      <div className="relative z-10 w-full max-w-[440px]">
        <Link href="/hr/login" className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 transition hover:text-white">
          <ArrowLeft size={11} /> Back to sign in
        </Link>
        <div className="mt-6 rounded-3xl border border-white/[0.08] bg-ink/90 p-6 shadow-2xl backdrop-blur sm:p-8">
          {sent ? (
            <div>
              <span className="grid h-11 w-11 place-items-center rounded-2xl border border-mint/20 bg-mint/[0.06] text-mint"><CheckCircle2 size={18} /></span>
              <h1 className="mt-5 text-2xl font-semibold text-white">Reset request noted.</h1>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                In a connected product, a reset link would be sent to <span className="text-slate-300">{email}</span>. This demo has not sent an email and has not created a reset token.
              </p>
              <Link href="/hr/login" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-mint px-4 py-2.5 text-sm font-semibold text-ink">
                Return to demo sign in
              </Link>
            </div>
          ) : (
            <>
              <span className="grid h-11 w-11 place-items-center rounded-2xl border border-violet/20 bg-violet/[0.08] text-violet-200"><Mail size={17} /></span>
              <h1 className="mt-5 text-2xl font-semibold text-white">Reset your password</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">Enter your work email. This demo only shows the recovery flow; no email is delivered.</p>
              <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
                <label className="block">
                  <span className={labelClass}>Work email</span>
                  <input type="email" value={email} onChange={event => { setEmail(event.target.value); setError(""); }} className={inputClass} placeholder="you@company.example" />
                </label>
                {error && <p className="text-[11px] text-rose-200">{error}</p>}
                <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-mint px-4 py-3 text-sm font-semibold text-ink disabled:opacity-60">
                  {loading ? <><Loader2 size={14} className="animate-spin" /> Preparing demo…</> : <>Continue</>}
                </button>
              </form>
            </>
          )}
          <p className="mt-6 flex items-start gap-2 border-t border-white/[0.06] pt-4 text-[9px] leading-4 text-slate-600">
            <ShieldCheck size={11} className="mt-0.5 shrink-0" /> Demo only. No password reset, identity lookup, or email delivery occurs.
          </p>
        </div>
      </div>
    </main>
  );
}
