"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  Users
} from "lucide-react";
import { useIsDatabaseMode } from "@/components/AppModeProvider";
import { authClient } from "@/lib/auth-client";
import { inputClass, labelClass } from "@/lib/ui";

export default function HrLoginPage() {
  const router = useRouter();
  const isDatabase = useIsDatabaseMode();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (!isDatabase && password.length < 6) {
      setError("Enter at least 6 characters. This demo does not validate real credentials.");
      return;
    }
    if (isDatabase && !password) {
      setError("Enter your password.");
      return;
    }
    setLoading(true);
    if (!isDatabase) {
      await new Promise(resolve => window.setTimeout(resolve, 650));
      router.push("/hr");
      return;
    }
    const result = await authClient.signIn.email({
      email: email.trim(),
      password,
      rememberMe: true
    });
    if (result.error) {
      setError(result.error.message || "Those credentials could not be verified.");
      setLoading(false);
      return;
    }
    router.replace("/hr");
    router.refresh();
  };

  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#05070b]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(156,140,255,.11),transparent_30%),radial-gradient(circle_at_84%_74%,rgba(124,245,197,.055),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-20" />

      <section className="relative z-10 flex w-full flex-col px-5 py-6 sm:px-10 lg:w-[54%] lg:px-16 xl:px-24">
        <div className="flex items-center justify-between">
          <Link href="/careers" className="inline-flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl border border-violet/25 bg-violet/[0.12]">
              <span className="h-2 w-2 rounded-full border border-white/80 bg-violet" />
            </span>
            <span>
              <span className="block text-[12px] font-bold tracking-[0.1em] text-white">ECHOPANEL</span>
              <span className="block text-[8px] uppercase tracking-[0.18em] text-slate-600">Nexora Labs · Hiring</span>
            </span>
          </Link>
          <Link href="/careers" className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 transition hover:text-white">
            <ArrowLeft size={11} /> Careers
          </Link>
        </div>

        <div className="my-auto py-12">
          <div className="mx-auto w-full max-w-[390px]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/15 bg-amber-300/[0.05] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-amber-200/75">
              <Sparkles size={10} /> {isDatabase ? "Secure workspace" : "Demo workspace"}
            </span>
            <h1 className="mt-5 text-3xl font-semibold tracking-[-0.03em] text-white">Welcome back.</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {isDatabase
                ? "Sign in with your organization account. Sessions are verified on the server."
                : "Sign in to the EchoPanel recruiter workspace. This frontend demo does not perform real authentication."}
            </p>

            <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
              <label className="block">
                <span className={labelClass}>Work email</span>
                <div className="relative">
                  <Mail size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
                  <input
                    type="email"
                    value={email}
                    onChange={event => { setEmail(event.target.value); setError(""); }}
                    className={`${inputClass} pl-9`}
                    placeholder="you@company.example"
                    autoComplete="email"
                  />
                </div>
              </label>
              <label className="block">
                <span className={labelClass}>Password</span>
                <div className="relative">
                  <LockKeyhole size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={event => { setPassword(event.target.value); setError(""); }}
                    className={`${inputClass} pl-9 pr-10`}
                    placeholder={isDatabase ? "Your password" : "Any 6+ characters"}
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-600 transition hover:text-white" aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </label>

              {error && <p className="rounded-lg border border-rose-400/15 bg-rose-400/[0.04] px-3 py-2 text-[11px] text-rose-200">{error}</p>}

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-[10px] text-slate-500">
                  <input type="checkbox" defaultChecked className="h-3.5 w-3.5 accent-[#7cf5c5]" />
                  Keep me signed in
                </label>
                {isDatabase ? (
                  <span className="text-[10px] text-slate-600">Contact your workspace owner to reset access.</span>
                ) : (
                  <Link href="/hr/forgot-password" className="text-[10px] font-medium text-slate-400 transition hover:text-white">Forgot password?</Link>
                )}
              </div>

              <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-mint px-4 py-3 text-sm font-semibold text-ink transition hover:bg-[#9bf8d5] disabled:opacity-60">
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> {isDatabase ? "Verifying…" : "Opening demo workspace…"}</>
                  : <>{isDatabase ? "Sign in" : "Continue to demo workspace"} <ArrowRight size={14} /></>}
              </button>
            </form>

            <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.022] p-3.5">
              <p className="text-[10px] font-semibold text-slate-300">{isDatabase ? "Organization access" : "Demo access"}</p>
              <p className="mt-1 text-[10px] leading-5 text-slate-500">
                {isDatabase
                  ? "Public sign-up is disabled. Accounts are provisioned by an administrator for a specific organization."
                  : "Use any email address and a password of 6 or more characters. Nothing is verified, stored, or sent."}
              </p>
            </div>

            <p className="mt-5 flex items-start gap-2 text-[9px] leading-4 text-slate-600">
              <ShieldCheck size={11} className="mt-0.5 shrink-0" />
              {isDatabase
                ? "Sessions are database-backed and checked again by server routes and the recruiter layout."
                : "This is not production authentication. Database mode uses Better Auth and server-side authorization."}
            </p>
          </div>
        </div>
      </section>

      <section className="relative hidden flex-1 items-center justify-center border-l border-white/[0.06] bg-[#080b11]/70 p-12 lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_55%_32%,rgba(156,140,255,.1),transparent_30%)]" />
        <div className="relative w-full max-w-[500px]">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600">Recruiter workspace</p>
          <h2 className="font-display mt-3 text-4xl leading-[1.03] tracking-[-0.035em] text-white">One calm place for the whole hiring story.</h2>
          <div className="mt-8 space-y-2.5">
            {[
              { icon: Users, label: "Applicant pipeline", value: "12 candidates · 6 stages" },
              { icon: CalendarDays, label: "Upcoming interviews", value: "4 scheduled sessions" },
              { icon: BriefcaseBusiness, label: "Active roles", value: "7 public openings" }
            ].map(item => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#0a0e15]/80 p-4 backdrop-blur">
                  <span className="grid h-9 w-9 place-items-center rounded-xl border border-violet/15 bg-violet/[0.08] text-violet-200"><Icon size={15} /></span>
                  <div>
                    <p className="text-[10px] text-slate-500">{item.label}</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-200">{item.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-7 rounded-2xl border border-mint/10 bg-mint/[0.025] p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-mint/70">Connected demo surface</p>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">Applicant changes, job edits, scheduling actions, and simulated email activity stay in sync across the demo workspace.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
