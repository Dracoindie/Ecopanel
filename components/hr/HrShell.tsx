"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  ChevronRight,
  Inbox,
  LayoutDashboard,
  Mail,
  Menu,
  Search,
  Settings2,
  Sparkles,
  Users,
  X
} from "lucide-react";
import { useDemoData } from "@/components/DemoDataProvider";
import { authClient } from "@/lib/auth-client";
import type { AppDataMode } from "@/lib/server/config";
import { cn } from "@/lib/cn";
import { upcomingInterviews } from "@/lib/demo-service";

const mainNav = [
  { label: "Overview", href: "/hr", icon: LayoutDashboard, exact: true },
  { label: "Applicants", href: "/hr/applicants", icon: Users, badge: "applications" },
  { label: "Job postings", href: "/hr/jobs", icon: BriefcaseBusiness, badge: "jobs" },
  { label: "Schedule", href: "/hr/schedule", icon: CalendarDays, badge: "interviews" },
  { label: "Email & Communications", href: "/hr/email", icon: Mail },
  { label: "Email templates", href: "/hr/email/templates", icon: Inbox },
  { label: "Mail settings", href: "/hr/email/settings", icon: Settings2 }
] as const;

const pageTitles: Array<[string, string]> = [
  ["/hr/applicants/", "Candidate review"],
  ["/hr/applicants", "Applicant pipeline"],
  ["/hr/jobs/new", "Create job"],
  ["/hr/jobs/", "Job details"],
  ["/hr/jobs", "Job postings"],
  ["/hr/schedule", "Schedule & calendar"],
  ["/hr/interviews/", "Interview"],
  ["/hr/email/compose", "Compose email"],
  ["/hr/email/templates/", "Template editor"],
  ["/hr/email/templates", "Email templates"],
  ["/hr/email/activity", "Email activity"],
  ["/hr/email/settings", "Mail settings"],
  ["/hr/email", "Email & Communications"],
  ["/hr", "Recruiter overview"]
];

interface HrShellProps {
  children: React.ReactNode;
  mode?: AppDataMode;
  organizationName?: string;
  user?: { name: string; email: string; role: string };
  counts?: { applications: number; jobs: number; interviews: number };
}

