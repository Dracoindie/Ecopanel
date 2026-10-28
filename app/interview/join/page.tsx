"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, ShieldCheck, TriangleAlert } from "lucide-react";

const SETUP_KEY = "echopanel-interview-setup";

type Redeemed = {
  interview: { id: string; candidateName: string; jobTitle: string; jobDescription: string; experienceLevel?: string };
  expiresAt: string;
};

/**
 * Candidate entry point from an interview email. The one-time token lives in
 * the URL fragment, so it is never sent in a request line or logged; it is
 * removed from the address bar before anything else happens.
 */
export default function JoinInterview() {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<"redeeming" | "ready" | "error">("redeeming");
  const [error, setError] = useState("");
  const [joined, setJoined] = useState<Redeemed | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setError("This page needs the personal link from your interview email.");
      setState("error");
      return;
    }
    fetch("/api/candidate/invitations/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "This interview link could not be used.");
        return body as Redeemed;
      })
      .then(body => {
        setJoined(body);
        setState("ready");
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : "This interview link could not be used.");
        setState("error");
      });
  }, []);

  const enterRoom = () => {
    if (!joined) return;
    try {
      sessionStorage.setItem(SETUP_KEY, JSON.stringify({
        candidateName: joined.interview.candidateName,
        targetRole: joined.interview.jobTitle,
        jobDescription: joined.interview.jobDescription.slice(0, 4000),
        experienceLevel: joined.interview.experienceLevel || "Mid",
        panelMode: "Full Panel",
        duration: "20 min",
        interviewId: joined.interview.id,
        accessMode: "candidate"
      }));
    } catch {
      /* the live room falls back to defaults */
    }
    router.push("/live");
  };

  return (
    <main className="grid min-h-screen place-items-center bg-ink p-4">
      <section className="glass w-full max-w-md rounded-3xl p-7 text-center">
        <p className="text-xs font-bold tracking-[.2em] text-mint">ECHOPANEL INTERVIEW</p>
        {state === "redeeming" && <p className="mt-6 text-sm text-slate-400">Checking your interview link…</p>}
        {state === "error" && (
          <>
            <TriangleAlert className="mx-auto mt-6 text-amber-200" size={28} />
            <h1 className="mt-4 text-xl font-semibold">This link cannot be used</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">{error} Links work once and expire after 72 hours. Reply to your interview email to request a new one.</p>
          </>
        )}
        {state === "ready" && joined && (
          <>
            <ShieldCheck className="mx-auto mt-6 text-mint" size={30} />
            <h1 className="mt-4 text-xl font-semibold">Welcome, {joined.interview.candidateName}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Your {joined.interview.jobTitle} interview is ready. Find a quiet place and allow microphone access when your browser asks.
            </p>
            <button onClick={enterRoom} className="mx-auto mt-6 flex items-center gap-2 rounded-full bg-mint px-6 py-3 text-sm font-semibold text-ink">
              <Mic size={16} /> Enter interview room
            </button>
            <p className="mt-4 text-[11px] text-slate-500">This session ends when you finish the interview or after two hours.</p>
          </>
        )}
      </section>
    </main>
  );
}
