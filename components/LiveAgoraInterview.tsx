"use client";
import { useEffect, useRef, useState } from "react";
import { InterviewerRole, ModeratorDecision, SharedInterviewState, TranscriptTurn } from "@/lib/types";
import { LiveInterviewView } from "@/components/LiveInterviewView";
import { useIsDatabaseMode } from "@/components/AppModeProvider";
import {
  authorizeSpeaker,
  buildInterviewGreeting,
  createStateFromSetup,
  generateOpeningQuestion,
  initializeInterviewSession,
  releaseFloor
} from "@/lib/orchestrator";
import {
  createAgentTurnAuditor,
  createAnswerAccumulator,
  createAuthorizedSpeechLedger,
  createSerialTurnQueue,
  createSessionScope,
  finalTranscriptTurns,
  isLikelyEcho,
  isSubstantiveUtterance,
  MICROPHONE_TRACK_CONFIG,
  normalizeForMatch,
  persistedInterviewId,
  type AgentTurnAuditor,
  type AnswerAccumulator,
  type AuthorizedSpeechLedger,
  type SerialTurnQueue,
  type SessionScope,
  type SessionToken
} from "@/lib/live-helpers";

type Session = {
  appId: string;
  channel: string;
  uid: string;
  token: string;
  agentUid: string;
  agentId: string;
};

type CandidateTurnEvent = {
  text: string;
  turnId?: number;
  fallbackKey?: string;
};

