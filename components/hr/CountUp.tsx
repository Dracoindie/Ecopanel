"use client";

import { useEffect, useState } from "react";

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Counts a number up from 0 to `value` once on mount; reduced motion shows the final value at once. */
export function CountUp({ value, decimals = 1, durationMs = 900, delayMs = 0 }: { value: number; decimals?: number; durationMs?: number; delayMs?: number }) {
  // Rendered after the report loads on the client, so starting at 0 avoids a flash of the final value.
  const [shown, setShown] = useState(() => (typeof window !== "undefined" && !reducedMotion() ? 0 : value));

  useEffect(() => {
    if (reducedMotion()) { setShown(value); return; }
    let frame = 0;
    const start = performance.now() + delayMs;
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / durationMs));
      setShown(value * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, delayMs]);

  return <>{shown.toFixed(decimals)}</>;
}
