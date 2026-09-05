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
  ShieldAlert,
  Sparkles,
  Zap
} from "lucide-react";
import {
  AgentId,
  AgentStatus,
  ModeratorDecision,
  SharedInterviewState,
  TranscriptTurn
} from "@/lib/types";
import { createInitialState } from "@/lib/orchestrator";

type Session = {
  appId: string;
  channel: string;
  uid: string;
  token: string;
  agentUid: string;
  agentId: string;
};

const labels: Record<AgentId, string> = {
  technical: "Technical",
  product: "Product",
  behavioural: "Behavioural",
  moderator: "Moderator",
  customer: "Customer"
};

const avatars: Record<AgentId, string> = {
  technical: "M",
  product: "P",
  behavioural: "N",
  moderator: "O",
  customer: "C"
};

function extractTranscriptText(item: unknown): string {
  if (!item || typeof item !== "object") return "";
  const value = item as Record<string, unknown>;
  return [value.text, value.content, value.message].find((x): x is string => typeof x === "string") || "";
}

export function LiveAgoraInterview() {
  const [connectionState, setConnectionState] = useState<"ready" | "connecting" | "live" | "error">("ready");
  const [statusMessage, setStatusMessage] = useState("Microphone will connect upon starting the live panel.");
  const [muted, setMuted] = useState(false);
  const [interviewState, setInterviewState] = useState<SharedInterviewState>(() => createInitialState());
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
  const startTimeRef = useRef<number>(0);
  const interviewStateRef = useRef(interviewState);
  interviewStateRef.current = interviewState;

  // Process a finalized candidate turn through the live analysis and orchestrator pipeline
  const processFinalizedCandidateTurn = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || text === lastProcessedTextRef.current || isAnalyzing) return;
    lastProcessedTextRef.current = text;

    const turnId = `turn-${Date.now()}`;
    const candidateTurn: TranscriptTurn = {
      id: turnId,
      speaker: "candidate",
      text,
      timestamp: Date.now(),
      isFinal: true
    };

    setIsAnalyzing(true);
    const analysisStart = performance.now();

    try {
      // Send to Answer Analysis API
      const res = await fetch("/api/interview/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turn: candidateTurn, state: interviewStateRef.current })
      });

      const data = await res.json();
      const analysisDuration = Math.round(performance.now() - analysisStart);

      if (res.ok && data.updatedState) {
        const nextDecision: ModeratorDecision = data.decision;
        setInterviewState(data.updatedState);
        setDiagnostics(prev => ({
          ...prev,
          lastAnalysisMs: analysisDuration,
          turnsCount: prev.turnsCount + 1
        }));

        // Execute live Agora voice broadcast if session is active
        const session = sessionRef.current;
        if (session?.agentId && nextDecision?.suggestedQuestion) {
          try {
            await fetch("/api/interview/speak", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agentId: session.agentId,
                text: nextDecision.suggestedQuestion,
                priority: "INTERRUPT",
                interruptable: true
              })
            });
          } catch (speakErr) {
            console.warn("Agora speak broadcast error:", speakErr);
          }
        }

        // Handoff to speaking after a brief transition
        setTimeout(() => {
          setInterviewState(prev => {
            const updated = { ...prev };
            (Object.keys(updated.agentStates) as AgentId[]).forEach(id => {
              if (id === nextDecision.nextSpeaker) {
                updated.agentStates[id] = "speaking";
              } else {
                updated.agentStates[id] = "idle";
              }
            });
            updated.activeSpeaker = nextDecision.nextSpeaker;

            // Add the agent's turn to the transcript
            if (nextDecision.suggestedQuestion) {
              const agentTurn: TranscriptTurn = {
                id: `turn-agent-${Date.now()}`,
                speaker: nextDecision.nextSpeaker,
                text: nextDecision.suggestedQuestion,
                timestamp: Date.now(),
                isFinal: true
              };
              updated.transcript = [...updated.transcript, agentTurn];
            }
            return updated;
          });
        }, 1200);
      }
    } catch (err) {
      console.error("Analysis pipeline error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const stop = async () => {
    const session = sessionRef.current;
    try {
      if (session?.agentId) {
        await fetch("/api/agora/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: session.agentId })
        });
      }
    } catch {
      /* continue cleanup */
    }

    try { voiceAiRef.current?.unsubscribe(); voiceAiRef.current?.destroy(); } catch {}
    try { await rtmRef.current?.logout(); } catch {}
    try { await rtcRef.current?.leave(); } catch {}
    try { trackRef.current?.close(); } catch {}

    sessionRef.current = null;
    rtcRef.current = null;
    trackRef.current = null;
    rtmRef.current = null;
    voiceAiRef.current = null;

    setConnectionState("ready");
    setStatusMessage("Live interview ended.");

    // Finalize assessment
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
  };

  const start = async () => {
    setConnectionState("connecting");
    setStatusMessage("Requesting secure Agora RTC + RTM session…");
    startTimeRef.current = performance.now();

    try {
      const tokenRes = await fetch("/api/agora/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId: "live-interview" })
      });
      const token = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(token.error || "Failed to issue Agora token");

      const agentRes = await fetch("/api/agora/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: token.channel,
          requesterId: token.uid,
          targetRole: "Software Engineer"
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
        setStatusMessage(next === "CONNECTED" ? "Connected to Agora. Panel is listening." : `Agora connection: ${next}`);
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

      // Handle RTM real-time finalized transcripts
      ai.on((toolkit as any).AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (items: unknown[]) => {
        const latest = items.at(-1);
        const text = extractTranscriptText(latest);
        const isCandidate = (latest as any)?.uid === "0";

        if (text && isCandidate) {
          // Normalize and process finalized turn
          void processFinalizedCandidateTurn(text);
        } else if (text && !isCandidate) {
          setInterviewState(prev => {
            const agentTurn: TranscriptTurn = {
              id: `turn-agora-${Date.now()}`,
              speaker: prev.activeSpeaker || "technical",
              text,
              timestamp: Date.now(),
              isFinal: true
            };
            if (prev.transcript.some(t => t.text === text)) return prev;
            return { ...prev, transcript: [...prev.transcript, agentTurn] };
          });
        }
      });

      ai.on((toolkit as any).AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_: unknown, event: any) => {
        setStatusMessage(`Agora Panel: ${event?.state || "active"}`);
      });

      ai.on((toolkit as any).AgoraVoiceAIEvents.AGENT_INTERRUPTED, () => {
        setStatusMessage("Candidate speaking (Barge-in active). Agent yields floor.");
      });

      ai.subscribeMessage(token.channel);

      const connDuration = Math.round(performance.now() - startTimeRef.current);
      setConnectionState("live");
      setStatusMessage("Agora voice session active. Speak freely; VAD supports interruption.");
      setDiagnostics(prev => ({ ...prev, connectionMs: connDuration }));
    } catch (err) {
      await stop();
      setConnectionState("error");
      setStatusMessage(err instanceof Error ? err.message : "Live setup encountered an issue.");
    }
  };

  useEffect(() => () => { void stop(); }, []);

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

  const panelAgents: AgentId[] = ["technical", "product", "behavioural"];
  const decision = interviewState.lastDecision;
  const currentClaim = interviewState.claims[interviewState.claims.length - 1];

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
          <Link href="/demo" className="text-slate-400 hover:text-white transition-colors">
            Deterministic Demo →
          </Link>
        </div>
      </header>

      {/* Control bar */}
      <div className="mx-auto mb-4 flex max-w-[1550px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${connectionState === "live" ? "bg-mint pulse" : connectionState === "connecting" ? "bg-amber-400" : "bg-slate-500"}`} />
          <p className="text-sm font-medium text-slate-200">{statusMessage}</p>
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

      <div className="mx-auto grid max-w-[1550px] gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        {/* PANEL INTERVIEWERS COLUMN */}
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

              return (
                <div
                  key={id}
                  className={`mb-3 rounded-xl border p-4 transition-all ${
                    isSpeaking
                      ? "border-mint/60 bg-mint/10 shadow-glow"
                      : isRequesting
                      ? "border-amber-400/50 bg-amber-400/10"
                      : isHandoff
                      ? "border-violet/50 bg-violet/10"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <b className={`grid h-10 w-10 place-items-center rounded-full text-sm font-bold ${isSpeaking ? "bg-mint text-ink" : "bg-slate-700 text-white"}`}>
                      {avatars[id]}
                    </b>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{labels[id]} interviewer</p>
                      <p
                        className={`mt-1 text-xs capitalize ${
                          isSpeaking
                            ? "text-mint font-semibold"
                            : isRequesting
                            ? "text-amber-300 font-medium"
                            : isHandoff
                            ? "text-violet font-medium"
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

            {/* Live Competency State Radar */}
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
            <b>Moderator Policy:</b> Only authorized speaker occupies microphone floor. Concurrency is deterministically locked.
          </div>
        </aside>

        {/* CENTER LIVE BOARDROOM */}
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

          {/* Candidate avatar & audio center */}
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

            {/* Manual test fallback input (for quick testing without voice) */}
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

          {/* Bottom active turn text */}
          <div className="relative border-t border-white/10 p-5 bg-black/20">
            <p className="text-xs text-slate-500 uppercase tracking-wider">
              NOW ACTIVE: {labels[interviewState.activeSpeaker as AgentId] || interviewState.activeSpeaker}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              {interviewState.transcript.at(-1)?.text || "Panel is standing by for initial candidate introduction."}
            </p>
          </div>
          <div ref={audioRef} />
        </section>

        {/* RIGHT COLUMN: CLAIMGRAPH & DECISION ENGINE */}
        <aside className="glass order-3 rounded-2xl p-4 flex flex-col gap-4">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={16} className="text-mint" />
              <p className="text-xs font-bold tracking-widest text-slate-300">LIVE CLAIMGRAPH</p>
            </div>

            {currentClaim ? (
              <div className="rounded-xl border border-mint/30 bg-mint/5 p-4">
                <p className="text-xs text-slate-400">CLAIM NODE · LIVE</p>
                <p className="mt-2 text-sm font-medium leading-5 text-slate-200">{currentClaim.claim}</p>
                <div className="mt-4 space-y-2 text-xs">
                  <p className={`rounded p-2 font-medium ${currentClaim.technicalStatus === "supported" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-200"}`}>
                    Technical · {currentClaim.technicalStatus === "supported" ? "✓ Supported" : "⚠ Unverified"}
                  </p>
                  <p className={`rounded p-2 font-medium ${currentClaim.productStatus === "supported" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-200"}`}>
                    Product · {currentClaim.productStatus === "supported" ? "✓ Customer impact supported" : "⚠ Business impact missing"}
                  </p>
                  <p className="rounded bg-white/5 p-2 text-slate-400">
                    Evidence · {currentClaim.evidence}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-xs text-slate-500 text-center">
                ClaimGraph generates real nodes when candidate states measurable technical or business claims.
              </div>
            )}

            {/* Contradiction card if detected */}
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

            {/* Next Speaker & Reason Card */}
            {decision && (
              <div className="mt-4 rounded-xl border border-violet/30 bg-violet/10 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-violet">NEXT SPEAKER · {labels[decision.nextSpeaker].toUpperCase()}</p>
                  <span className="text-xs text-slate-400">Priority {decision.priority}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-100">{decision.reason}</p>
                <p className="mt-2 text-xs text-slate-400">Objective: {decision.questionObjective}</p>
              </div>
            )}
          </div>

          {/* Performance Diagnostics */}
          <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-400 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Clock size={13} /> Connection</span>
              <b>{diagnostics.connectionMs ? `${diagnostics.connectionMs} ms` : "Standby"}</b>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Zap size={13} /> Analysis Latency</span>
              <b>{diagnostics.lastAnalysisMs ? `${diagnostics.lastAnalysisMs} ms` : "< 15 ms"}</b>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Activity size={13} /> Processed Turns</span>
              <b>{diagnostics.turnsCount}</b>
            </div>
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

      {/* HORIZONTAL LIVE TRANSCRIPT CAROUSEL */}
      <section className="glass mx-auto mt-4 max-w-[1550px] rounded-2xl p-4">
        <p className="mb-3 text-xs font-bold tracking-widest text-slate-400">
          LIVE TRANSCRIPT · CLICKABLE EVIDENCE LINKED
        </p>
        <div className="flex max-h-40 gap-3 overflow-x-auto pb-2">
          {interviewState.transcript.length === 0 ? (
            <p className="text-xs text-slate-500 p-2">Transcribed turns will appear here as speech is recognized.</p>
          ) : (
            interviewState.transcript.map(turn => (
              <div key={turn.id} className="min-w-72 max-w-sm rounded-lg bg-white/5 p-3 text-xs flex flex-col justify-between">
                <div>
                  <b className={turn.speaker === "candidate" ? "text-mint" : "text-violet capitalize"}>
                    {turn.speaker === "candidate" ? "Candidate" : labels[turn.speaker as AgentId] || turn.speaker}
                  </b>
                  <p className="mt-1 leading-5 text-slate-300 line-clamp-3">{turn.text}</p>
                </div>
                <span className="text-[10px] text-slate-500 mt-2 block">
                  {new Date(turn.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
