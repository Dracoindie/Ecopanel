"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Activity,
  AudioLines,
  Award,
  ChevronDown,
  ChevronRight,
  Clock3,
  Headphones,
  LockKeyhole,
  MessageSquareText,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wifi,
  WifiOff,
  Zap
} from "lucide-react";
import type { AgentId, AgentStatus, SharedInterviewState } from "@/lib/types";

type ConnectionState = "ready" | "connecting" | "live" | "error";

type Diagnostics = {
  connectionMs: number;
  lastAnalysisMs: number;
  timeToFirstAudioMs: number;
  turnsCount: number;
};

type LiveInterviewViewProps = {
  connectionState: ConnectionState;
  statusMessage: string;
  muted: boolean;
  isAnalyzing: boolean;
  textInput: string;
  interviewState: SharedInterviewState;
  diagnostics: Diagnostics;
  onStart: () => void;
  onStop: () => void;
  onToggleMute: () => void;
  onTextInputChange: (value: string) => void;
  onManualSubmit: (event: FormEvent) => void;
};

const panelAgents: AgentId[] = ["moderator", "technical", "product", "behavioural"];

const agentMeta: Record<AgentId, { short: string; label: string; focus: string }> = {
  moderator: { short: "M", label: "Moderator", focus: "Floor control & sequencing" },
  technical: { short: "T", label: "Technical", focus: "Systems, depth & trade-offs" },
  product: { short: "P", label: "Product", focus: "Customers, value & outcomes" },
  behavioural: { short: "B", label: "Behavioural", focus: "Judgement & ownership" },
  customer: { short: "C", label: "Customer", focus: "Customer perspective" }
};

const perspectiveStatusLabel: Record<AgentStatus, string> = {
  listening: "Observing",
  thinking: "Evaluating",
  requesting: "Focus queued",
  speaking: "Focus now",
  handoff: "Handoff focus",
  idle: "Standby"
};

const perspectiveTone: Record<AgentStatus, string> = {
  listening: "border-sky-400/15 bg-sky-400/[0.06] text-sky-200/90",
  thinking: "border-violet/20 bg-violet/[0.07] text-violet-200",
  requesting: "border-amber-400/20 bg-amber-400/[0.06] text-amber-200",
  speaking: "border-violet/30 bg-violet/[0.09] text-violet-200",
  handoff: "border-violet/20 bg-violet/[0.07] text-violet-200",
  idle: "border-white/[0.06] bg-white/[0.03] text-slate-500"
};

const perspectiveDot: Record<AgentStatus, string> = {
  listening: "bg-sky-400",
  thinking: "bg-violet",
  requesting: "bg-amber-400",
  speaking: "bg-violet",
  handoff: "bg-violet",
  idle: "bg-slate-600"
};

function liveVoicePresentation(
  connectionState: ConnectionState,
  activeSpeaker: SharedInterviewState["activeSpeaker"]
) {
  if (connectionState === "error") {
    return { label: "Unavailable", tone: "border-red-400/20 bg-red-400/[0.06] text-red-200", dot: "bg-red-400" };
  }
  if (connectionState === "connecting") {
    return { label: "Connecting", tone: "border-amber-400/20 bg-amber-400/[0.06] text-amber-200", dot: "bg-amber-400" };
  }
  if (connectionState === "live") {
    return activeSpeaker === "candidate"
      ? { label: "Listening", tone: "border-sky-400/15 bg-sky-400/[0.06] text-sky-200/90", dot: "bg-sky-400" }
      : { label: "Speaking", tone: "border-mint/25 bg-mint/[0.07] text-mint", dot: "bg-mint" };
  }
  return { label: "Standby", tone: "border-white/[0.06] bg-white/[0.03] text-slate-500", dot: "bg-slate-600" };
}

const connectionMeta: Record<
  ConnectionState,
  { label: string; dot: string; tone: string; icon: typeof Radio }
> = {
  ready: {
    label: "Standby",
    dot: "bg-slate-500",
    tone: "border-white/10 bg-white/[0.03] text-slate-400",
    icon: Radio
  },
  connecting: {
    label: "Connecting",
    dot: "bg-amber-400",
    tone: "border-amber-400/20 bg-amber-400/[0.07] text-amber-200",
    icon: Wifi
  },
  live: {
    label: "Live",
    dot: "bg-mint",
    tone: "border-mint/25 bg-mint/[0.08] text-mint",
    icon: Wifi
  },
  error: {
    label: "Connection issue",
    dot: "bg-red-400",
    tone: "border-red-400/20 bg-red-400/[0.07] text-red-200",
    icon: WifiOff
  }
};

