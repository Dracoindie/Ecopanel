import { CareersFooter, CareersHeader } from "@/components/careers/CareersShell";

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#05070b] text-slate-100">
      <CareersHeader />
      {children}
      <CareersFooter />
    </div>
  );
}
