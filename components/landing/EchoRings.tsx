"use client";

import { useEffect, useRef } from "react";
import { INTERVIEWERS } from "@/components/PanelTrio";

type Ripple = { ring: number; born: number };

const DRAW_IN_MS = 900;
const TURN_MS = 2600;
const RIPPLE_LIFE_MS = 2400;

/**
 * Landing hero: the three interviewer rings with echo ripples. The panel takes turns "speaking"
 * (the active ring pulses and radiates), the cluster leans gently toward the cursor, and the rings
 * draw themselves in once on load. 2D canvas, one requestAnimationFrame loop, paused when the tab
 * is hidden or the canvas is off screen; prefers-reduced-motion gets a single still frame.
 */
export function EchoRings({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const maybeContext = canvas?.getContext("2d");
    if (!canvas || !maybeContext) return;
    const context: CanvasRenderingContext2D = maybeContext;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;

    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    let start = performance.now();
    let lastRipple = [0, 0, 0];
    const ripples: Ripple[] = [];
    const pointer = { x: 0, y: 0 };
    const lean = { x: 0, y: 0 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) draw(start + DRAW_IN_MS + TURN_MS * 0.4);
    };

    const ringCenters = () => {
      const size = Math.min(width, height);
      const spread = size * 0.15;
      const cx = width / 2 + lean.x;
      const cy = height / 2 + lean.y;
      // Technical top-left, product top-right, behavioural below: the brand mark, enlarged.
      return [
        { x: cx - spread * 0.95 + lean.x * 0.2, y: cy - spread * 0.55 + lean.y * 0.2 },
        { x: cx + spread * 0.95 + lean.x * 0.35, y: cy - spread * 0.55 + lean.y * 0.35 },
        { x: cx + lean.x * 0.5, y: cy + spread * 0.95 + lean.y * 0.5 }
      ];
    };

    function draw(now: number) {
      const t = now - start;
      const size = Math.min(width, height);
      const radius = size * 0.17;
      const active = Math.floor(Math.max(0, t - DRAW_IN_MS) / TURN_MS) % 3;
      const turnPhase = (Math.max(0, t - DRAW_IN_MS) % TURN_MS) / TURN_MS;
      context.clearRect(0, 0, width, height);
      const centers = ringCenters();

      // Echo ripples behind the rings.
      for (let i = ripples.length - 1; i >= 0; i -= 1) {
        const ripple = ripples[i];
        const age = (now - ripple.born) / RIPPLE_LIFE_MS;
        if (age >= 1) { ripples.splice(i, 1); continue; }
        const center = centers[ripple.ring];
        context.beginPath();
        context.arc(center.x, center.y, radius * (1 + age * 1.6), 0, Math.PI * 2);
        context.strokeStyle = INTERVIEWERS[ripple.ring].color;
        context.globalAlpha = (1 - age) * 0.38;
        context.lineWidth = 1.5;
        context.stroke();
      }
      context.globalAlpha = 1;

      centers.forEach((center, index) => {
        const drawIn = Math.min(1, Math.max(0, (t - index * 160) / DRAW_IN_MS));
        const eased = 1 - Math.pow(1 - drawIn, 3);
        const speaking = t > DRAW_IN_MS && index === active;
        // A soft voice-like pulse: two detuned sines, only on the speaking ring.
        const pulse = speaking ? 1 + 0.035 * Math.sin(turnPhase * Math.PI) * (0.6 + 0.4 * Math.sin(t / 95) * Math.sin(t / 61)) : 1;
        context.beginPath();
        context.arc(center.x, center.y, radius * pulse, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * eased);
        context.strokeStyle = INTERVIEWERS[index].color;
        context.globalAlpha = speaking ? 1 : 0.82;
        context.lineWidth = Math.max(3, size * (speaking ? 0.016 : 0.012));
        context.lineCap = "round";
        context.stroke();
      });
      context.globalAlpha = 1;

      if (!reduced && t > DRAW_IN_MS) {
        const gap = 520;
        if (now - lastRipple[active] > gap) {
          ripples.push({ ring: active, born: now });
          lastRipple[active] = now;
        }
      }
    }

    const loop = (now: number) => {
      // Ease the lean toward the pointer target (max ~18px), so motion stays calm.
      lean.x += (pointer.x - lean.x) * 0.06;
      lean.y += (pointer.y - lean.y) * 0.06;
      draw(now);
      frame = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const resume = () => {
      if (!reduced && !frame && visible && !document.hidden) frame = requestAnimationFrame(loop);
    };

    const onPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const dx = (event.clientX - (rect.left + rect.width / 2)) / Math.max(rect.width, 1);
      const dy = (event.clientY - (rect.top + rect.height / 2)) / Math.max(rect.height, 1);
      pointer.x = Math.max(-1, Math.min(1, dx)) * 18;
      pointer.y = Math.max(-1, Math.min(1, dy)) * 18;
    };
    const onVisibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else resume(); };
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      if (!visible) { cancelAnimationFrame(frame); frame = 0; } else resume();
    });
    const resizeObserver = new ResizeObserver(resize);

    resize();
    resizeObserver.observe(canvas);
    observer.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);
    if (finePointer && !reduced) window.addEventListener("pointermove", onPointer, { passive: true });
    start = performance.now();
    lastRipple = [start, start, start];
    if (reduced) draw(start + DRAW_IN_MS + TURN_MS * 0.4);
    else resume();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label="Three interviewer rings, technical in cyan, product in amber and behavioural in coral, taking turns to speak"
    />
  );
}