function initials(name: string) {
  const value = name.trim();
  if (!value) return "C";
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

function speakerLabel(speaker: SharedInterviewState["activeSpeaker"]) {
  if (speaker === "candidate") return "Candidate";
  if (speaker === "moderator") return "Moderator voice";
  return `${agentMeta[speaker]?.label || speaker} perspective`;
}

function focusLabel(speaker: SharedInterviewState["activeSpeaker"]) {
  if (speaker === "candidate") return "Candidate";
  return agentMeta[speaker]?.label || speaker;
}

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function useSessionElapsed(isLive: boolean) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isLive) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    setElapsed(0);
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isLive]);

  return formatClock(elapsed);
}

function SignalBars({ active = true }: { active?: boolean }) {
  return (
    <span className="flex h-4 items-center gap-0.5" aria-hidden="true">
      {[3, 6, 10, 7, 4].map((height, index) => (
        <span
          key={height}
          className={`w-0.5 rounded-full ${active ? "bg-mint signal-bar" : "bg-slate-600"}`}
          style={{ height, animationDelay: `${index * 90}ms` }}
        />
      ))}
    </span>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  trailing
}: {
  icon: typeof Activity;
  title: string;
  trailing?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon size={14} className="text-mint" />
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">{title}</p>
      {trailing ? (
        <span className="ml-auto font-mono text-[10px] tracking-wide text-slate-600">{trailing}</span>
      ) : null}
    </div>
  );
}