export function HrShell({ children, mode = "demo", organizationName = "Nexora Labs", user, counts: providedCounts }: HrShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const store = useDemoData();
  const { applications, jobs } = store;
  const isDatabase = mode === "database";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const upcoming = isDatabase ? 0 : upcomingInterviews(store).length;
  const activeHref = mainNav
    .filter(item => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const counts = providedCounts ?? {
    applications: applications.length,
    jobs: jobs.filter(job => job.status === "Published").length,
    interviews: upcoming
  };

  const displayName = user?.name ?? "Maya Chen";
  const displayRole = user?.role ? user.role.toLowerCase().replace(/_/g, " ") : "Recruiter";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "HR";

  const signOut = async () => {
    setSigningOut(true);
    if (isDatabase) {
      await authClient.signOut();
      router.replace("/hr/login");
      router.refresh();
    } else {
      router.push("/hr/login");
    }
  };

  const title = pageTitles.find(([prefix]) => pathname === prefix || (prefix !== "/hr" && pathname.startsWith(prefix)))?.[1] ?? "Recruiter workspace";

  const onSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `/hr/applicants?q=${encodeURIComponent(value)}` : "/hr/applicants");
  };

  const sidebar = (
    <aside className="flex h-full w-[268px] shrink-0 flex-col border-r border-white/[0.065] bg-[#070c16]">
      <div className="flex h-[70px] items-center justify-between border-b border-white/[0.06] px-5">
        <Link href="/hr" className="group flex items-center gap-3" onClick={() => setMobileOpen(false)}>
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-violet/25 bg-gradient-to-br from-violet/[0.2] to-mint/[0.06] shadow-[0_0_24px_rgba(156,140,255,.12)]">
            <span className="h-2.5 w-2.5 rounded-full border border-white/80 bg-violet shadow-[0_0_10px_rgba(156,140,255,.8)]" />
          </span>
          <span>
            <span className="block text-[13px] font-bold tracking-[0.08em] text-white">ECHOPANEL</span>
            <span className="block text-[9px] font-medium uppercase tracking-[0.16em] text-slate-500">{organizationName} · Hiring</span>
          </span>
        </Link>
        <button className="text-slate-500 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
          <X size={18} />
        </button>
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-5">
        <p className="px-3 pb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">Hiring operations</p>
        <div className="space-y-1">
          {mainNav.map((item, index) => {
            const Icon = item.icon;
            const active = item.href === activeHref;
            const badge = "badge" in item ? counts[item.badge as keyof typeof counts] : undefined;
            return (
              <div key={item.href}>
                {index === 4 && <div className="my-4 border-t border-white/[0.055]" />}
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12px] font-medium transition",
                    active
                      ? "border border-mint/15 bg-mint/[0.065] text-white shadow-[inset_2px_0_0_rgba(124,245,197,.8)]"
                      : "border border-transparent text-slate-400 hover:bg-white/[0.035] hover:text-slate-100"
                  )}
                >
                  <Icon size={15} className={active ? "text-mint" : "text-slate-500 group-hover:text-slate-300"} />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {badge !== undefined && (
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", active ? "bg-mint/15 text-mint" : "bg-white/[0.05] text-slate-500")}>
                      {badge}
                    </span>
                  )}
                  {active && <ChevronRight size={11} className="text-mint/60" />}
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5">
          <div className="flex items-center gap-2">
            <Sparkles size={13} className="text-violet-300" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">{isDatabase ? "Private workspace" : "Demo workspace"}</p>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-slate-500">
            {isDatabase
              ? "Applications, CVs, jobs, schedules, and email records are stored for this organization. No email or calendar provider is connected."
              : "All records, emails, and schedules are seeded frontend data. No external systems are connected."}
          </p>
          <Link href="/careers" className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/15 px-2.5 py-2 text-[10px] font-medium text-slate-400 transition hover:text-white">
            Public careers
            <ArrowUpRight size={11} />
          </Link>
        </div>
      </nav>

      <div className="border-t border-white/[0.06] p-3.5">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-violet/20 bg-violet/[0.12] text-[10px] font-bold text-violet-200">{initials}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-slate-200">{displayName}</p>
            <p className="truncate text-[9px] capitalize text-slate-500">{displayRole} · {isDatabase ? "Verified session" : "Demo account"}</p>
          </div>
          <button type="button" onClick={signOut} disabled={signingOut} className="text-[9px] font-medium text-slate-500 transition hover:text-white disabled:opacity-50">Exit</button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#050a13] text-slate-200">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_22%_0%,rgba(156,140,255,.055),transparent_32%),radial-gradient(circle_at_88%_12%,rgba(124,245,197,.04),transparent_26%)]" />
      <div className="relative z-10 flex min-h-screen">
        <div className="hidden lg:sticky lg:top-0 lg:block lg:h-screen">{sidebar}</div>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />
            <div className="relative h-full">{sidebar}</div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-[70px] items-center gap-3 border-b border-white/[0.06] bg-[#050a13]/85 px-4 backdrop-blur-xl lg:px-7">
            <button className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-slate-400 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Menu size={17} />
            </button>
            <div className="hidden min-w-0 md:block">
              <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-slate-600">EchoPanel / {organizationName}</p>
              <p className="mt-0.5 truncate text-xs font-medium text-slate-300">{title}</p>
            </div>
            <form onSubmit={onSearch} className="relative ml-auto hidden w-full max-w-[320px] sm:block">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search candidates, roles, email…"
                className="h-9 w-full rounded-xl border border-white/[0.07] bg-white/[0.025] pl-8 pr-3 text-[11px] text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-mint/30 focus:bg-white/[0.04]"
              />
            </form>
            <span className={cn(
              "ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] sm:ml-0",
              isDatabase ? "border-mint/20 bg-mint/[0.05] text-mint/80" : "border-amber-300/15 bg-amber-300/[0.05] text-amber-200/75"
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full", isDatabase ? "bg-mint/80" : "bg-amber-300/80")} />
              {isDatabase ? "Database" : "Demo mode"}
            </span>
            <Link href="/careers" className="hidden items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[10px] font-medium text-slate-400 transition hover:text-white xl:flex">
              Careers site
              <ArrowUpRight size={11} />
            </Link>
          </header>

          <main className="mx-auto w-full max-w-[1580px] flex-1 px-4 py-6 lg:px-7 lg:py-7">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
