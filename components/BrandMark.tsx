import { cn } from "@/lib/cn";

/** The EchoPanel mark: the three interviewer rings (technical, product, behavioural). */
export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={cn("shrink-0", className)}>
      <circle cx="11" cy="12.5" r="7" fill="none" stroke="#22B8CF" strokeWidth="2.4" />
      <circle cx="21" cy="12.5" r="7" fill="none" stroke="#F2A541" strokeWidth="2.4" />
      <circle cx="16" cy="21" r="7" fill="none" stroke="#E86A92" strokeWidth="2.4" />
    </svg>
  );
}

/** Mark plus wordmark. Inherits text colour, so it works on the dark stage and the light portal. */
export function BrandLockup({ subtitle, className }: { subtitle?: string; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="leading-tight">
        <span className="block font-display text-[17px] font-semibold tracking-[-0.01em] text-white">EchoPanel</span>
        {subtitle && <span className="block text-[11px] text-slate-500">{subtitle}</span>}
      </span>
    </span>
  );
}
