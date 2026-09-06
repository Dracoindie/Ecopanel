"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Award,
  ChevronRight,
  Clock,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Send,
  Sparkles,
  Zap
} from "lucide-react";
import {
  AgentId,
  AgentStatus,
  InterviewerRole,
  ModeratorDecision,
  SharedInterviewState,
  TranscriptTurn
} from "@/lib/types";
import {
  authorizeSpeaker,
  buildInterviewGreeting,
  createStateFromSetup,
  generateOpeningQuestion,
  initializeInterviewSession,
  releaseFloor
} from "@/lib/orchestrator";

type Session = {
  appId: string;
  channel: string;
  uid: string;
  token: string;
  agentUid: string;
  agentId: string;
};

const SETUP_KEY = "echopanel-interview-setup";

const labels: Record<AgentId, string> = {
  technical: "Technical",
  product: "Product / Manager",
  behavioural: "Behavioural",
  moderator: "Moderator",
  customer: "Customer"
};

const avatars: Record<AgentId, string> = {
  technical: "T",
  product: "P",
  behavioural: "B",
  moderator: "M",
  customer: "C"
};

const GENERIC_GREETING_RE = /how can i help you today/i;

function extractTranscriptText(item: unknown): string {
  if (!item || typeof item !== "object") return "";
  const value = item as Record<string, unknown>;
  return [value.text, value.content, value.message].find((x): x is string => typeof x === "string") || "";
}

type AgoraTranscriptItem = {
  uid?: string;
  turn_id?: number;
  text?: string;
  status?: number;
  metadata?: { object?: string; final?: boolean; turn_status?: number } | null;
};

function transcriptKind(item: AgoraTranscriptItem): "candidate" | "agent" | "unknown" {
  // The toolkit documents metadata.object as the reliable source discriminator.
  if (item.metadata?.object === "user.transcription") return "candidate";
  if (item.metadata?.object === "assistant.transcription") return "agent";
  return "unknown";
}

