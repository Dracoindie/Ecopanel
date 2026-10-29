import { cn } from "@/lib/cn";

/** The three interviewers and their colours. A colour always identifies an interviewer, never decoration. */
export const INTERVIEWERS = [
  { id: "technical", label: "Technical", focus: "Systems, depth and trade-offs", color: "#22B8CF" },
  { id: "product", label: "Product", focus: "Customers, value and outcomes", color: "#F2A541" },
  { id: "behavioural", label: "Behavioural", focus: "Judgement and ownership", color: "#E86A92" }
] as const;

export type InterviewerId = (typeof INTERVIEWERS)[number]["id"];

export function interviewerColor(id: string) {
  return INTERVIEWERS.find(item => item.id === id)?.color;
}

/** Static legend: a ring per interviewer with its name and focus. */
export function PanelTrio({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <ul className={cn("grid gap-3", compact ? "grid-cols-3" : "sm:grid-cols-3", className)}>
      {INTERVIEWERS.map(item => (
        <li key={item.id} className="flex items-center gap-3 sm:flex-col sm:items-start">
          <span
            aria-hidden="true"
            className={cn("block shrink-0 rounded-full", compact ? "h-7 w-7 border-[3px]" : "h-11 w-11 border-4")}
            style={{ borderColor: item.color }}
          />
          <span>
            <span className="block text-[14px] font-semibold text-white">{item.label}</span>
            {!compact && <span className="block text-[12.5px] leading-5 text-slate-400">{item.focus}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
