import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HrShell } from "@/components/hr/HrShell";
import { getDataMode } from "@/lib/server/config";
import { getHrCounts } from "@/lib/server/recruitment/hr";
import { getHrContext, getSessionIdentity } from "@/lib/server/session";

export const dynamic = "force-dynamic";

function AccessProblem({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-ink px-6 text-slate-200">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.025] p-7 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200/70">Recruiter access</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{detail}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/hr/login" className="rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-ink">Sign in</Link>
          <Link href="/careers" className="rounded-xl border border-white/[0.1] px-4 py-2.5 text-xs font-medium text-slate-300">Careers</Link>
        </div>
      </div>
    </main>
  );
}

export default async function HrPortalLayout({ children }: { children: React.ReactNode }) {
  if (getDataMode() === "demo") {
    if (process.env.NODE_ENV === "production") {
      return (
        <AccessProblem
          title="Recruiter demo is local-only"
          detail="The demo workspace is disabled in production builds. Configure APP_DATA_MODE=database and sign in with a real recruiter account."
        />
      );
    }
    return <HrShell>{children}</HrShell>;
  }

  try {
    const requestHeaders = await headers();
    const identity = await getSessionIdentity(requestHeaders);
    if (!identity) redirect("/hr/login");

    const context = await getHrContext(requestHeaders);
    if (!context) {
      return (
        <AccessProblem
          title="No workspace access"
          detail="Your account is signed in but is not a member of a recruiter organization. Ask an administrator to provision access."
        />
      );
    }

    const counts = await getHrCounts(context.organization.id);
    return (
      <HrShell
        mode="database"
        organizationName={context.organization.name}
        user={{ name: context.user.name, email: context.user.email, role: context.role }}
        counts={counts}
      >
        {children}
      </HrShell>
    );
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("Recruiter workspace could not verify access", error);
    return (
      <AccessProblem
        title="Recruiter access is unavailable"
        detail="The database or authentication configuration could not be verified. No demo workspace was substituted."
      />
    );
  }
}
