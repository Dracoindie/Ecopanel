"use client";

import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { INTERVIEWERS } from "@/components/PanelTrio";
import type { AgentId, AgentStatus, SpeakerId } from "@/lib/types";

/**
 * Read-only voice visual for the live interview. It polls volume levels from the Agora tracks the
 * interview already owns (remote interviewer audio via the RTC client's remoteUsers, the candidate's
 * microphone track) and draws them. It never plays, stops, mutes, publishes or subscribes anything,
 * and it has no say in turn-taking.
 */
type PanelVoiceProps = {
  /** The RTC client ref (remote interviewer audio) and the microphone track ref, both read-only. */
  rtcRef?: MutableRefObject<any>;
  micRef?: MutableRefObject<any>;
  live: boolean;
  muted: boolean;
  activeSpeaker: SpeakerId;
  agentStates: Partial<Record<AgentId, AgentStatus>>;
};

const HISTORY = 64;

function readLevel(track: any): number {
  try {
    const level = typeof track?.getVolumeLevel === "function" ? Number(track.getVolumeLevel()) : 0;
    return Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  } catch {
    return 0;
  }
}

function remoteLevel(client: any): number {
  const users: any[] = Array.isArray(client?.remoteUsers) ? client.remoteUsers : [];
  return users.reduce((max, user) => Math.max(max, readLevel(user?.audioTrack)), 0);
}

/** Which interviewer currently holds the voice: the active speaker, else whoever is marked speaking. */
export function speakingInterviewer(activeSpeaker: SpeakerId, agentStates: Partial<Record<AgentId, AgentStatus>>) {
  const ids = INTERVIEWERS.map(item => item.id) as string[];
  if (ids.includes(activeSpeaker)) return activeSpeaker as AgentId;
  return (INTERVIEWERS.find(item => agentStates[item.id] === "speaking")?.id ?? null) as AgentId | null;
}

export function PanelVoice({ rtcRef, micRef, live, muted, activeSpeaker, agentStates }: PanelVoiceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ live, muted, activeSpeaker, agentStates });
  stateRef.current = { live, muted, activeSpeaker, agentStates };
  const drawRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    const maybeContext = canvas?.getContext("2d");
    if (!canvas || !maybeContext) return;
    const context: CanvasRenderingContext2D = maybeContext;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let frame = 0;
    let voice = 0;
    let mic = 0;
    const history: number[] = new Array(HISTORY).fill(0);
    let lastSample = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(performance.now());
    };

    function draw(now: number) {
      const { live: isLive, muted: isMuted, activeSpeaker: speaker, agentStates: states } = stateRef.current;
      const active = speakingInterviewer(speaker, states);
      const moderatorSpeaking = speaker === "moderator" || states.moderator === "speaking";

      // Read-only level polling, smoothed with a fast attack and a slower release.
      const targetVoice = isLive && rtcRef ? remoteLevel(rtcRef.current) : 0;
      const targetMic = isLive && micRef && !isMuted ? readLevel(micRef.current) : 0;
      voice += (targetVoice - voice) * (targetVoice > voice ? 0.5 : 0.12);
      mic += (targetMic - mic) * (targetMic > mic ? 0.55 : 0.15);
      if (now - lastSample > 45) {
        history.push(reduced ? 0 : mic);
        history.shift();
        lastSample = now;
      }

      context.clearRect(0, 0, width, height);
      const waveHeight = Math.min(64, height * 0.22);
      const ringArea = height - waveHeight - 16;
      const size = Math.min(width, ringArea);
      const radius = size * 0.19;
      const spread = size * 0.24;
      const cx = width / 2;
      const cy = ringArea / 2 + 4;
      const centers = [
        { x: cx - spread, y: cy - spread * 0.42 },
        { x: cx + spread, y: cy - spread * 0.42 },
        { x: cx, y: cy + spread * 0.72 }
      ];

      INTERVIEWERS.forEach((item, index) => {
        const isActive = active === item.id || moderatorSpeaking;
        const level = isActive ? voice : 0;
        const center = centers[index];
        // Echo halo: scales with the interviewer's voice.
        if (isActive && level > 0.02 && !reduced) {
          context.beginPath();
          context.arc(center.x, center.y, radius * (1.12 + level * 0.55), 0, Math.PI * 2);
          context.strokeStyle = item.color;
          context.globalAlpha = 0.18 + level * 0.35;
          context.lineWidth = 2 + level * 6;
          context.stroke();
        }
        context.beginPath();
        context.arc(center.x, center.y, radius * (1 + (reduced ? 0 : level * 0.08)), 0, Math.PI * 2);
        context.strokeStyle = item.color;
        context.globalAlpha = isActive ? 1 : 0.42;
        context.lineWidth = isActive ? Math.max(4, size * 0.03) : Math.max(2.5, size * 0.018);
        context.stroke();
        context.globalAlpha = 1;
      });

      // Candidate microphone waveform: mirrored bars, newest on the right.
      const top = height - waveHeight;
      const mid = top + waveHeight / 2;
      const barGap = 3;
      const barWidth = Math.max(2, (Math.min(width, 520) - barGap * (HISTORY - 1)) / HISTORY);
      const totalWidth = barWidth * HISTORY + barGap * (HISTORY - 1);
      const left = (width - totalWidth) / 2;
      context.fillStyle = "#EEF1F6";
      history.forEach((value, index) => {
        const amplitude = Math.max(1.5, Math.min(1, value * 2.2) * (waveHeight / 2 - 2));
        context.globalAlpha = 0.25 + Math.min(1, value * 3) * 0.75;
        context.fillRect(left + index * (barWidth + barGap), mid - amplitude, barWidth, amplitude * 2);
      });
      context.globalAlpha = 1;
    }
    drawRef.current = () => draw(performance.now());

    const loop = (now: number) => {
      draw(now);
      frame = document.hidden ? 0 : requestAnimationFrame(loop);
    };
    const onVisibility = () => {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
      else if (!reduced && !frame) frame = requestAnimationFrame(loop);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);
    resize();
    if (!reduced) frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [rtcRef, micRef]);

  // Reduced motion draws only when the speaker changes.
  useEffect(() => { drawRef.current(); }, [live, muted, activeSpeaker, agentStates]);

  const active = speakingInterviewer(activeSpeaker, agentStates);
  return (
    <div className="w-full max-w-[520px]">
      <canvas
        ref={canvasRef}
        className="block h-[300px] w-full sm:h-[340px]"
        role="img"
        aria-label={`Interview panel. ${active ? `${INTERVIEWERS.find(item => item.id === active)?.label} interviewer speaking.` : activeSpeaker === "candidate" ? "Candidate speaking." : "Panel listening."}`}
      />
      <ul className="mt-3 grid grid-cols-3 gap-2 text-center" aria-hidden="true">
        {INTERVIEWERS.map(item => {
          const speaking = active === item.id;
          return (
            <li key={item.id} className="min-w-0">
              <span className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-white">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="mt-0.5 block text-[12px] text-slate-500">{speaking ? "Speaking" : agentStates[item.id] === "thinking" ? "Thinking" : "Listening"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
