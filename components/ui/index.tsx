"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Inbox, Loader2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ApplicationStage, EmailStatus, JobStatus } from "@/lib/domain";
import { stageTone, emailTone } from "@/lib/demo-service";
import { panelClass, secondaryButton } from "@/lib/ui";

export type Tone = "mint" | "violet" | "amber" | "rose" | "sky" | "slate" | "purple";

const toneClasses: Record<Tone, string> = {
  mint: "border-mint/20 bg-mint/[0.08] text-mint",
  violet: "border-violet/25 bg-violet/[0.1] text-violet-200",
  amber: "border-amber-400/20 bg-amber-400/[0.08] text-amber-200",
  rose: "border-rose-400/20 bg-rose-400/[0.08] text-rose-200",
  sky: "border-sky-400/20 bg-sky-400/[0.08] text-sky-200",
  slate: "border-white/[0.09] bg-white/[0.04] text-slate-300",
  purple: "border-purple-400/25 bg-purple-400/[0.09] text-purple-200"
};

export function Badge({ children, tone = "slate", dot = false }: { children: React.ReactNode; tone?: Tone; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold", toneClasses[tone])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function StageBadge({ stage }: { stage: ApplicationStage }) {
  return <Badge tone={stageTone(stage) as Tone} dot>{stage}</Badge>;
}

export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  return <Badge tone={emailTone(status) as Tone}>{status === "Sent" ? "Sent · demo" : status}</Badge>;
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const tone: Tone = status === "Published" ? "mint" : status === "Draft" ? "amber" : "slate";
  return <Badge tone={tone} dot>{status}</Badge>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-5 border-b border-white/[0.06] pb-6 sm:flex-row sm:items-end">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-mint">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-[-0.025em] text-white sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "slate",
  href
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
  icon?: LucideIcon;
  tone?: Tone;
  href?: string;
}) {
  const content = (
    <div className={cn(panelClass, "group relative h-full overflow-hidden p-4 transition hover:border-white/[0.14] hover:bg-[#0c1524]/95")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">{label}</p>
        {Icon && (
          <span className={cn("grid h-8 w-8 place-items-center rounded-xl border", toneClasses[tone])}>
            <Icon size={14} />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white">{value}</p>
      {detail && <p className="mt-1.5 text-[11px] leading-4 text-slate-500">{detail}</p>}
      {href && (
        <ArrowRight
          size={13}
          className="absolute bottom-4 right-4 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-300"
        />
      )}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block h-full">
        {content}
      </Link>
    );
  }
  return content;
}

export function SectionHeading({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {description && <p className="mt-1 text-[11px] leading-4 text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function DemoBanner({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] text-amber-200/80",
        compact ? "px-3 py-2 text-[10px]" : "px-4 py-3 text-xs"
      )}
    >
      <AlertCircle size={compact ? 12 : 14} className="mt-0.5 shrink-0 text-amber-300/80" />
      <p className="leading-5">{children}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.025] text-slate-500">
        <Icon size={18} />
      </span>
      <p className="mt-4 text-sm font-semibold text-slate-200">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-xs leading-5 text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Loading demo workspace" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-14 text-sm text-slate-500">
      <Loader2 size={15} className="animate-spin text-mint" />
      {label}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description }: { title?: string; description?: string }) {
  return (
    <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[0.04] p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-rose-200">
        <AlertCircle size={15} />
        {title}
      </div>
      {description && <p className="mt-2 text-xs leading-5 text-rose-200/60">{description}</p>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md"
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  const sizes = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm" onClick={onClose} aria-label="Close dialog" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/[0.1] bg-[#0a111e] shadow-[0_40px_120px_rgba(0,0,0,.55)] sm:rounded-3xl",
          sizes[size]
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {description && <p className="mt-1 text-[11px] leading-5 text-slate-500">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-white" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.07] px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "primary",
  busy = false
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button className={secondaryButton} onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50",
              tone === "danger" ? "bg-rose-400 text-[#1a080b] hover:bg-rose-300" : "bg-mint text-ink hover:bg-[#9bf8d5]"
            )}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm leading-6 text-slate-400">{description}</p>
    </Modal>
  );
}

export function ProgressBar({ value, tone = "mint" }: { value: number; tone?: "mint" | "violet" | "amber" }) {
  const colors = { mint: "bg-mint", violet: "bg-violet", amber: "bg-amber-300" };
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
      <div className={cn("h-full rounded-full transition-all", colors[tone])} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Avatar({ name, size = "md", tone = "mint" }: { name: string; size?: "sm" | "md" | "lg"; tone?: Tone }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  const sizes = { sm: "h-8 w-8 text-[10px]", md: "h-10 w-10 text-xs", lg: "h-14 w-14 text-base" };
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full border font-bold tracking-wide",
        sizes[size],
        tone === "violet" ? "border-violet/25 bg-violet/[0.12] text-violet-200" : tone === "sky" ? "border-sky-400/20 bg-sky-400/[0.1] text-sky-200" : "border-mint/20 bg-mint/[0.09] text-mint"
      )}
    >
      {initials}
    </span>
  );
}