function loadSetupFromStorage() {
  if (typeof window === "undefined") return null;
  try {
    let result: {
      candidateName?: string;
      targetRole?: string;
      jobDescription?: string;
      experienceLevel?: string;
      interviewId?: string;
    } = {};

    const raw = sessionStorage.getItem(SETUP_KEY);
    if (raw) {
      try {
        result = JSON.parse(raw);
      } catch {}
    }

    // Merge URL query params if present
    if (typeof window.location !== "undefined" && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("role")) result.targetRole = params.get("role")!;
      if (params.get("jd")) result.jobDescription = params.get("jd")!;
      if (params.get("experience")) result.experienceLevel = params.get("experience")!;
      if (params.get("candidate")) result.candidateName = params.get("candidate")!;
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

export function LiveAgoraInterview() {
  const [connectionState, setConnectionState] = useState<"ready" | "connecting" | "live" | "error">("ready");
  const [statusMessage, setStatusMessage] = useState("Configure setup, then start the live panel. Moderator owns the floor.");
  const [muted, setMuted] = useState(false);
  const [interviewState, setInterviewState] = useState<SharedInterviewState>(() => createStateFromSetup({}));
  const [diagnostics, setDiagnostics] = useState({
    connectionMs: 0,
    lastAnalysisMs: 0,
    timeToFirstAudioMs: 0,
    turnsCount: 0
  });
  const [textInput, setTextInput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const sessionRef = useRef<Session | null>(null);
  const rtcRef = useRef<any>(null);
  const trackRef = useRef<any>(null);
  const rtmRef = useRef<any>(null);
  const voiceAiRef = useRef<any>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const lastProcessedTextRef = useRef<string>("");
  const lastProcessedTurnIdRef = useRef<number | null>(null);
  const processedTurnIdsRef = useRef<Set<number>>(new Set());
  const processedFallbackEventIdsRef = useRef<Set<string>>(new Set());
  const analyzingRef = useRef(false);
  const floorBusyRef = useRef(false);
  const floorTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const interviewStateRef = useRef(interviewState);
  interviewStateRef.current = interviewState;

  useEffect(() => {
    const setup = loadSetupFromStorage();
    if (setup) {
      setInterviewState(
        createStateFromSetup({
          candidateName: setup.candidateName,
          targetRole: setup.targetRole,
          jobDescription: setup.jobDescription,
          experienceLevel: setup.experienceLevel,
          interviewId: setup.interviewId
        })
      );
      setStatusMessage(
        `Ready for ${setup.targetRole || "role"} · ${setup.experienceLevel || "Mid"} · JD ${setup.jobDescription ? "loaded" : "empty"}`
      );
    }
  }, []);

  const broadcastAuthorizedSpeech = async (text: string) => {
    const session = sessionRef.current;
    if (!session?.agentId || !text.trim()) return false;
    if (floorBusyRef.current) return false;
    floorBusyRef.current = true;
    try {
      const response = await fetch("/api/interview/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: session.agentId,
          text,
          priority: "INTERRUPT",
          interruptable: true
        })
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Agora rejected the authorized speech");
      }
      console.info(`[EchoPanel Speech] question=${JSON.stringify(text)}`);
      return true;
    } catch (speakErr) {
      console.warn("Agora speak broadcast error:", speakErr);
      return false;
    } finally {
      setTimeout(() => {
        floorBusyRef.current = false;
      }, 1200);
    }
  };

  const interruptAutonomousAgent = async () => {
    const agentId = sessionRef.current?.agentId;
    if (!agentId) return;
    try {
      await fetch("/api/interview/interrupt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId })
      });
    } catch (error) {
      // The follow-up speak call also uses INTERRUPT. Do not block analysis on a
      // best-effort preemption failure.
      console.warn("Agora autonomous-turn interrupt failed:", error);
    }
  };

  const processFinalizedCandidateTurn = async (rawText: string, rawTurnId?: number) => {
    const text = rawText.trim();
    const normText = text.toLowerCase().replace(/[^\w\s]/g, "");
    if (!text || normText.length < 3 || GENERIC_GREETING_RE.test(text)) return;
    const fallbackEventId = `${normText}:${rawTurnId ?? "manual"}`;
    if (rawTurnId != null && processedTurnIdsRef.current.has(rawTurnId)) return;
    if (rawTurnId == null && processedFallbackEventIdsRef.current.has(fallbackEventId)) return;
    if (analyzingRef.current || isAnalyzing) return;

    if (rawTurnId != null) processedTurnIdsRef.current.add(rawTurnId);
    else processedFallbackEventIdsRef.current.add(fallbackEventId);
    analyzingRef.current = true;
    lastProcessedTextRef.current = text;
    if (rawTurnId != null) lastProcessedTurnIdRef.current = rawTurnId;

    if (floorTimerRef.current) {
      clearTimeout(floorTimerRef.current);
      floorTimerRef.current = null;
    }

    const turnId = `turn-${Date.now()}`;
    const candidateTurn: TranscriptTurn = {
      id: turnId,
      speaker: "candidate",
      text,
      timestamp: Date.now(),
      isFinal: true,
      rawTurnId
    };

    // Stop any pipeline-generated turn as soon as Agora finalizes the candidate.
    // The next audio may only be the Moderator-authorized speak payload.
    void interruptAutonomousAgent();
    console.info(`[EchoPanel Transcript] speaker=candidate turnId=${turnId}`);
    setIsAnalyzing(true);
    // 1. Authoritative floor moves to candidate immediately
    setInterviewState(prev => ({
      ...prev,
      activeSpeaker: "candidate",
      floorLocked: false,
      agentStates: {
        ...prev.agentStates,
        moderator: "thinking",
        technical: "listening",
        product: "listening",
        behavioural: "listening"
      },
      transcript: prev.transcript.some(t => t.id === turnId) ? prev.transcript : [...prev.transcript, candidateTurn]
    }));

    const analysisStart = performance.now();

    try {
      const res = await fetch("/api/interview/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turn: candidateTurn, state: interviewStateRef.current })
      });

      const data = await res.json();
      const analysisDuration = Math.round(performance.now() - analysisStart);

      if (res.ok && data.updatedState) {
        const nextDecision: ModeratorDecision = data.decision;
        setDiagnostics(prev => ({
          ...prev,
          lastAnalysisMs: analysisDuration,
          turnsCount: prev.turnsCount + 1
        }));

        if (nextDecision?.suggestedQuestion) {
          // First show the Moderator's request. Only mark a role speaking after
          // Agora accepts the exact TTS payload, so the UI cannot claim a voice
          // that never reached the real audio layer.
          setInterviewState(prev => {
            const merged = {
              ...data.updatedState,
              transcript: prev.transcript.some(t => t.id === turnId)
                ? data.updatedState.transcript
                : [...data.updatedState.transcript, candidateTurn]
            };
            return merged;
          });

          console.info(`[EchoPanel Analysis] claims=${data.analysis?.claims?.length ?? 0}`);
          console.info(`[EchoPanel ClaimGraph] nodes=${data.updatedState.claims?.length ?? 0}`);
          console.info(`[EchoPanel Moderator] nextSpeaker=${nextDecision.nextSpeaker} reason=${nextDecision.reason}`);
          const spoken = await broadcastAuthorizedSpeech(nextDecision.suggestedQuestion);
          if (!spoken) return;
          setInterviewState(prev => authorizeSpeaker(
            { ...data.updatedState, transcript: prev.transcript },
            nextDecision.nextSpeaker as InterviewerRole,
            nextDecision.suggestedQuestion
          ));

          // Maintain floor while interviewer is speaking; yield floor when question ends
          if (floorTimerRef.current) clearTimeout(floorTimerRef.current);
          const speechDurationMs = Math.min(8000, Math.max(4500, nextDecision.suggestedQuestion.length * 70));
          floorTimerRef.current = setTimeout(() => {
            setInterviewState(prev => releaseFloor(prev));
          }, speechDurationMs);
        } else {
          setInterviewState(data.updatedState);
        }
      }
    } catch (err) {
      console.error("Analysis pipeline error:", err);
    } finally {
      analyzingRef.current = false;
      setIsAnalyzing(false);
    }
  };

  const cleanupConnections = async () => {
    const session = sessionRef.current;
    try {
      if (session?.agentId) {
        await fetch("/api/agora/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: session.agentId })
        });
      }
    } catch {}

    try { voiceAiRef.current?.unsubscribe(); voiceAiRef.current?.destroy(); } catch {}
    try { await rtmRef.current?.logout(); } catch {}
    try { await rtcRef.current?.leave(); } catch {}
    try { trackRef.current?.close(); } catch {}

    sessionRef.current = null;
    rtcRef.current = null;
    trackRef.current = null;
    rtmRef.current = null;
    voiceAiRef.current = null;
    floorBusyRef.current = false;
  };

  const stop = async () => {
    await cleanupConnections();
    setConnectionState("ready");
    setStatusMessage("Live interview ended.");

    if (interviewStateRef.current.transcript.length > 0) {
      try {
        const assessRes = await fetch("/api/interview/assess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(interviewStateRef.current)
        });
        const assessData = await assessRes.json();
        if (assessData.assessment) {
          setInterviewState(prev => ({ ...prev, finalAssessment: assessData.assessment }));
        }
      } catch (err) {
        console.warn("Could not generate assessment:", err);
      }
    }
  };

  const start = async () => {
    setConnectionState("connecting");
    setStatusMessage("Requesting secure Agora RTC + RTM session…");
    startTimeRef.current = performance.now();
    lastProcessedTextRef.current = "";
    lastProcessedTurnIdRef.current = null;
    processedTurnIdsRef.current.clear();
    processedFallbackEventIdsRef.current.clear();

    const setup = loadSetupFromStorage();
    const baseState = createStateFromSetup({
      candidateName: setup?.candidateName || interviewStateRef.current.candidateName,
      targetRole: setup?.targetRole || interviewStateRef.current.targetRole,
      jobDescription: setup?.jobDescription || interviewStateRef.current.jobDescription,
      experienceLevel: setup?.experienceLevel || interviewStateRef.current.experienceLevel,
      interviewId: setup?.interviewId || interviewStateRef.current.interviewId
    });
    setInterviewState(baseState);

    try {
      const tokenRes = await fetch("/api/agora/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId: baseState.interviewId })
      });
      const token = await tokenRes.json();
      if (!tokenRes.ok) {
        const missingVars = Array.isArray(token.missing) ? token.missing.join(", ") : "";
        throw new Error(
          token.error === "Agora is not configured"
            ? `Agora credentials missing (${missingVars || "AGORA_APP_ID, AGORA_APP_CERTIFICATE"}). Please configure .env.local or use deterministic /demo mode.`
            : (token.error || "Failed to issue Agora token")
        );
      }

      const greeting = buildInterviewGreeting(baseState);
      const openingQuestion = generateOpeningQuestion(baseState);

      const agentRes = await fetch("/api/agora/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: token.channel,
          requesterId: token.uid,
          targetRole: baseState.targetRole,
          jobDescription: baseState.jobDescription,
          experienceLevel: baseState.experienceLevel,
          candidateName: baseState.candidateName,
          greeting,
          openingQuestion
        })
      });
      const agent = await agentRes.json();
      if (!agentRes.ok) throw new Error(agent.error || "Failed to start Agora Conversational AI Agent");

      sessionRef.current = { ...token, agentId: agent.agentId };

      const [{ default: AgoraRTC }, rtmModule, toolkit] = await Promise.all([
        import("agora-rtc-sdk-ng"),
        import("agora-rtm"),
        import("agora-agent-client-toolkit")
      ]);

      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      rtcRef.current = client;

      client.on("user-published", async (user: any, mediaType: "audio" | "video") => {
        if (mediaType !== "audio") return;
        await client.subscribe(user, mediaType);
        user.audioTrack?.play(audioRef.current);
        setDiagnostics(prev => ({
          ...prev,
          timeToFirstAudioMs: Math.round(performance.now() - startTimeRef.current)
        }));
      });

      client.on("connection-state-change", (next: string) => {
        setStatusMessage(next === "CONNECTED" ? "Connected to Agora. Moderator initializing interview…" : `Agora connection: ${next}`);
      });

      await client.join(token.appId, token.channel, token.token, Number(token.uid));
      const mic = await AgoraRTC.createMicrophoneAudioTrack();
      trackRef.current = mic;
      await client.publish([mic]);

      const AgoraRTM = (rtmModule as any).default || rtmModule;
      const rtm = new AgoraRTM.RTM(token.appId, token.uid);
      rtmRef.current = rtm;
      await rtm.login({ token: token.token });
      await rtm.subscribe(token.channel);

      const ai = await (toolkit as any).AgoraVoiceAI.init({
        rtcEngine: client,
        rtmConfig: { rtmEngine: rtm },
        renderMode: (toolkit as any).TranscriptHelperMode.TEXT,
        enableLog: false
      });
      voiceAiRef.current = ai;

      const candidateUid = String(token.uid);
      const agentUid = String(token.agentUid || agent.agentUid);

      ai.on((toolkit as any).AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (items: unknown[]) => {
        if (!Array.isArray(items) || items.length === 0) return;
        // The toolkit sends complete history on every revision. Scan all entries,
        // but only process a user.transcription whose metadata.final is true.
        for (const entry of items as AgoraTranscriptItem[]) {
          const text = extractTranscriptText(entry);
          const kind = transcriptKind(entry);
          const turnId = typeof entry.turn_id === "number" ? entry.turn_id : undefined;
          const uid = String(entry.uid ?? "");
          const isCandidate = kind === "candidate" || (kind === "unknown" && uid === candidateUid);
          const isAgent = kind === "agent" || (kind === "unknown" && uid === agentUid);

          if (isCandidate && entry.metadata?.final === true && text) {
            void processFinalizedCandidateTurn(text, turnId);
          } else if (isAgent && entry.status === (toolkit as any).TurnStatus?.END && text) {
            // EchoPanel records interviewer text when it authorizes it. Do not
            // append the SDK's full-history echo or autonomous output as a role.
            // If an unexpected turn arrives, interrupt it at the audio source.
            if (!interviewStateRef.current.transcript.some(t => t.text.trim() === text.trim())) {
              console.warn("[EchoPanel Speech] unexpected Agora agent transcript interrupted");
              void interruptAutonomousAgent();
            }
          }
        }
      });

      ai.on((toolkit as any).AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_: unknown, event: any) => {
        setStatusMessage(`Agora voice layer: ${event?.state || "active"} · Moderator authoritative`);
      });

      ai.on((toolkit as any).AgoraVoiceAIEvents.AGENT_INTERRUPTED, () => {
        setStatusMessage("Candidate speaking (barge-in). Agent yields floor.");
        if (floorTimerRef.current) {
          clearTimeout(floorTimerRef.current);
          floorTimerRef.current = null;
        }
        setInterviewState(prev => releaseFloor(prev));
      });

      ai.subscribeMessage(token.channel);

      // EchoPanel takes ownership: initialize interview + authorize first speaker
      const init = initializeInterviewSession(baseState);
      setInterviewState(init.updatedState);

      const connDuration = Math.round(performance.now() - startTimeRef.current);
      setConnectionState("live");
      setStatusMessage("Interview initialized. Moderator coordinating Technical / Product / Behavioural.");
      setDiagnostics(prev => ({ ...prev, connectionMs: connDuration }));

      setTimeout(() => {
        setInterviewState(prev => releaseFloor(prev));
      }, 5000);
    } catch (err) {
      await cleanupConnections();
      setConnectionState("error");
      setStatusMessage(err instanceof Error ? err.message : "Live setup encountered an issue.");
    }
  };

  useEffect(() => () => { void cleanupConnections(); }, []);

  const toggleMute = async () => {
    if (!trackRef.current) return;
    await trackRef.current.setEnabled(muted);
    setMuted(!muted);
  };

  const handleManualCandidateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    void processFinalizedCandidateTurn(textInput);
    setTextInput("");
  };

  const panelAgents: AgentId[] = ["moderator", "technical", "product", "behavioural"];
  const decision = interviewState.lastDecision;
  const claims = interviewState.claims;

  return (
    <main className="min-h-screen bg-ink p-3 md:p-6">
      <header className="mx-auto flex max-w-[1550px] items-center justify-between pb-4">
        <Link href="/" className="font-bold">
          echo<span className="text-mint">panel</span>
        </Link>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="rounded-full border border-mint/40 bg-mint/10 px-3 py-1 text-mint font-semibold">
            LIVE AGORA MODE
          </span>
          <span>Difficulty {interviewState.difficulty}/5</span>
          <span className="hidden sm:inline">{interviewState.experienceLevel}</span>
          <Link href="/setup" className="text-slate-400 hover:text-white transition-colors">
            Setup →
          </Link>
          <Link href="/demo" className="text-slate-400 hover:text-white transition-colors">
            Demo →
          </Link>
        </div>
      </header>

      <div className="mx-auto mb-4 flex max-w-[1550px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${connectionState === "live" ? "bg-mint pulse" : connectionState === "connecting" ? "bg-amber-400" : connectionState === "error" ? "bg-red-400" : "bg-slate-500"}`} />
          <div>
            <p className="text-sm font-medium text-slate-200">{statusMessage}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Role: {interviewState.targetRole}
              {interviewState.jobDescription ? ` · JD signals active (${Math.min(80, interviewState.jobDescription.length)} chars)` : " · No JD — add one in Setup"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {connectionState !== "live" ? (
            <button
              onClick={start}
              disabled={connectionState === "connecting"}
              className="flex items-center gap-2 rounded-full bg-mint px-5 py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
            >
              <Mic size={16} /> Start live panel voice
            </button>
          ) : (
            <>
              <button
                onClick={toggleMute}
                className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm text-slate-300"
              >
                {muted ? <Mic size={15} /> : <MicOff size={15} />} {muted ? "Unmute" : "Mute"}
              </button>
              <button
                onClick={stop}
                className="flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200"
              >
                <PhoneOff size={15} /> End interview
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mx-auto grid max-w-[1550px] gap-4 xl:grid-cols-[300px_minmax(0,1fr)_380px]">
        <aside className="glass order-2 rounded-2xl p-4 xl:order-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold tracking-widest text-slate-400">THE PANEL</p>
              <span className="text-xs text-mint">Authoritative Floor</span>
            </div>

            {panelAgents.map(id => {
              const agentStatus: AgentStatus = interviewState.agentStates[id] || "idle";
              const isSpeaking = agentStatus === "speaking";
              const isRequesting = agentStatus === "requesting";
              const isHandoff = agentStatus === "handoff";
              const isThinking = agentStatus === "thinking";

              return (
                <div
                  key={id}
                  className={`mb-3 rounded-xl border p-4 transition-all ${
                    isSpeaking
                      ? "border-mint/60 bg-mint/10 shadow-glow scale-[1.02]"
                      : isRequesting
                      ? "border-amber-400/50 bg-amber-400/10"
                      : isHandoff
                      ? "border-violet/50 bg-violet/10"
                      : isThinking
                      ? "border-sky-400/40 bg-sky-400/10"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <b className={`grid h-10 w-10 place-items-center rounded-full text-sm font-bold ${isSpeaking ? "bg-mint text-ink" : "bg-slate-700 text-white"}`}>
                      {avatars[id]}
                    </b>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{labels[id]}</p>
                      <p
                        className={`mt-1 text-xs capitalize ${
                          isSpeaking
                            ? "text-mint font-semibold"
                            : isRequesting
                            ? "text-amber-300 font-medium"
                            : isHandoff
                            ? "text-violet font-medium"
                            : isThinking
                            ? "text-sky-300"
                            : "text-slate-500"
                        }`}
                      >
                        ● {isRequesting ? "Requesting floor" : isHandoff ? "Handoff" : agentStatus}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-bold tracking-widest text-slate-400 mb-3">LIVE COMPETENCIES</p>
              <div className="space-y-2 text-xs">
                {Object.entries(interviewState.competencies).map(([key, val]) => (
                  <div key={key}>
                    <div className="flex justify-between text-slate-300 mb-1 capitalize">
                      <span>{key.replace(/([A-Z])/g, " $1")}</span>
                      <b>{val.toFixed(1)}/10</b>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full bg-mint" style={{ width: `${val * 10}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-white/5 p-3 text-xs text-slate-400">
            <b>Moderator Policy:</b> Only one authorized AI speaker may TTS at a time. Floor lock: {interviewState.floorLocked ? "LOCKED" : "OPEN"}.
          </div>
        </aside>

        <section className="glass relative order-1 flex min-h-[520px] flex-col overflow-hidden rounded-2xl xl:order-2">
          <div className="absolute inset-0 gridline opacity-50" />
          <div className="relative flex items-center justify-between border-b border-white/10 p-5">
            <div>
              <p className="text-xs tracking-widest text-slate-500">LIVE BOARDROOM</p>
              <h1 className="mt-1 text-lg font-semibold">{interviewState.targetRole} Assessment</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 text-xs text-mint">
                <Radio size={14} className={connectionState === "live" ? "pulse" : ""} />
                Voice: {connectionState}
              </span>
            </div>
          </div>

          <div className="relative flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div
              className={`grid h-36 w-36 place-items-center rounded-full border-2 border-mint/40 bg-mint/10 text-4xl font-semibold shadow-glow transition-all ${
                interviewState.activeSpeaker === "candidate" ? "pulse scale-105 border-mint" : ""
              }`}
            >
              {interviewState.candidateName.slice(0, 2).toUpperCase()}
            </div>
            <p className="mt-5 font-semibold text-lg">{interviewState.candidateName}</p>
            <p className="text-sm text-slate-400 mt-1">
              {interviewState.activeSpeaker === "candidate" ? (
                <span className="text-mint font-medium">Speaking now (Live Audio Track)</span>
              ) : (
                `Listening to ${labels[interviewState.activeSpeaker as AgentId] || "the panel"}`
              )}
            </p>

            <form onSubmit={handleManualCandidateSubmit} className="mt-6 flex w-full max-w-lg gap-2">
              <input
                type="text"
                placeholder='Type answer (e.g. "We used Redis and reduced latency by 40%")...'
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-mint"
              />
              <button
                type="submit"
                disabled={isAnalyzing}
                className="flex items-center gap-2 rounded-xl bg-mint px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
              >
                <Send size={15} /> Send
              </button>
            </form>
          </div>

          <div className="relative border-t border-white/10 p-5 bg-black/20">
            <p className="text-xs text-slate-500 uppercase tracking-wider">
              NOW ACTIVE: {labels[interviewState.activeSpeaker as AgentId] || interviewState.activeSpeaker}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              {interviewState.transcript.at(-1)?.text || "Panel standing by — start live voice to initialize the Moderator."}
            </p>
          </div>
          <div ref={audioRef} />
        </section>

        <aside className="glass order-3 rounded-2xl p-4 flex flex-col gap-4 min-h-[520px]">
          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={16} className="text-mint" />
              <p className="text-xs font-bold tracking-widest text-slate-300">LIVE CLAIMGRAPH</p>
              <span className="ml-auto text-[10px] text-slate-500">{claims.length} nodes</span>
            </div>

            {claims.length > 0 ? (
              <div className="space-y-3">
                {claims.map(claim => (
                  <div key={claim.id} className="rounded-xl border border-mint/30 bg-mint/5 p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400 uppercase tracking-wide">
                      <span className="font-semibold text-mint">CATEGORY · {claim.category}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          claim.status === "resolved" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        STATUS · {claim.status}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">CLAIM</span>
                      <p className="mt-0.5 text-sm font-medium leading-5 text-slate-100">{claim.claim}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                      <div
                        className={`rounded p-2 font-medium ${
                          claim.technicalStatus === "supported"
                            ? "bg-emerald-400/10 text-emerald-300"
                            : "bg-amber-400/10 text-amber-200"
                        }`}
                      >
                        <span className="block text-[10px] uppercase text-slate-400">Technical</span>
                        {claim.technicalStatus === "supported" ? "✓ Supported" : `⚠ ${claim.technicalStatus}`}
                      </div>
                      <div
                        className={`rounded p-2 font-medium ${
                          claim.productStatus === "supported"
                            ? "bg-emerald-400/10 text-emerald-300"
                            : "bg-amber-400/10 text-amber-200"
                        }`}
                      >
                        <span className="block text-[10px] uppercase text-slate-400">Product</span>
                        {claim.productStatus === "supported" ? "✓ Supported" : "⚠ Missing"}
                      </div>
                      {claim.behaviouralStatus && (
                        <div
                          className={`rounded p-2 font-medium ${
                            claim.behaviouralStatus === "supported"
                              ? "bg-emerald-400/10 text-emerald-300"
                              : "bg-white/5 text-slate-300"
                          }`}
                        >
                          <span className="block text-[10px] uppercase text-slate-400">Behavioural</span>
                          {claim.behaviouralStatus === "supported" ? "✓ Supported" : claim.behaviouralStatus}
                        </div>
                      )}
                      <div className="rounded bg-white/5 p-2 text-slate-300">
                        <span className="block text-[10px] uppercase text-slate-400">Confidence</span>
                        {(claim.confidence * 100).toFixed(0)}%
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 pt-1 flex justify-between items-center">
                      <span>SOURCE · turn {claim.sourceTurnId}</span>
                      {claim.evidence && (
                        <span className="truncate max-w-[180px] text-slate-500 italic">
                          &quot;{claim.evidence.slice(0, 40)}...&quot;
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-xs text-slate-500 text-center">
                ClaimGraph updates live from finalized candidate answers. Try: &quot;We used Redis caching and reduced API latency by 40%.&quot;
              </div>
            )}

            {interviewState.contradictions.length > 0 && (
              <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
                <b>Contradiction Status:</b>
                {interviewState.contradictions.map(c => (
                  <p key={c.id} className="mt-1">
                    {c.resolved ? "✓ Reconciled: " : "⚠ Unresolved: "} {c.description}
                  </p>
                ))}
              </div>
            )}

            {decision && (
              <div className="mt-4 rounded-xl border border-violet/30 bg-violet/10 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-violet">
                    MODERATOR → {labels[decision.nextSpeaker]?.toUpperCase() || decision.nextSpeaker.toUpperCase()}
                  </p>
                  <span className="text-xs text-slate-400">P{decision.priority}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-100">{decision.reason}</p>
                <p className="mt-2 text-xs text-slate-400">Objective: {decision.questionObjective}</p>
                <p className="mt-1 text-xs text-slate-500">Difficulty: {decision.difficulty}/5</p>
                {decision.suggestedQuestion && (
                  <p className="mt-3 rounded bg-black/20 p-2 text-xs leading-5 text-slate-300">
                    Q: {decision.suggestedQuestion}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-400 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Clock size={13} /> Connection</span>
              <b>{diagnostics.connectionMs ? `${diagnostics.connectionMs} ms` : "Standby"}</b>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Zap size={13} /> Analysis Latency</span>
              <b>{diagnostics.lastAnalysisMs ? `${diagnostics.lastAnalysisMs} ms` : "—"}</b>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Activity size={13} /> Processed Turns</span>
              <b>{diagnostics.turnsCount}</b>
            </div>
            {diagnostics.timeToFirstAudioMs > 0 && (
              <div className="flex items-center justify-between">
                <span>First audio</span>
                <b>{diagnostics.timeToFirstAudioMs} ms</b>
              </div>
            )}
            {interviewState.finalAssessment && (
              <Link
                href={`/passport/EP-${interviewState.interviewId.slice(0, 6).toUpperCase()}`}
                className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-mint p-2.5 font-semibold text-ink"
              >
                <Award size={15} /> View Verified Passport <ChevronRight size={14} />
              </Link>
            )}
          </div>
        </aside>
      </div>

      <section className="glass mx-auto mt-4 max-w-[1550px] rounded-2xl p-4">
        <p className="mb-3 text-xs font-bold tracking-widest text-slate-400">
          LIVE TRANSCRIPT · EVIDENCE LINKED
        </p>
        <div className="flex max-h-44 gap-3 overflow-x-auto pb-2">
          {interviewState.transcript.length === 0 ? (
            <p className="text-xs text-slate-500 p-2">Transcribed turns appear here as speech is finalized.</p>
          ) : (
            interviewState.transcript.map(turn => (
              <div key={turn.id} className="min-w-72 max-w-sm rounded-lg bg-white/5 p-3 text-xs flex flex-col justify-between">
                <div>
                  <b className={turn.speaker === "candidate" ? "text-mint" : "text-violet capitalize"}>
                    {turn.speaker === "candidate" ? "Candidate" : labels[turn.speaker as AgentId] || turn.speaker}
                  </b>
                  <p className="mt-1 leading-5 text-slate-300 line-clamp-4">{turn.text}</p>
                </div>
                <span className="text-[10px] text-slate-500 mt-2 block">
                  {new Date(turn.timestamp).toLocaleTimeString()} · {turn.id}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
