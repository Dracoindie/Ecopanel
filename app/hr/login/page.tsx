"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck
} from "lucide-react";
import { useIsDatabaseMode } from "@/components/AppModeProvider";
import { BrandLockup } from "@/components/BrandMark";
import { PanelTrio } from "@/components/PanelTrio";
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
    <main className="theme-light relative flex min-h-screen overflow-hidden">
      <section className="relative z-10 flex w-full flex-col px-5 py-6 sm:px-10 lg:w-[54%] lg:px-16 xl:px-24">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <BrandLockup subtitle="Nexora Labs · Hiring" />
          </Link>
          <Link href="/careers" className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 transition hover:text-white">
            <ArrowLeft size={11} /> Careers
          </Link>
        </div>

        <div className="my-auto py-12">
          <div className="mx-auto w-full max-w-[390px]">
            <p className="text-[13px] font-medium text-slate-500">{isDatabase ? "Recruiter workspace" : "Demo workspace"}</p>
            <h1 className="mt-2 text-[40px] font-semibold leading-[1.02] text-white">Welcome back.</h1>
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
                  <input type="checkbox" defaultChecked className="h-3.5 w-3.5 accent-mint" />
                  Keep me signed in
                </label>
                {isDatabase ? (
                  <span className="text-[10px] text-slate-600">Contact your workspace owner to reset access.</span>
                ) : (
                  <Link href="/hr/forgot-password" className="text-[10px] font-medium text-slate-400 transition hover:text-white">Forgot password?</Link>
                )}
              </div>

              <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-mint px-4 py-3 text-sm font-semibold text-ink transition hover:bg-mint-hover disabled:opacity-60">
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> {isDatabase ? "Verifying…" : "Opening demo workspace…"}</>
                  : <>{isDatabase ? "Sign in" : "Continue to demo workspace"}</>}
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

      <section className="theme-dark relative hidden flex-1 items-center justify-center bg-ink p-12 lg:flex">
        <div className="relative w-full max-w-[460px]">
          <PanelTrio />
          <h2 className="mt-10 text-[44px] font-semibold leading-[1.02] text-white" style={{ fontVariationSettings: '"wdth" 82' }}>
            Three interviewers. One clear hiring decision.
          </h2>
          <p className="mt-4 max-w-sm text-[15px] leading-7 text-slate-400">
            Every live interview is run by a technical, a product and a behavioural interviewer. Their evidence lands here, ready for your review.
          </p>
        </div>
      </section>
    </main>
  );
}
