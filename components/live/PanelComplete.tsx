import type { CSSProperties } from "react";
import { INTERVIEWERS } from "@/components/PanelTrio";

// Start offsets match the brand mark: technical top-left, product top-right, behavioural below.
const OFFSETS = [{ x: -24, y: -14 }, { x: 24, y: -14 }, { x: 0, y: 26 }];

/**
 * Interview complete: the three interviewer rings converge into one ring and a check draws in.
 * CSS only (globals.css: .converge, .converge-ring, .converge-check); reduced motion shows the end state.
 */
export function PanelComplete() {
  return (
    <svg viewBox="0 0 160 160" className="h-[180px] w-[180px] text-mint sm:h-[200px] sm:w-[200px]" role="img" aria-label="Interview complete">
      {INTERVIEWERS.map((item, index) => (
        <circle
          key={item.id}
          cx="80"
          cy="80"
          r="24"
          fill="none"
          stroke={item.color}
          strokeWidth="4"
          className="converge"
          style={{ "--x": `${OFFSETS[index].x}px`, "--y": `${OFFSETS[index].y}px` } as CSSProperties}
        />
      ))}
      <circle cx="80" cy="80" r="30" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" pathLength={1} transform="rotate(-90 80 80)" className="converge-ring" />
      <path d="M67 81 l9 9 l18 -19" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="converge-check" />
    </svg>
  );
}
