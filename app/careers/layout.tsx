import { CareersFooter, CareersHeader } from "@/components/careers/CareersShell";

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink text-slate-100">
      <CareersHeader />
      {children}
      <CareersFooter />
    </div>
  );
}
