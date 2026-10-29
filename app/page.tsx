import Link from "next/link";
import { BrandLockup } from "@/components/BrandMark";
import { EchoRings } from "@/components/landing/EchoRings";
import { INTERVIEWERS } from "@/components/PanelTrio";

const steps = [
  { title: "Apply", text: "Candidates apply on a careers page that explains the role and the interview up front." },
  { title: "Meet the panel", text: "A live voice interview with three AI interviewers who take turns, listen and follow up." },
  { title: "Review the evidence", text: "Recruiters see each judgement tied to what the candidate actually said, then decide." }
];

export default function Home() {
  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-ink">
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Link href="/" aria-label="EchoPanel home"><BrandLockup /></Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <Link href="/careers" className="rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:text-white">Open roles</Link>
          <Link href="/demo" className="hidden rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:text-white sm:inline-block">Demo</Link>
          <Link href="/hr/login" className="rounded-lg border border-white/15 px-3.5 py-2 text-sm font-medium text-white transition hover:border-white/35">Recruiter login</Link>
        </div>
      </nav>

      <section className="mx-auto grid max-w-7xl items-center gap-6 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:gap-10 lg:pb-24 lg:pt-12">
        <div>
          <p className="rise text-[15px] font-medium text-slate-400" style={{ ["--d" as string]: "80ms" }}>Live AI voice interviews for Nexora Labs</p>
          <h1
            className="rise mt-4 text-[clamp(52px,9vw,112px)] font-semibold leading-[0.92] text-white"
            style={{ ["--d" as string]: "160ms", fontVariationSettings: '"wdth" 76, "opsz" 96' }}
          >
            The panel
            <br />
            <span style={{ fontVariationSettings: '"wdth" 100, "opsz" 96' }}>speaks.</span>
          </h1>
          <p className="rise mt-6 max-w-[520px] text-[17px] leading-8 text-slate-300" style={{ ["--d" as string]: "320ms" }}>
            Every interview is run by three interviewers, technical, product and behavioural, who take turns asking and listening. Your team gets evidence, not just a score.
          </p>
          <div className="rise mt-8 flex flex-wrap gap-3" style={{ ["--d" as string]: "440ms" }}>
            <Link href="/hr/login" className="rounded-xl bg-mint px-6 py-3.5 text-[15px] font-semibold text-ink transition hover:bg-mint-hover">Recruiter login</Link>
            <Link href="/careers" className="rounded-xl border border-white/20 px-6 py-3.5 text-[15px] font-semibold text-white transition hover:border-white/45">See open roles</Link>
          </div>
        </div>

        <div className="rise relative" style={{ ["--d" as string]: "0ms" }}>
          <EchoRings className="mx-auto block aspect-square w-full max-w-[560px]" />
          <ul className="mx-auto -mt-12 flex max-w-[560px] flex-wrap justify-center gap-x-6 gap-y-2" aria-label="The interview panel">
            {INTERVIEWERS.map(item => (
              <li key={item.id} className="flex items-center gap-2 text-sm text-slate-300">
                <span aria-hidden="true" className="h-3 w-3 rounded-full border-[2.5px]" style={{ borderColor: item.color }} />
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-white/10 bg-card/40">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:py-20">
          <h2 className="max-w-xl text-[clamp(28px,4vw,40px)] font-semibold leading-tight text-white">From application to decision, in three steps.</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-10">
            {steps.map((step, index) => (
              <li key={step.title} className="border-t border-white/15 pt-5">
                <span className="font-display text-[15px] font-semibold text-slate-500">0{index + 1}</span>
                <h3 className="mt-2 text-lg font-semibold text-white">{step.title}</h3>
                <p className="mt-2 max-w-sm text-[15px] leading-7 text-slate-400">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-4 py-7 text-[13px] text-slate-500 sm:flex-row sm:items-center sm:px-6">
          <p>Nexora Labs is a fictional demo company. All candidate records are fictional.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/careers" className="hover:text-white">Careers</Link>
            <Link href="/hr/login" className="hover:text-white">Recruiter portal</Link>
            <Link href="/demo" className="hover:text-white">Demo</Link>
            <Link href="/setup" className="hover:text-white">Practice interview</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
