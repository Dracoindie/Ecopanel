import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  BrainCircuit,
  BriefcaseBusiness,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  Users
} from "lucide-react";

const capabilities = [
  { icon: AudioLines, title: "Voice-native interviews", text: "A real-time interview flow built around natural conversation, interruption, and shared context." },
  { icon: BrainCircuit, title: "Evidence-linked review", text: "Assessment dimensions connect back to interview evidence instead of producing a detached score." },
  { icon: ShieldCheck, title: "Candidate-owned results", text: "A privacy-preserving Interview Passport gives candidates control over what they share." }
];

const pathways = [
  { icon: BriefcaseBusiness, eyebrow: "For candidates", title: "Explore open roles", text: "Discover the team, the work, and a hiring process designed to be transparent.", href: "/careers", cta: "Browse careers" },
  { icon: Users, eyebrow: "For hiring teams", title: "Move candidates forward", text: "Review applications, coordinate interviews, and keep communication in one connected workspace.", href: "/hr/login", cta: "Open recruiter portal" },
  { icon: Sparkles, eyebrow: "Live product", title: "Experience the panel", text: "Try the existing interview experience with a guided demo session and candidate-owned results.", href: "/demo", cta: "View live demo" }
];

export default function Home() {
  return (
    <main className="gridline min-h-screen w-full overflow-hidden">
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-xl border border-violet/25 bg-gradient-to-br from-violet/[0.22] to-mint/[0.06]">
            <span className="h-2.5 w-2.5 rounded-full border border-white/80 bg-violet shadow-[0_0_10px_rgba(156,140,255,.8)]" />
          </span>
          <span className="text-sm font-bold tracking-[0.1em]">ECHO<span className="text-mint">PANEL</span></span>
        </Link>
        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
          <Link href="/careers" className="rounded-full px-3 py-2 text-xs text-slate-400 transition hover:text-white">Open roles</Link>
          <Link href="/demo" className="rounded-full px-3 py-2 text-xs text-slate-400 transition hover:text-white">Demo</Link>
          <Link href="/hr/login" className="rounded-full border border-white/[0.1] px-3.5 py-2 text-xs text-slate-300 transition hover:border-white/20 hover:text-white">Recruiter login</Link>
          <Link href="/setup" className="rounded-full bg-mint px-4 py-2 text-xs font-semibold text-ink transition hover:bg-[#9bf8d5]">Start interview</Link>
        </div>
      </nav>

      <section className="mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:pt-24">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-mint/15 bg-mint/[0.045] px-3 py-1.5 text-[10px] font-semibold text-mint">
            <span className="h-1.5 w-1.5 rounded-full bg-mint shadow-[0_0_8px_rgba(124,245,197,.8)]" />
            The interview intelligence layer for modern hiring
          </div>
          <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] md:text-7xl">
            Every conversation.
            <br />
            <span className="bg-gradient-to-r from-white via-slate-200 to-slate-500 bg-clip-text text-transparent">A clearer decision.</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-8 text-slate-400">
            One connected platform for candidate experience, recruiter operations, and evidence-linked interview review. Less noise between the application and the decision.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/careers" className="flex items-center gap-2 rounded-full bg-mint px-6 py-3 text-sm font-semibold text-ink">Explore careers <ArrowRight size={16} /></Link>
            <Link href="/setup" className="flex items-center gap-2 rounded-full border border-white/[0.12] px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/25">Start a demo interview</Link>
            <Link href="/hr/login" className="flex items-center gap-2 rounded-full px-4 py-3 text-sm text-slate-400 transition hover:text-white">Recruiter portal <ArrowRight size={14} /></Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[10px] text-slate-600">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={11} className="text-mint/70" /> Candidate-owned results</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={11} className="text-mint/70" /> Evidence, not black-box scores</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={11} className="text-mint/70" /> Demo workspace included</span>
          </div>
        </div>

        <div className="glass relative rounded-3xl p-5 shadow-glow sm:p-6">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
            <p className="text-[9px] font-bold tracking-[0.18em] text-slate-500">INTERVIEW WORKSPACE</p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/[0.08] px-2.5 py-1 text-[8px] font-semibold text-mint"><span className="h-1 w-1 rounded-full bg-mint" /> LIVE DEMO</span>
          </div>
          <div className="mt-5 rounded-2xl border border-mint/15 bg-mint/[0.025] p-5">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[8px] font-bold uppercase tracking-[0.15em] text-mint/60">Technical panel</p><p className="mt-2 text-lg font-medium text-white">System design under scale</p></div>
              <span className="grid h-9 w-9 place-items-center rounded-full border border-mint/20 bg-mint/[0.08] text-mint"><AudioLines size={16} /></span>
            </div>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full w-[64%] rounded-full bg-gradient-to-r from-mint/50 to-mint" /></div>
            <div className="mt-2 flex justify-between text-[8px] text-slate-600"><span>Listening · shared context</span><span>64% complete</span></div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-black/10 p-4">
              <p className="text-[8px] uppercase tracking-[0.12em] text-slate-600">Evidence strength</p>
              <p className="mt-2 text-sm font-semibold text-emerald-300">Supported</p>
              <p className="mt-1 text-[9px] leading-4 text-slate-500">Latency trade-offs and failure modes explained with concrete examples.</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/10 p-4">
              <p className="text-[8px] uppercase tracking-[0.12em] text-slate-600">Open question</p>
              <p className="mt-2 text-sm font-semibold text-amber-200">Business impact</p>
              <p className="mt-1 text-[9px] leading-4 text-slate-500">Still needs a measurable success metric.</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-violet/20 bg-violet/[0.06] p-4">
            <span className="h-2 w-2 rounded-full bg-violet shadow-[0_0_10px_rgba(156,140,255,.8)]" />
            <div><p className="text-[8px] font-bold uppercase tracking-[0.12em] text-violet-200/70">Next perspective</p><p className="mt-1 text-[10px] text-slate-300">Product · probe measurable customer impact</p></div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/[0.055] bg-[#070c16]/55">
        <div className="mx-auto grid max-w-7xl gap-px px-6 md:grid-cols-3">
          {capabilities.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="py-8 md:px-7 md:first:pl-0 md:last:pr-0">
                <Icon size={18} className="text-mint" />
                <h2 className="mt-4 text-sm font-semibold text-white">{item.title}</h2>
                <p className="mt-2 max-w-sm text-[11px] leading-5 text-slate-500">{item.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-mint">One connected system</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-white">Start where you are.</h2></div>
          <p className="max-w-sm text-[11px] leading-5 text-slate-500">Candidates and hiring teams share the same hiring language, while each side gets an experience built for its job.</p>
        </div>
        <div className="mt-7 grid gap-3 lg:grid-cols-3">
          {pathways.map(item => {
            const Icon = item.icon;
            return (
              <Link key={item.title} href={item.href} className="group flex flex-col rounded-2xl border border-white/[0.07] bg-[#0a111e]/65 p-6 transition hover:border-white/[0.14] hover:bg-[#0c1422]">
                <div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-slate-400 transition group-hover:text-mint"><Icon size={16} /></span><ArrowRight size={14} className="text-slate-700 transition group-hover:translate-x-0.5 group-hover:text-slate-300" /></div>
                <p className="mt-5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">{item.eyebrow}</p>
                <h3 className="mt-2 text-base font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">{item.text}</p>
                <p className="mt-5 text-[10px] font-medium text-mint/80">{item.cta}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-white/[0.055]">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-6 py-7 text-[9px] text-slate-600 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><span className="font-semibold tracking-[0.1em] text-slate-400">ECHOPANEL</span><span>Nexora Labs is a fictional demo company.</span><span>All candidate records are fictional.</span></div>
          <div className="flex flex-wrap gap-4"><Link href="/careers" className="hover:text-slate-300">Careers</Link><Link href="/hr/login" className="hover:text-slate-300">Recruiter portal</Link><Link href="/demo" className="hover:text-slate-300">Demo</Link><Link href="/setup" className="hover:text-slate-300">Interview</Link></div>
        </div>
      </footer>
    </main>
  );
}