const SETUP_KEY = "echopanel-interview-setup";

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
      accessMode?: "candidate";
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
  const isDatabaseMode = useIsDatabaseMode();
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
  const floorBusyRef = useRef(false);
  const turnQueueRef = useRef<SerialTurnQueue<CandidateTurnEvent> | null>(null);
  const answerAccumulatorRef = useRef<AnswerAccumulator | null>(null);
  const authorizedSpeechRef = useRef<AuthorizedSpeechLedger | null>(null);
  // What the agent was last asked to say; candidate turns that merely repeat it are speaker echo.
  const lastAiUtteranceRef = useRef("");
  const agentTurnAuditorRef = useRef<AgentTurnAuditor | null>(null);
  const interruptInFlightRef = useRef<number | null>(null);
  const interruptQueuedRef = useRef<number | null>(null);
  const floorTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const turnSequenceRef = useRef(0);
  const manualTurnCounterRef = useRef(0);
  const sessionScopeRef = useRef<SessionScope | null>(null);
  const activeSessionTokenRef = useRef<SessionToken | null>(null);
  const assessmentAbortRef = useRef<AbortController | null>(null);
  const processCandidateTurnRef = useRef<(turn: CandidateTurnEvent, token: SessionToken) => Promise<void>>(async () => {});
  const interviewStateRef = useRef(interviewState);
  interviewStateRef.current = interviewState;

  if (!sessionScopeRef.current) sessionScopeRef.current = createSessionScope();
  if (!authorizedSpeechRef.current) authorizedSpeechRef.current = createAuthorizedSpeechLedger();
  if (!agentTurnAuditorRef.current) {
    const ledger = authorizedSpeechRef.current;
    agentTurnAuditorRef.current = createAgentTurnAuditor(text => ledger.isAuthorized(text));
  }

  // Safe, timestamped lifecycle events for live debugging: no tokens, ids or transcript text.
  const diag = (event: string, fields: Record<string, string | number | boolean> = {}) => {
    const elapsed = startTimeRef.current ? Math.round(performance.now() - startTimeRef.current) : 0;
    console.info(`[EchoPanel Diag] +${elapsed}ms ${event}`, fields);
  };

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

  const broadcastAuthorizedSpeech = async (text: string, sessionToken: SessionToken) => {
    const scope = sessionScopeRef.current;
    if (!scope?.isCurrent(sessionToken)) return false;
    const session = sessionRef.current;
    if (!session?.agentId || !session?.channel || !session?.agentUid || !text.trim()) return false;
    if (floorBusyRef.current) return false;
    floorBusyRef.current = true;
    try {
      const response = await fetch("/api/interview/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: sessionToken.signal,
        body: JSON.stringify({
          agentId: session.agentId,
          channel: session.channel,
          agentUid: Number(session.agentUid),
          text,
          priority: "INTERRUPT",
          interruptable: true
        })
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Agora rejected the authorized speech");
      }
      if (!scope.isCurrent(sessionToken)) return false;
      console.info(`[EchoPanel Speech] question=${JSON.stringify(text)}`);
      diag("speak-accepted", { chars: text.length });
      authorizedSpeechRef.current?.authorize(text);
      lastAiUtteranceRef.current = text;
      return true;
    } catch (speakErr) {
      if (scope.isCurrent(sessionToken)) console.warn("Agora speak broadcast error:", speakErr);
      return false;
    } finally {
      setTimeout(() => {
        if (scope.isCurrent(sessionToken)) floorBusyRef.current = false;
      }, 1200);
    }
  };

  const interruptAutonomousAgent = async (sessionToken: SessionToken) => {
    const scope = sessionScopeRef.current;
    if (!scope?.isCurrent(sessionToken)) return;
    if (interruptInFlightRef.current === sessionToken.generation) {
      // Coalesce a legitimate request instead of dropping it while one is in flight.
      interruptQueuedRef.current = sessionToken.generation;
      return;
    }
    const session = sessionRef.current;
    if (!session?.agentId || !session?.channel || !session?.agentUid) return;
    interruptInFlightRef.current = sessionToken.generation;
    diag("interrupt-requested");
    try {
      const response = await fetch("/api/interview/interrupt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: sessionToken.signal,
        body: JSON.stringify({
          agentId: session.agentId,
          channel: session.channel,
          agentUid: Number(session.agentUid)
        })
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.warn("Agora autonomous-turn interrupt failed on server:", error.error || response.statusText);
      }
    } catch (error) {
      // The follow-up speak call also uses INTERRUPT. Do not block analysis on a
      // best-effort preemption failure.
      if (scope.isCurrent(sessionToken)) {
        console.warn("Agora autonomous-turn interrupt failed:", error);
      }
    } finally {
      if (interruptInFlightRef.current === sessionToken.generation) {
        interruptInFlightRef.current = null;
      }
      if (interruptQueuedRef.current === sessionToken.generation) {
        interruptQueuedRef.current = null;
        if (scope.isCurrent(sessionToken)) void interruptAutonomousAgent(sessionToken);
      }
    }
  };

  const processCandidateTurn = async (turn: CandidateTurnEvent, sessionToken: SessionToken) => {
    const scope = sessionScopeRef.current;
    if (!scope?.isCurrent(sessionToken)) return;
    const text = turn.text.trim();
    if (!text) return;

    if (floorTimerRef.current) {
      clearTimeout(floorTimerRef.current);
      floorTimerRef.current = null;
    }

    turnSequenceRef.current += 1;
    const localTurnId = `turn-${Date.now()}-${turnSequenceRef.current}`;
    const candidateTurn: TranscriptTurn = {
      id: localTurnId,
      speaker: "candidate",
      text,
      timestamp: Date.now(),
      isFinal: true,
      rawTurnId: turn.turnId
    };

    console.info(`[EchoPanel Transcript] speaker=candidate turnId=${localTurnId}`);

    // 1. Authoritative floor moves to candidate immediately
    const nextCandidateState: SharedInterviewState = {
      ...interviewStateRef.current,
      activeSpeaker: "candidate",
      floorLocked: false,
      agentStates: {
        ...interviewStateRef.current.agentStates,
        moderator: "thinking",
        technical: "listening",
        product: "listening",
        behavioural: "listening"
      },
      transcript: interviewStateRef.current.transcript.some(t => t.id === localTurnId)
        ? interviewStateRef.current.transcript
        : [...interviewStateRef.current.transcript, candidateTurn]
    };
    interviewStateRef.current = nextCandidateState;
    setInterviewState(nextCandidateState);

    const analysisStart = performance.now();

    try {
      const res = await fetch("/api/interview/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: sessionToken.signal,
        body: JSON.stringify({ turn: candidateTurn, state: nextCandidateState })
      });

      const data = await res.json();
      if (!scope.isCurrent(sessionToken)) return;
      const analysisDuration = Math.round(performance.now() - analysisStart);

      if (res.ok && data.updatedState) {
        const nextDecision: ModeratorDecision = data.decision;
        setDiagnostics(prev => scope.isCurrent(sessionToken) ? {
          ...prev,
          lastAnalysisMs: analysisDuration,
          turnsCount: prev.turnsCount + 1
        } : prev);

        if (nextDecision?.suggestedQuestion) {
          // First show the Moderator's request. Only mark a role speaking after
          // Agora accepts the exact TTS payload, so the UI cannot claim a voice
          // that never reached the real audio layer.
          setInterviewState(prev => {
            if (!scope.isCurrent(sessionToken)) return prev;
            const merged = {
              ...data.updatedState,
              transcript: prev.transcript.some(t => t.id === localTurnId)
                ? data.updatedState.transcript
                : [...data.updatedState.transcript, candidateTurn]
            };
            return merged;
          });

          if (!scope.isCurrent(sessionToken)) return;
          console.info(`[EchoPanel Analysis] claims=${data.analysis?.claims?.length ?? 0}`);
          console.info(`[EchoPanel ClaimGraph] nodes=${data.updatedState.claims?.length ?? 0}`);
          console.info(`[EchoPanel Moderator] nextSpeaker=${nextDecision.nextSpeaker} reason=${nextDecision.reason}`);
          const spoken = await broadcastAuthorizedSpeech(nextDecision.suggestedQuestion, sessionToken);
          if (!spoken || !scope.isCurrent(sessionToken)) return;
          setInterviewState(prev => {
            if (!scope.isCurrent(sessionToken)) return prev;
            return authorizeSpeaker(
              { ...data.updatedState, transcript: prev.transcript },
              nextDecision.nextSpeaker as InterviewerRole,
              nextDecision.suggestedQuestion
            );
          });
          if (nextDecision.closing) {
            diag("interview-closing");
            setStatusMessage("The interview is complete. Tap End interview to submit your answers.");
          }

          // Maintain floor while interviewer is speaking; yield floor when question ends
          if (floorTimerRef.current) clearTimeout(floorTimerRef.current);
          const speechDurationMs = Math.min(8000, Math.max(4500, nextDecision.suggestedQuestion.length * 70));
          floorTimerRef.current = setTimeout(() => {
            if (!scope.isCurrent(sessionToken)) return;
            floorTimerRef.current = null;
            setInterviewState(prev => scope.isCurrent(sessionToken) ? releaseFloor(prev) : prev);
          }, speechDurationMs);
        } else {
          setInterviewState(prev => scope.isCurrent(sessionToken) ? data.updatedState : prev);
        }
      }
    } catch (err) {
      if (scope.isCurrent(sessionToken)) console.error("Analysis pipeline error:", err);
    }
  };
  processCandidateTurnRef.current = processCandidateTurn;

  const createSessionTurnQueue = (sessionToken: SessionToken) => createSerialTurnQueue<CandidateTurnEvent>({
    process: turn => processCandidateTurnRef.current(turn, sessionToken),
    onAccepted: () => {
      // Pre-empt autonomous audio as soon as the turn is accepted, even while
      // an earlier turn's analysis is still pending.
      void interruptAutonomousAgent(sessionToken);
    },
    onError: (error, turn) => {
      if (sessionScopeRef.current?.isCurrent(sessionToken)) {
        console.error("Analysis pipeline error:", error, { text: turn.text });
      }
    },
    onBusyChange: busy => {
      if (sessionScopeRef.current?.isCurrent(sessionToken)) setIsAnalyzing(busy);
    }
  });

  const enqueueCandidateTurn = (turn: CandidateTurnEvent, sessionToken: SessionToken) => {
    if (!sessionScopeRef.current?.isCurrent(sessionToken)) return false;
    const text = turn.text.trim();
    if (!isSubstantiveUtterance(text)) return false;
    if (isLikelyEcho(text, lastAiUtteranceRef.current)) {
      console.info("[EchoPanel Speech] candidate turn ignored as probable speaker echo");
      diag("candidate-echo-ignored", { words: text.split(/\s+/).length });
      return false;
    }
    return turnQueueRef.current?.enqueue({ ...turn, text }) ?? false;
  };

  // Voice segments are merged into one answer until the candidate has been quiet
  // for ANSWER_GRACE_MS, so a pause mid-answer does not advance the interview.
  const createSessionAnswerAccumulator = (sessionToken: SessionToken) => createAnswerAccumulator({
    onAnswer: answer => {
      if (!sessionScopeRef.current?.isCurrent(sessionToken)) return;
      diag("answer-complete", { segments: answer.segments, words: answer.text.split(/\s+/).length });
      enqueueCandidateTurn({ text: answer.text, fallbackKey: answer.key }, sessionToken);
    }
  });

  const acceptVoiceSegment = (segment: { text: string; key: string }, sessionToken: SessionToken) => {
    if (!sessionScopeRef.current?.isCurrent(sessionToken)) return;
    const text = segment.text.trim();
    if (!isSubstantiveUtterance(text)) return;
    if (isLikelyEcho(text, lastAiUtteranceRef.current)) {
      console.info("[EchoPanel Speech] candidate turn ignored as probable speaker echo");
      diag("candidate-echo-ignored", { words: text.split(/\s+/).length });
      return;
    }
    if (answerAccumulatorRef.current?.addFinal({ text, key: segment.key })) {
      diag("answer-segment", { pending: answerAccumulatorRef.current.pending() });
      // Stop any autonomous agent reply to this pause right away.
      void interruptAutonomousAgent(sessionToken);
    }
  };

  const ensureActiveSessionToken = () => {
    const scope = sessionScopeRef.current;
    if (!scope) return null;
    const existing = activeSessionTokenRef.current;
    if (existing && scope.isCurrent(existing) && turnQueueRef.current) return existing;

    const sessionToken = scope.begin();
    activeSessionTokenRef.current = sessionToken;
    assessmentAbortRef.current?.abort();
    assessmentAbortRef.current = null;
    turnQueueRef.current?.reset();
    answerAccumulatorRef.current?.reset();
    turnQueueRef.current = createSessionTurnQueue(sessionToken);
    return sessionToken;
  };

  const cleanupConnections = async () => {
    const session = sessionRef.current;
    const voiceAi = voiceAiRef.current;
    const rtm = rtmRef.current;
    const rtc = rtcRef.current;
    const track = trackRef.current;

    sessionRef.current = null;
    rtcRef.current = null;
    trackRef.current = null;
    rtmRef.current = null;
    voiceAiRef.current = null;
    floorBusyRef.current = false;
    if (floorTimerRef.current) {
      clearTimeout(floorTimerRef.current);
      floorTimerRef.current = null;
    }

    try {
      if (session?.agentId) {
        await fetch("/api/agora/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: session.agentId })
        });
      }
    } catch {}

    try { voiceAi?.unsubscribe(); voiceAi?.destroy(); } catch {}
    try { await rtm?.logout(); } catch {}
    try { await rtc?.leave(); } catch {}
    try { track?.close(); } catch {}
  };

  const stop = async () => {
    const scope = sessionScopeRef.current;
    if (!scope) return;
    const stopGeneration = scope.invalidate();
    activeSessionTokenRef.current = null;
    turnQueueRef.current?.reset();
    answerAccumulatorRef.current?.reset();
    turnQueueRef.current = null;
    assessmentAbortRef.current?.abort();
    assessmentAbortRef.current = null;
    interruptInFlightRef.current = null;
    interruptQueuedRef.current = null;
    setIsAnalyzing(false);

    await cleanupConnections();
    if (!scope.isGenerationCurrent(stopGeneration)) return;
    setConnectionState("ready");
    setStatusMessage("Live interview ended.");

    const finalState = interviewStateRef.current;
    // In database mode the finalized transcript is stored against the persisted
    // interview; the server queues the recruiter assessment from it.
    const interviewId = persistedInterviewId(finalState.interviewId);
    const turns = finalTranscriptTurns(finalState.transcript);
    // An invited candidate finishes through their own session: the server takes
    // the interview from the session, completes it and queues the recruiter
    // assessment. Candidates are never shown AI scoring.
    if (isDatabaseMode && loadSetupFromStorage()?.accessMode === "candidate") {
      let message = "Thank you. Your interview has ended and has been sent to the hiring team.";
      try {
        const finished = await fetch("/api/candidate/interview/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turns })
        });
        if (!finished.ok) {
          const body = await finished.json().catch(() => ({}));
          message = `Your interview has ended, but it could not be submitted: ${body.error || `HTTP ${finished.status}`}. Please contact the hiring team.`;
        }
      } catch {
        message = "Your interview has ended, but it could not be submitted because the connection failed. Please contact the hiring team.";
      }
      if (scope.isGenerationCurrent(stopGeneration)) setStatusMessage(message);
      return;
    }
    if (isDatabaseMode && interviewId && turns.length > 0) {
      try {
        const saved = await fetch(`/api/hr/interviews/${encodeURIComponent(interviewId)}/transcript`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turns })
        });
        const savedBody = await saved.json().catch(() => ({}));
        if (scope.isGenerationCurrent(stopGeneration)) {
          setStatusMessage(saved.ok
            ? "Live interview ended. Transcript saved to the interview record."
            : `Live interview ended. The transcript was not saved: ${savedBody.error || `HTTP ${saved.status}`}`);
        }
      } catch {
        if (scope.isGenerationCurrent(stopGeneration)) {
          setStatusMessage("Live interview ended. The transcript could not be saved because the request failed.");
        }
      }
    }

    if (finalState.transcript.length > 0) {
      const assessmentController = new AbortController();
      assessmentAbortRef.current = assessmentController;
      try {
        const assessRes = await fetch("/api/interview/assess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: assessmentController.signal,
          body: JSON.stringify(finalState)
        });
        const assessData = await assessRes.json();
        if (assessData.assessment && scope.isGenerationCurrent(stopGeneration)) {
          setInterviewState(prev => {
            if (!scope.isGenerationCurrent(stopGeneration)) return prev;
            return { ...prev, finalAssessment: assessData.assessment };
          });
        }
      } catch (err) {
        if (scope.isGenerationCurrent(stopGeneration) && !assessmentController.signal.aborted) {
          console.warn("Could not generate assessment:", err);
        }
      } finally {
        if (assessmentAbortRef.current === assessmentController) {
          assessmentAbortRef.current = null;
        }
      }
    }
  };

  const start = async () => {
    const scope = sessionScopeRef.current;
    if (!scope) return;
    const sessionToken = scope.begin();
    activeSessionTokenRef.current = sessionToken;
    assessmentAbortRef.current?.abort();
    assessmentAbortRef.current = null;
    turnQueueRef.current?.reset();
    answerAccumulatorRef.current?.reset();
    turnQueueRef.current = createSessionTurnQueue(sessionToken);
    answerAccumulatorRef.current = createSessionAnswerAccumulator(sessionToken);
    if (floorTimerRef.current) {
      clearTimeout(floorTimerRef.current);
      floorTimerRef.current = null;
    }
    floorBusyRef.current = false;
    setIsAnalyzing(false);
    setConnectionState("connecting");
    setStatusMessage("Requesting secure Agora RTC + RTM session…");
    startTimeRef.current = performance.now();
    authorizedSpeechRef.current?.clear();
    agentTurnAuditorRef.current?.reset();
    interruptInFlightRef.current = null;
    interruptQueuedRef.current = null;
    turnSequenceRef.current = 0;
    manualTurnCounterRef.current = 0;

    await cleanupConnections();
    if (!scope.isCurrent(sessionToken)) return;

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
        signal: sessionToken.signal,
        body: JSON.stringify({ interviewId: baseState.interviewId })
      });
      const token = await tokenRes.json();
      if (!scope.isCurrent(sessionToken)) return;
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
      authorizedSpeechRef.current?.authorize(greeting, openingQuestion, `${greeting} ${openingQuestion}`);
      lastAiUtteranceRef.current = `${greeting} ${openingQuestion}`;

      const agentRes = await fetch("/api/agora/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: sessionToken.signal,
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
      if (!scope.isCurrent(sessionToken)) {
        if (agentRes.ok && agent.agentId) {
          void fetch("/api/agora/stop", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId: agent.agentId })
          }).catch(() => {});
        }
        return;
      }
      if (!agentRes.ok) throw new Error(agent.error || "Failed to start Agora Conversational AI Agent");

      sessionRef.current = { ...token, agentId: agent.agentId };

      const [{ default: AgoraRTC }, rtmModule, toolkit] = await Promise.all([
        import("agora-rtc-sdk-ng"),
        import("agora-rtm"),
        import("agora-agent-client-toolkit")
      ]);
      if (!scope.isCurrent(sessionToken)) return;

      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      rtcRef.current = client;
      // Mobile browsers can block playback that was not started by a tap.
      AgoraRTC.onAutoplayFailed = () => {
        if (!scope.isCurrent(sessionToken)) return;
        diag("autoplay-blocked");
        setStatusMessage("Your browser blocked the interviewer's audio. Tap anywhere on the page to enable it.");
      };

      client.on("user-published", async (user: any, mediaType: "audio" | "video") => {
        if (mediaType !== "audio" || !scope.isCurrent(sessionToken)) return;
        diag("remote-audio-published", { isAgent: String(user.uid) === String(token.agentUid || agent.agentUid) });
        await client.subscribe(user, mediaType);
        if (!scope.isCurrent(sessionToken)) return;
        user.audioTrack?.play(audioRef.current);
        diag("remote-audio-play-called", { hasTrack: Boolean(user.audioTrack), playing: Boolean(user.audioTrack?.isPlaying) });
        setDiagnostics(prev => scope.isCurrent(sessionToken) ? {
          ...prev,
          timeToFirstAudioMs: Math.round(performance.now() - startTimeRef.current)
        } : prev);
      });

      client.on("connection-state-change", (next: string) => {
        if (!scope.isCurrent(sessionToken)) return;
        setStatusMessage(next === "CONNECTED" ? "Connected to Agora. Moderator initializing interview…" : `Agora connection: ${next}`);
      });

      client.on("user-unpublished", (user: any, mediaType: "audio" | "video") => {
        if (mediaType === "audio" && scope.isCurrent(sessionToken)) diag("remote-audio-unpublished");
      });

      await client.join(token.appId, token.channel, token.token, Number(token.uid));
      if (!scope.isCurrent(sessionToken)) return;
      diag("rtc-joined");
      const mic = await AgoraRTC.createMicrophoneAudioTrack({ ...MICROPHONE_TRACK_CONFIG });
      if (!scope.isCurrent(sessionToken)) {
        try { mic.close(); } catch {}
        return;
      }
      trackRef.current = mic;
      await client.publish([mic]);
      if (!scope.isCurrent(sessionToken)) return;
      diag("mic-published", { enabled: Boolean(mic.enabled) });

      const AgoraRTM = (rtmModule as any).default || rtmModule;
      const rtm = new AgoraRTM.RTM(token.appId, token.uid);
      rtmRef.current = rtm;
      await rtm.login({ token: token.token });
      if (!scope.isCurrent(sessionToken)) return;
      await rtm.subscribe(token.channel);
      if (!scope.isCurrent(sessionToken)) return;

      const ai = await (toolkit as any).AgoraVoiceAI.init({
        rtcEngine: client,
        rtmConfig: { rtmEngine: rtm },
        renderMode: (toolkit as any).TranscriptHelperMode.TEXT,
        enableLog: false
      });
      if (!scope.isCurrent(sessionToken)) {
        try { ai.unsubscribe(); ai.destroy(); } catch {}
        return;
      }
      voiceAiRef.current = ai;

      const candidateUid = String(token.uid);
      const agentUid = String(token.agentUid || agent.agentUid);

      ai.on((toolkit as any).AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (items: unknown[]) => {
        if (!scope.isCurrent(sessionToken) || !Array.isArray(items) || items.length === 0) return;
        // The toolkit sends complete history on every revision. Scan all entries;
        // finalized user.transcription segments feed the answer accumulator.
        let latestCandidateEntry: AgoraTranscriptItem | null = null;
        for (const entry of items as AgoraTranscriptItem[]) {
          const text = extractTranscriptText(entry);
          const kind = transcriptKind(entry);
          const turnId = typeof entry.turn_id === "number" ? entry.turn_id : undefined;
          const uid = String(entry.uid ?? "");
          const isCandidate = kind === "candidate" || (kind === "unknown" && uid === candidateUid);
          const isAgent = kind === "agent" || (kind === "unknown" && uid === agentUid);
          if (isCandidate) latestCandidateEntry = entry;

          if (isCandidate && entry.metadata?.final === true && text) {
            acceptVoiceSegment({
              text,
              key: turnId != null ? `turn:${turnId}` : `rtm:${uid}:${normalizeForMatch(text)}`
            }, sessionToken);
          } else if (isAgent && entry.status === (toolkit as any).TurnStatus?.END && text) {
            // EchoPanel records interviewer text when it authorizes it. Do not
            // append the SDK's full-history echo or autonomous output as a role.
            // The turn has already finished playing, so it is reported once and
            // never interrupted: that would cut off the next authorized question.
            // Autonomous replies are pre-empted when the candidate turn is accepted.
            const key = turnId != null ? `agent-turn:${turnId}` : `agent-text:${normalizeForMatch(text)}`;
            if (agentTurnAuditorRef.current?.review(key, text)) {
              console.warn("[EchoPanel Speech] unauthorized Agora agent turn completed (not interrupted)");
              diag("agent-unauthorized-turn-completed", { words: text.split(/\s+/).length });
            }
          }
        }
        // The candidate is still talking (newest segment not final yet): keep waiting.
        if (latestCandidateEntry && latestCandidateEntry.metadata?.final !== true && extractTranscriptText(latestCandidateEntry)) {
          answerAccumulatorRef.current?.noteSpeech();
        }
      });

      ai.on((toolkit as any).AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_: unknown, event: any) => {
        if (!scope.isCurrent(sessionToken)) return;
        diag("agent-state", { state: String(event?.state || "unknown") });
        setStatusMessage(`Agora voice layer: ${event?.state || "active"} · Moderator authoritative`);
      });

      ai.on((toolkit as any).AgoraVoiceAIEvents.AGENT_INTERRUPTED, () => {
        if (!scope.isCurrent(sessionToken)) return;
        diag("agent-interrupted");
        setStatusMessage("Candidate speaking (barge-in). Agent yields floor.");
        if (floorTimerRef.current) {
          clearTimeout(floorTimerRef.current);
          floorTimerRef.current = null;
        }
        setInterviewState(prev => scope.isCurrent(sessionToken) ? releaseFloor(prev) : prev);
      });

      ai.subscribeMessage(token.channel);
      if (!scope.isCurrent(sessionToken)) return;

      // EchoPanel takes ownership: initialize interview + authorize first speaker
      const init = initializeInterviewSession(baseState);
      if (!scope.isCurrent(sessionToken)) return;
      setInterviewState(init.updatedState);

      const connDuration = Math.round(performance.now() - startTimeRef.current);
      setConnectionState("live");
      setStatusMessage("Interview initialized. Moderator coordinating Technical / Product / Behavioural.");
      setDiagnostics(prev => scope.isCurrent(sessionToken) ? { ...prev, connectionMs: connDuration } : prev);

      // A pipeline-based start does not carry EchoPanel's greeting (the agent
      // greets with the Console pipeline's own message), so the opening is
      // spoken through the authorized speak path, pre-empting that greeting.
      const openingSpoken = await broadcastAuthorizedSpeech(`${greeting} ${openingQuestion}`, sessionToken);
      if (!scope.isCurrent(sessionToken)) return;
      diag("opening-spoken", { accepted: openingSpoken });

      setTimeout(() => {
        if (!scope.isCurrent(sessionToken)) return;
        setInterviewState(prev => scope.isCurrent(sessionToken) ? releaseFloor(prev) : prev);
      }, 5000);
    } catch (err) {
      if (!scope.isCurrent(sessionToken)) return;
      const failureGeneration = scope.invalidate();
      activeSessionTokenRef.current = null;
      turnQueueRef.current?.reset();
      answerAccumulatorRef.current?.reset();
      turnQueueRef.current = null;
      setIsAnalyzing(false);
      interruptInFlightRef.current = null;
      interruptQueuedRef.current = null;
      await cleanupConnections();
      if (!scope.isGenerationCurrent(failureGeneration)) return;
      setConnectionState("error");
      setStatusMessage(err instanceof Error ? err.message : "Live setup encountered an issue.");
    }
  };

  useEffect(() => () => {
    sessionScopeRef.current?.invalidate();
    activeSessionTokenRef.current = null;
    assessmentAbortRef.current?.abort();
    turnQueueRef.current?.reset();
    answerAccumulatorRef.current?.reset();
    turnQueueRef.current = null;
    void cleanupConnections();
  }, []);

  const toggleMute = async () => {
    if (!trackRef.current) return;
    await trackRef.current.setEnabled(muted);
    setMuted(!muted);
  };

  const handleManualCandidateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    const sessionToken = ensureActiveSessionToken();
    if (!sessionToken) return;
    manualTurnCounterRef.current += 1;
    enqueueCandidateTurn(
      { text: textInput, fallbackKey: `manual:${manualTurnCounterRef.current}` },
      sessionToken
    );
    setTextInput("");
  };

  return (
    <>
      <LiveInterviewView
        connectionState={connectionState}
        statusMessage={statusMessage}
        muted={muted}
        isAnalyzing={isAnalyzing}
        textInput={textInput}
        interviewState={interviewState}
        diagnostics={diagnostics}
        onStart={start}
        onStop={stop}
        onToggleMute={toggleMute}
        onTextInputChange={setTextInput}
        onManualSubmit={handleManualCandidateSubmit}
      />
      <div ref={audioRef} />
    </>
  );
}