function SessionStrip({
  connectionState,
  statusMessage,
  interviewState,
  elapsed
}: {
  connectionState: ConnectionState;
  statusMessage: string;
  interviewState: SharedInterviewState;
  elapsed: string;
}) {
  const meta = connectionMeta[connectionState];

  return (
    <div className="relative z-10 mx-auto mt-1 flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 border-y border-white/[0.06] px-5 py-3 text-[11px] lg:px-8">
      <span className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 font-semibold ${meta.tone}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${connectionState === "live" ? "status-pulse" : ""}`} />
        {meta.label}
      </span>
      <p className="min-w-0 flex-1 truncate text-slate-400" title={statusMessage}>
        {statusMessage}
      </p>
      <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-600">
        <span>Role <b className="font-medium text-slate-300">{interviewState.targetRole}</b></span>
        <span className="hidden h-3 w-px bg-white/10 sm:block" />
        <span>Depth <b className="font-medium text-slate-300">{interviewState.difficulty}/5</b></span>
        <span className="hidden h-3 w-px bg-white/10 sm:block" />
        <span>Elapsed <b className="font-medium text-slate-300">{elapsed}</b></span>
      </div>
    </div>
  );
}

function InterviewerCard({
  id,
  status,
  connectionState,
  activeSpeaker
}: {
  id: AgentId;
  status: AgentStatus;
  connectionState: ConnectionState;
  activeSpeaker: SharedInterviewState["activeSpeaker"];
}) {
  const meta = agentMeta[id];
  const isLiveVoice = id === "moderator";
  const voice = liveVoicePresentation(connectionState, activeSpeaker);
  const isVoiceSpeaking = isLiveVoice && connectionState === "live" && activeSpeaker !== "candidate";
  const isFocus = !isLiveVoice && status === "speaking";
  const isThinking = !isLiveVoice && status === "thinking";
  const displayLabel = isLiveVoice ? voice.label : perspectiveStatusLabel[status];
  const displayTone = isLiveVoice ? voice.tone : perspectiveTone[status];
  const displayDot = isLiveVoice ? voice.dot : perspectiveDot[status];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border px-3.5 py-3 transition duration-300 ${
        isVoiceSpeaking
          ? "border-mint/25 bg-mint/[0.055] shadow-[0_0_32px_rgba(124,245,197,.06)]"
          : isFocus
            ? "border-violet/20 bg-violet/[0.045]"
            : "border-white/[0.06] bg-white/[0.018]"
      }`}
    >
      {isVoiceSpeaking ? (
        <span className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-mint to-transparent" />
      ) : null}
      {isFocus ? (
        <span className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-violet/70 to-transparent" />
      ) : null}
      <div className="flex items-center gap-3">
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-xs font-bold transition ${
            isVoiceSpeaking
              ? "border-mint/40 bg-mint text-ink"
              : isLiveVoice
                ? "border-mint/20 bg-mint/[0.06] text-mint"
                : isFocus || isThinking
                  ? "border-violet/25 bg-violet/[0.08] text-violet-200"
                  : "border-white/[0.07] bg-white/[0.035] text-slate-300"
          }`}
        >
          {meta.short}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-semibold text-slate-100">{meta.label}</p>
            <span
              className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${displayTone}`}
            >
              <span className={`h-1 w-1 rounded-full ${displayDot} ${isVoiceSpeaking ? "status-pulse" : ""}`} />
              {displayLabel}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`shrink-0 rounded px-1 py-0.5 text-[7px] font-bold uppercase tracking-[0.1em] ${
                isLiveVoice ? "bg-mint/[0.09] text-mint/80" : "bg-violet/[0.08] text-violet-200/70"
              }`}
            >
              {isLiveVoice ? "Live voice" : "Perspective"}
            </span>
            <p className="truncate text-[10px] text-slate-500">{meta.focus}</p>
            {isVoiceSpeaking ? <SignalBars /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelRail({
  interviewState,
  connectionState
}: {
  interviewState: SharedInterviewState;
  connectionState: ConnectionState;
}) {
  return (
    <aside className="order-2 flex min-w-0 flex-col gap-4 xl:order-1">
      <section className="surface rounded-[24px] p-4">
        <SectionHeading icon={AudioLines} title="The panel" />
        <p className="mt-1.5 text-[9px] leading-4 text-slate-600">
          1 live voice agent · 4 evaluation perspectives
        </p>
        <div className="mt-4 space-y-2">
          {panelAgents.map(id => (
            <InterviewerCard
              key={id}
              id={id}
              status={interviewState.agentStates[id] || "idle"}
              connectionState={connectionState}
              activeSpeaker={interviewState.activeSpeaker}
            />
          ))}
        </div>
      </section>

      <section className="surface rounded-[24px] p-4">
        <SectionHeading icon={Activity} title="Live signal" trailing="Evaluation readout" />
        <div className="mt-4 space-y-3">
          {Object.entries(interviewState.competencies).map(([key, value]) => (
            <div key={key}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-[11px] capitalize text-slate-400">
                  {key.replace(/([A-Z])/g, " $1")}
                </span>
                <span className="font-mono text-[10px] text-slate-300">{value.toFixed(1)}<span className="text-slate-600">/10</span></span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-mint/80 to-violet/80 transition-all duration-700"
                  style={{ width: `${Math.max(0, Math.min(100, value * 10))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[24px] border border-white/[0.06] bg-white/[0.018] p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-violet/20 bg-violet/[0.07] text-violet-200">
            <LockKeyhole size={14} />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-200">Authoritative floor</p>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">
              One live voice agent speaks at a time. Floor is currently{" "}
              <span className={interviewState.floorLocked ? "text-amber-300" : "text-mint"}>
                {interviewState.floorLocked ? "locked" : "open"}
              </span>{" "}
              to {speakerLabel(interviewState.activeSpeaker)}.
            </p>
          </div>
        </div>
      </section>
    </aside>
  );
}

function StageControls({
  connectionState,
  muted,
  onStart,
  onStop,
  onToggleMute
}: {
  connectionState: ConnectionState;
  muted: boolean;
  onStart: () => void;
  onStop: () => void;
  onToggleMute: () => void;
}) {
  if (connectionState !== "live") {
    return (
      <button
        type="button"
        onClick={onStart}
        disabled={connectionState === "connecting"}
        className="inline-flex items-center gap-2 rounded-full bg-mint px-4 py-2.5 text-xs font-semibold text-ink shadow-[0_0_24px_rgba(124,245,197,.12)] transition hover:bg-[#9bf8d5] disabled:cursor-wait disabled:opacity-60"
      >
        <Mic size={14} />
        {connectionState === "connecting" ? "Connecting…" : "Start live panel"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggleMute}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3.5 py-2.5 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
      >
        {muted ? <Mic size={14} /> : <MicOff size={14} />}
        {muted ? "Unmute" : "Mute"}
      </button>
      <button
        type="button"
        onClick={onStop}
        className="inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-400/[0.07] px-3.5 py-2.5 text-xs font-medium text-red-200 transition hover:border-red-400/35 hover:bg-red-400/10"
      >
        <PhoneOff size={14} />
        End
      </button>
    </div>
  );
}

function Stage({
  connectionState,
  statusMessage,
  muted,
  isAnalyzing,
  textInput,
  interviewState,
  elapsed,
  onStart,
  onStop,
  onToggleMute,
  onTextInputChange,
  onManualSubmit
}: Pick<
  LiveInterviewViewProps,
  | "connectionState"
  | "statusMessage"
  | "muted"
  | "isAnalyzing"
  | "textInput"
  | "interviewState"
  | "onStart"
  | "onStop"
  | "onToggleMute"
  | "onTextInputChange"
  | "onManualSubmit"
> & { elapsed: string }) {
  const isLive = connectionState === "live";
  const hasEnded = connectionState === "ready" && statusMessage === "Live interview ended.";
  const latestTurn = interviewState.transcript.at(-1);
  const hasCandidateFloor = interviewState.activeSpeaker === "candidate";
  const activeFocus = focusLabel(interviewState.activeSpeaker);
  const ConnectionIcon = connectionMeta[connectionState].icon;

  return (
    <section className="surface relative order-1 flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-[28px] xl:order-2">
      <div className="pointer-events-none absolute inset-0 gridline opacity-[0.22]" />
      <div className="stage-glow pointer-events-none absolute inset-x-0 top-0 h-[420px]" />

      <header className="relative z-10 flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4 lg:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.24em] text-slate-500">
            <span className="h-1 w-1 rounded-full bg-mint/80" />
            Live boardroom
            <span className="text-slate-700">/</span>
            <span className="text-slate-400">{connectionMeta[connectionState].label}</span>
          </div>
          <h1 className="mt-2 truncate text-lg font-semibold tracking-[-0.01em] text-white sm:text-xl">
            {interviewState.targetRole}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
            <span>{interviewState.experienceLevel} track</span>
            <span className="h-0.5 w-0.5 rounded-full bg-slate-700" />
            <span>{interviewState.floorLocked ? "Floor locked" : "Floor open"}</span>
            <span className="h-0.5 w-0.5 rounded-full bg-slate-700" />
            <span className="font-mono">{elapsed}</span>
          </div>
        </div>
        <StageControls
          connectionState={connectionState}
          muted={muted}
          onStart={onStart}
          onStop={onStop}
          onToggleMute={onToggleMute}
        />
      </header>

      <div className="relative z-10 flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center sm:py-12">
          <div className="relative">
            <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.04] sm:h-72 sm:w-72" />
            <div className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-mint/[0.08] sm:h-60 sm:w-60" />
            <div
              className={`absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-mint/15 sm:h-52 sm:w-52 ${
                interviewState.activeSpeaker === "candidate" || isLive ? "orb-breathe" : ""
              }`}
            />
            <div
              className={`relative grid h-32 w-32 place-items-center rounded-full border text-3xl font-semibold tracking-[0.04em] transition duration-500 sm:h-36 sm:w-36 ${
                interviewState.activeSpeaker === "candidate"
                  ? "border-mint/45 bg-gradient-to-br from-mint/20 via-[#14243a] to-violet/15 text-white shadow-[0_0_60px_rgba(124,245,197,.13)]"
                  : "border-white/[0.09] bg-gradient-to-br from-white/[0.07] via-[#101a2d] to-violet/[0.08] text-slate-100"
              }`}
            >
              <span className="absolute inset-[7px] rounded-full border border-white/[0.045]" />
              {initials(interviewState.candidateName)}
            </div>
            <span
              className={`absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                interviewState.activeSpeaker === "candidate"
                  ? "border-mint/25 bg-[#0b1422] text-mint"
                  : "border-white/[0.08] bg-[#0b1422] text-slate-400"
              }`}
            >
              <span
                className={`h-1 w-1 rounded-full ${
                  interviewState.activeSpeaker === "candidate" ? "bg-mint status-pulse" : "bg-slate-600"
                }`}
              />
              {interviewState.activeSpeaker === "candidate" ? "Speaking now" : "Listening"}
            </span>
          </div>

          <div className="mt-8">
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-white sm:text-2xl">
              {interviewState.candidateName}
            </h2>
            <p className="mt-1.5 text-xs text-slate-500">
              Candidate · {interviewState.targetRole} · {interviewState.experienceLevel}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[10px] text-slate-400">
              <Headphones size={12} className={isLive ? "text-mint" : "text-slate-500"} />
              {isLive
                ? hasCandidateFloor
                  ? "Candidate has the floor"
                  : `Live voice · ${activeFocus} focus`
                : connectionMeta[connectionState].label}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[10px] text-slate-400">
              <LockKeyhole size={11} className="text-violet-200/70" />
              Floor {interviewState.floorLocked ? "locked" : "open"}
            </span>
            {isAnalyzing ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-violet/20 bg-violet/[0.07] px-3 py-1.5 text-[10px] text-violet-200">
                <span className="h-1 w-1 rounded-full bg-violet status-pulse" />
                Evaluating response
              </span>
            ) : null}
          </div>

          {connectionState === "error" ? (
            <div className="mt-6 flex max-w-md items-start gap-2.5 rounded-2xl border border-red-400/15 bg-red-400/[0.055] px-4 py-3 text-left">
              <ConnectionIcon size={15} className="mt-0.5 shrink-0 text-red-300" />
              <div>
                <p className="text-[11px] font-semibold text-red-200">Voice session unavailable</p>
                <p className="mt-1 text-[10px] leading-4 text-red-200/60">{statusMessage}</p>
              </div>
            </div>
          ) : null}

          {hasEnded ? (
            <div className="mt-6 flex max-w-md items-start gap-2.5 rounded-2xl border border-mint/15 bg-mint/[0.045] px-4 py-3 text-left">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-mint" />
              <div>
                <p className="text-[11px] font-semibold text-mint">Session ended</p>
                <p className="mt-1 text-[10px] leading-4 text-slate-400">
                  The conversation is closed. Your transcript and evidence remain available in this room.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-white/[0.06] bg-black/15 px-5 py-4 lg:px-6">
          <div className="flex items-center justify-between gap-3">
            <SectionHeading icon={MessageSquareText} title="Floor transcript" />
            <span className="font-mono text-[10px] text-slate-600">{interviewState.transcript.length} turns</span>
          </div>
          <p className="mt-2.5 min-h-[40px] text-sm leading-6 text-slate-200">
            {latestTurn?.text || "The room is standing by. Start live voice or type an answer to begin."}
          </p>
          {latestTurn ? (
            <p className="mt-1 text-[10px] text-slate-600">
              {speakerLabel(latestTurn.speaker)} · {new Date(latestTurn.timestamp).toLocaleTimeString()}
            </p>
          ) : null}

          <form onSubmit={onManualSubmit} className="mt-3 flex items-center gap-2">
            <div className="relative flex-1">
              <UserRound
                size={14}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600"
              />
              <input
                type="text"
                value={textInput}
                onChange={event => onTextInputChange(event.target.value)}
                placeholder="Type a candidate answer…"
                className="w-full rounded-xl border border-white/[0.07] bg-white/[0.025] py-2.5 pl-9 pr-3 text-xs text-white placeholder:text-slate-600 transition focus:border-mint/40 focus:bg-white/[0.04] focus:outline-none focus:ring-4 focus:ring-mint/[0.06]"
              />
            </div>
            <button
              type="submit"
              disabled={isAnalyzing}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-mint px-3.5 py-2.5 text-xs font-semibold text-ink transition hover:bg-[#9bf8d5] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={13} />
              <span className="hidden sm:inline">{isAnalyzing ? "Analyzing" : "Send"}</span>
            </button>
          </form>
          <p className="mt-2 text-[9px] text-slate-600">
            Typed answers are analyzed by the same evidence pipeline as finalized speech.
          </p>
        </div>
      </div>
    </section>
  );
}

function StatusCell({ label, status, value }: { label: string; status: string; value?: string }) {
  const tone =
    status === "supported"
      ? "border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300"
      : status === "contradictory"
        ? "border-red-400/15 bg-red-400/[0.05] text-red-300"
        : status === "missing" || status === "pending"
          ? "border-amber-400/15 bg-amber-400/[0.05] text-amber-200"
          : "border-white/[0.06] bg-white/[0.025] text-slate-400";

  return (
    <div className={`rounded-lg border px-2 py-1.5 ${tone}`}>
      <span className="block text-[8px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="mt-0.5 block text-[10px] font-medium capitalize">{value ?? status}</span>
    </div>
  );
}

function ClaimCard({ claim }: { claim: SharedInterviewState["claims"][number] }) {
  return (
    <article className="rounded-2xl border border-white/[0.06] bg-white/[0.018] p-3.5 transition hover:border-white/[0.1] hover:bg-white/[0.025]">
      <div className="flex items-center gap-2">
        <span className="rounded-md border border-mint/15 bg-mint/[0.05] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-mint/80">
          {claim.category}
        </span>
        <span
          className={`ml-auto rounded-md border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] ${
            claim.status === "resolved"
              ? "border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300"
              : "border-amber-400/15 bg-amber-400/[0.06] text-amber-200"
          }`}
        >
          {claim.status}
        </span>
      </div>
      <p className="mt-2.5 text-[12px] font-medium leading-5 text-slate-100">{claim.claim}</p>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <StatusCell label="Technical" status={claim.technicalStatus} />
        <StatusCell label="Product" status={claim.productStatus} />
        <StatusCell label="Confidence" status="neutral" value={`${Math.round(claim.confidence * 100)}%`} />
      </div>
      {claim.behaviouralStatus ? (
        <div className="mt-1.5">
          <StatusCell label="Behavioural" status={claim.behaviouralStatus} />
        </div>
      ) : null}
      {claim.evidence ? (
        <p className="mt-2.5 border-l border-white/[0.08] pl-2.5 text-[10px] italic leading-4 text-slate-500">
          “{claim.evidence.slice(0, 90)}{claim.evidence.length > 90 ? "…" : ""}”
        </p>
      ) : null}
      <p className="mt-2.5 truncate font-mono text-[8px] uppercase tracking-[0.08em] text-slate-600">
        Source · {claim.sourceTurnId}
      </p>
    </article>
  );
}

function DecisionCard({ decision }: { decision: NonNullable<SharedInterviewState["lastDecision"]> }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-violet/20 bg-gradient-to-br from-violet/[0.09] to-white/[0.015] p-4">
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet/40 to-transparent" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-violet-200/80">
          Moderator · next floor
        </span>
        <span className="font-mono text-[9px] text-slate-500">P{decision.priority}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-white">
        {speakerLabel(decision.nextSpeaker)}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-slate-300">{decision.reason}</p>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[8px] uppercase tracking-[0.1em] text-slate-500">
        <span className="rounded border border-white/[0.06] bg-black/10 px-1.5 py-0.5">
          Objective · {decision.questionObjective || "Not specified"}
        </span>
        <span className="rounded border border-white/[0.06] bg-black/10 px-1.5 py-0.5">
          Difficulty · {decision.difficulty}/5
        </span>
      </div>
      {decision.suggestedQuestion ? (
        <p className="mt-3 rounded-xl border border-white/[0.055] bg-black/15 p-2.5 text-[11px] leading-5 text-slate-300">
          “{decision.suggestedQuestion}”
        </p>
      ) : null}
    </div>
  );
}

function DiagnosticsPanel({
  diagnostics,
  interviewState
}: {
  diagnostics: Diagnostics;
  interviewState: SharedInterviewState;
}) {
  const rows = [
    { label: "Connection", value: diagnostics.connectionMs ? `${diagnostics.connectionMs} ms` : "Standby", icon: Clock3 },
    { label: "Analysis latency", value: diagnostics.lastAnalysisMs ? `${diagnostics.lastAnalysisMs} ms` : "—", icon: Zap },
    { label: "Processed turns", value: String(diagnostics.turnsCount), icon: Activity },
    ...(diagnostics.timeToFirstAudioMs > 0
      ? [{ label: "First audio", value: `${diagnostics.timeToFirstAudioMs} ms`, icon: Headphones }]
      : [])
  ];

  return (
    <details className="group rounded-2xl border border-white/[0.06] bg-white/[0.018]">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3.5 py-3 [&::-webkit-details-marker]:hidden">
        <Activity size={13} className="text-slate-500" />
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Session diagnostics</span>
        <span className="ml-auto font-mono text-[9px] text-slate-600">{diagnostics.turnsCount} turns</span>
        <ChevronDown size={13} className="text-slate-600 transition group-open:rotate-180" />
      </summary>
      <div className="grid grid-cols-2 gap-1.5 border-t border-white/[0.05] p-3">
        {rows.map(row => {
          const Icon = row.icon;
          return (
            <div key={row.label} className="rounded-lg border border-white/[0.05] bg-black/10 px-2 py-2">
              <span className="flex items-center gap-1 text-[8px] uppercase tracking-[0.1em] text-slate-600">
                <Icon size={10} />
                {row.label}
              </span>
              <span className="mt-1 block font-mono text-[10px] text-slate-300">{row.value}</span>
            </div>
          );
        })}
      </div>
      {interviewState.finalAssessment ? (
        <div className="border-t border-white/[0.05] p-3">
          <Link
            href={`/passport/EP-${interviewState.interviewId.slice(0, 6).toUpperCase()}`}
            className="flex items-center justify-center gap-2 rounded-xl bg-mint px-3 py-2.5 text-[11px] font-semibold text-ink transition hover:bg-[#9bf8d5]"
          >
            <Award size={14} />
            View verified passport
            <ChevronRight size={13} />
          </Link>
        </div>
      ) : null}
    </details>
  );
}

function InsightRail({
  interviewState,
  diagnostics
}: {
  interviewState: SharedInterviewState;
  diagnostics: Diagnostics;
}) {
  const claims = interviewState.claims;
  const decision = interviewState.lastDecision;

  return (
    <aside className="surface order-3 flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-[24px]">
      <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3.5">
        <Sparkles size={14} className="text-mint" />
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Live intelligence</p>
        <span className="ml-auto rounded-full border border-mint/15 bg-mint/[0.05] px-2 py-0.5 font-mono text-[9px] text-mint/80">
          {claims.length} nodes
        </span>
      </div>

      <div className="scrollbar-thin flex-1 space-y-2.5 overflow-y-auto p-3.5">
        {claims.length > 0 ? (
          claims.map(claim => <ClaimCard key={claim.id} claim={claim} />)
        ) : (
          <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.012] px-4 py-7 text-center">
            <div className="mx-auto grid h-9 w-9 place-items-center rounded-full border border-white/[0.07] bg-white/[0.025]">
              <Sparkles size={14} className="text-slate-500" />
            </div>
            <p className="mt-3 text-[11px] font-medium text-slate-400">ClaimGraph is waiting</p>
            <p className="mx-auto mt-1 max-w-[220px] text-[10px] leading-4 text-slate-600">
              Finalized candidate answers become evidence-linked claims here.
            </p>
          </div>
        )}

        {interviewState.contradictions.length > 0 ? (
          <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.045] p-3.5">
            <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-amber-200/80">
              <ShieldCheck size={12} />
              Contradiction review
            </div>
            <div className="mt-2 space-y-1.5">
              {interviewState.contradictions.map(contradiction => (
                <p key={contradiction.id} className="text-[10px] leading-4 text-amber-100/70">
                  {contradiction.resolved ? "Reconciled" : "Unresolved"} · {contradiction.description}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {decision ? <DecisionCard decision={decision} /> : null}
      </div>

      <div className="border-t border-white/[0.06] p-3">
        <DiagnosticsPanel diagnostics={diagnostics} interviewState={interviewState} />
      </div>
    </aside>
  );
}

function TranscriptPanel({ transcript }: { transcript: SharedInterviewState["transcript"] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (transcript.length === 0) return;
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [transcript.length]);

  return (
    <section className="surface mx-auto mt-4 max-w-[1600px] rounded-[24px] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <MessageSquareText size={14} className="text-mint" />
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Conversation log</p>
        <span className="rounded-full border border-white/[0.06] bg-white/[0.025] px-2 py-0.5 font-mono text-[9px] text-slate-500">
          {transcript.length} turns
        </span>
        <span className="ml-auto hidden items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-slate-600 sm:flex">
          <ShieldCheck size={11} />
          Evidence linked
        </span>
      </div>

      {transcript.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-white/[0.07] px-4 py-6 text-center text-[10px] text-slate-600">
          Finalized speech and typed answers appear here as the interview progresses.
        </div>
      ) : (
        <div className="scrollbar-thin mt-3 max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {transcript.map(turn => {
            const isCandidate = turn.speaker === "candidate";
            const label = speakerLabel(turn.speaker);
            return (
              <div
                key={turn.id}
                className="flex items-start gap-3 rounded-xl border border-transparent px-2.5 py-2.5 transition hover:border-white/[0.05] hover:bg-white/[0.018]"
              >
                <div
                  className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[9px] font-bold ${
                    isCandidate
                      ? "border-mint/20 bg-mint/[0.07] text-mint"
                      : "border-violet/20 bg-violet/[0.07] text-violet-200"
                  }`}
                >
                  {isCandidate ? "C" : agentMeta[turn.speaker as AgentId]?.short || "A"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`text-[10px] font-semibold ${isCandidate ? "text-mint" : "text-violet-200"}`}>
                      {label}
                    </p>
                    <span className="font-mono text-[8px] text-slate-600">
                      {new Date(turn.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="max-w-[180px] truncate font-mono text-[8px] text-slate-700">{turn.id}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-slate-300">{turn.text}</p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      )}
    </section>
  );
}

export function LiveInterviewView({
  connectionState,
  statusMessage,
  muted,
  isAnalyzing,
  textInput,
  interviewState,
  diagnostics,
  onStart,
  onStop,
  onToggleMute,
  onTextInputChange,
  onManualSubmit
}: LiveInterviewViewProps) {
  const elapsed = useSessionElapsed(connectionState === "live");

  return (
    <main className="relative min-h-screen overflow-hidden bg-ink pb-5">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(124,245,197,.07),transparent_32%),radial-gradient(circle_at_92%_18%,rgba(156,140,255,.06),transparent_26%),radial-gradient(circle_at_8%_82%,rgba(156,140,255,.035),transparent_28%)]" />
      <div className="page-noise pointer-events-none fixed inset-0 opacity-[0.18]" />

      <header className="relative z-10 mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="group flex shrink-0 items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl border border-mint/15 bg-gradient-to-br from-mint/[0.12] to-violet/[0.08] transition group-hover:border-mint/30">
              <AudioLines size={14} className="text-mint" />
            </span>
            <span className="text-[15px] font-bold tracking-[-0.02em] text-white">
              echo<span className="text-mint">panel</span>
            </span>
          </Link>
          <span className="hidden h-4 w-px bg-white/[0.08] sm:block" />
          <span className="hidden truncate text-[10px] uppercase tracking-[0.16em] text-slate-600 sm:block">
            Interview room / {interviewState.targetRole}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/demo"
            className="hidden rounded-full px-3 py-2 text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500 transition hover:text-white sm:block"
          >
            Demo
          </Link>
          <Link
            href="/setup"
            className="rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400 transition hover:border-white/15 hover:text-white"
          >
            Setup
          </Link>
          <span className="hidden h-4 w-px bg-white/[0.08] sm:block" />
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-full border border-white/[0.08] bg-white/[0.035] text-[10px] font-bold text-slate-200">
              {initials(interviewState.candidateName)}
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="max-w-[150px] truncate text-[11px] font-semibold text-slate-200">
                {interviewState.candidateName}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[9px] text-slate-600">
                <span
                  className={`h-1 w-1 rounded-full ${connectionMeta[connectionState].dot} ${
                    connectionState === "live" ? "status-pulse" : ""
                  }`}
                />
                Session {connectionMeta[connectionState].label.toLowerCase()}
              </p>
            </div>
          </div>
        </div>
      </header>

      <SessionStrip
        connectionState={connectionState}
        statusMessage={statusMessage}
        interviewState={interviewState}
        elapsed={connectionState === "live" ? elapsed : "—"}
      />

      <div className="relative z-10 mx-auto mt-4 grid max-w-[1600px] gap-4 px-3 sm:px-5 xl:grid-cols-[260px_minmax(0,1fr)_360px] lg:px-8">
        <PanelRail interviewState={interviewState} connectionState={connectionState} />
        <Stage
          connectionState={connectionState}
          statusMessage={statusMessage}
          muted={muted}
          isAnalyzing={isAnalyzing}
          textInput={textInput}
          interviewState={interviewState}
          elapsed={connectionState === "live" ? elapsed : "—"}
          onStart={onStart}
          onStop={onStop}
          onToggleMute={onToggleMute}
          onTextInputChange={onTextInputChange}
          onManualSubmit={onManualSubmit}
        />
        <InsightRail interviewState={interviewState} diagnostics={diagnostics} />
      </div>

      <div className="relative z-10 px-3 sm:px-5 lg:px-8">
        <TranscriptPanel transcript={interviewState.transcript} />
      </div>
    </main>
  );
}
