"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Radio, ShieldAlert } from "lucide-react";

type Session = { appId: string; channel: string; uid: string; token: string; agentUid: string; agentId: string };
type Transcript = { speaker: "Candidate" | "AI interviewer"; text: string; final: boolean };

function transcriptText(item: unknown): string {
  if (!item || typeof item !== "object") return "";
  const value = item as Record<string, unknown>;
  return [value.text, value.content, value.message].find((x): x is string => typeof x === "string") || "";
}

/** Real browser RTC + RTM client. It is intentionally separate from /demo. */
export function LiveAgoraInterview() {
  const [state, setState] = useState<"ready" | "connecting" | "live" | "error">("ready");
  const [message, setMessage] = useState("Microphone will only connect after Agora is configured.");
  const [muted, setMuted] = useState(false); const [transcript, setTranscript] = useState<Transcript[]>([]);
  const sessionRef = useRef<Session | null>(null); const rtcRef = useRef<any>(null); const trackRef = useRef<any>(null); const rtmRef = useRef<any>(null); const voiceAiRef = useRef<any>(null); const audioRef = useRef<HTMLDivElement>(null);
  const appendTranscript = (speaker: Transcript["speaker"], text: string, final = true) => { if (text) setTranscript((current) => [...current.slice(-24), { speaker, text, final }]); };
  const stop = async () => {
    const session = sessionRef.current;
    try { if (session?.agentId) await fetch("/api/agora/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: session.agentId }) }); } catch { /* cleanup continues */ }
    try { voiceAiRef.current?.unsubscribe(); voiceAiRef.current?.destroy(); } catch { /* toolkit can already be disposed */ }
    try { await rtmRef.current?.logout(); } catch { /* RTM can already be logged out */ }
    try { await rtcRef.current?.leave(); } catch { /* RTC can already be left */ }
    try { trackRef.current?.close(); } catch { /* media track can already be closed */ }
    sessionRef.current = null; rtcRef.current = null; trackRef.current = null; rtmRef.current = null; voiceAiRef.current = null;
    setState("ready"); setMessage("Voice session ended.");
  };
  const start = async () => {
    setState("connecting"); setMessage("Requesting a secure Agora session…"); setTranscript([]);
    try {
      const tokenResponse = await fetch("/api/agora/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interviewId: "live-interview" }) });
      const token = await tokenResponse.json(); if (!tokenResponse.ok) throw new Error(token.error || "Unable to issue an Agora token.");
      const agentResponse = await fetch("/api/agora/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: token.channel, requesterId: token.uid, targetRole: "Software Engineer" }) });
      const agent = await agentResponse.json(); if (!agentResponse.ok) throw new Error(agent.error || "Unable to start the Agora agent.");
      sessionRef.current = { ...token, agentId: agent.agentId };
      const [{ default: AgoraRTC }, rtmModule, toolkit] = await Promise.all([import("agora-rtc-sdk-ng"), import("agora-rtm"), import("agora-agent-client-toolkit")]);
      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" }); rtcRef.current = client;
      client.on("user-published", async (user: any, mediaType: "audio" | "video") => { if (mediaType !== "audio") return; await client.subscribe(user, mediaType); user.audioTrack?.play(audioRef.current); });
      client.on("connection-state-change", (next: string) => setMessage(next === "CONNECTED" ? "Connected to Agora. Listening for the interviewer…" : `Agora connection: ${next}`));
      await client.join(token.appId, token.channel, token.token, Number(token.uid));
      const mic = await AgoraRTC.createMicrophoneAudioTrack(); trackRef.current = mic; await client.publish([mic]);
      const AgoraRTM = (rtmModule as any).default || rtmModule; const rtm = new AgoraRTM.RTM(token.appId, token.uid); rtmRef.current = rtm;
      await rtm.login({ token: token.token }); await rtm.subscribe(token.channel);
      const ai = await (toolkit as any).AgoraVoiceAI.init({ rtcEngine: client, rtmConfig: { rtmEngine: rtm }, renderMode: (toolkit as any).TranscriptHelperMode.TEXT, enableLog: false });
      voiceAiRef.current = ai;
      ai.on((toolkit as any).AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (items: unknown[]) => { const latest = items.at(-1); const text = transcriptText(latest); if (text) appendTranscript((latest as any)?.uid === "0" ? "Candidate" : "AI interviewer", text, true); });
      ai.on((toolkit as any).AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_: unknown, event: any) => setMessage(`AI interviewer: ${event?.state || "active"}`));
      ai.on((toolkit as any).AgoraVoiceAIEvents.AGENT_ERROR, (_: unknown, event: any) => setMessage(`Agent error: ${event?.message || "unknown"}`));
      ai.subscribeMessage(token.channel); setState("live"); setMessage("Live Agora voice interview active. You can interrupt the interviewer by speaking.");
    } catch (error) { await stop(); setState("error"); setMessage(error instanceof Error ? error.message : "Voice setup failed."); }
  };
  useEffect(() => () => { void stop(); }, []);
  const toggleMute = async () => { if (!trackRef.current) return; await trackRef.current.setEnabled(muted); setMuted(!muted); };
  return <main className="min-h-screen bg-ink p-4 md:p-7"><header className="mx-auto flex max-w-6xl items-center justify-between"><Link href="/" className="font-bold">echo<span className="text-mint">panel</span></Link><Link href="/demo" className="text-sm text-slate-400">Open deterministic demo</Link></header><div className="mx-auto mt-10 grid max-w-6xl gap-4 lg:grid-cols-[1fr_360px]"><section className="glass rounded-3xl p-6 md:p-9"><p className="text-xs font-bold tracking-[.2em] text-mint">LIVE AGORA INTERVIEW</p><h1 className="mt-3 text-3xl font-semibold">Software Engineer panel</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">This page uses a real Agora RTC microphone track, a server-issued RTC+RTM token, a server-started Conversational AI session, and Agora RTM transcript/state events. It is not a simulated fallback.</p><div className="mt-10 grid place-items-center rounded-3xl border border-mint/20 bg-mint/5 px-5 py-12 text-center"><div className={state === "live" ? "pulse grid h-28 w-28 place-items-center rounded-full border-2 border-mint bg-mint/15" : "grid h-28 w-28 place-items-center rounded-full border border-white/20 bg-white/5"}><Radio className={state === "live" ? "text-mint" : "text-slate-400"} size={34}/></div><p className="mt-5 font-medium">{state === "live" ? "Voice connection active" : state === "connecting" ? "Connecting" : "Ready to connect"}</p><p className="mt-2 max-w-md text-sm text-slate-400">{message}</p><div className="mt-7 flex gap-3">{state !== "live" ? <button onClick={start} disabled={state === "connecting"} className="flex items-center gap-2 rounded-full bg-mint px-5 py-3 text-sm font-semibold text-ink disabled:opacity-50"><Mic size={16}/> Start live voice</button> : <><button onClick={toggleMute} className="flex items-center gap-2 rounded-full border border-white/20 px-5 py-3 text-sm">{muted ? <Mic size={16}/> : <MicOff size={16}/>} {muted ? "Unmute" : "Mute"}</button><button onClick={stop} className="flex items-center gap-2 rounded-full border border-red-400/40 px-5 py-3 text-sm text-red-200"><PhoneOff size={16}/> End interview</button></>}</div></div><div ref={audioRef}/></section><aside className="glass rounded-3xl p-5"><p className="text-xs font-bold tracking-widest text-slate-400">REAL-TIME TRANSCRIPT</p><div className="mt-4 space-y-3">{transcript.length === 0 ? <p className="rounded-xl bg-white/5 p-4 text-sm leading-6 text-slate-500">Transcript events appear here only after Agora emits them over RTM.</p> : transcript.map((turn, index) => <div key={`${turn.text}-${index}`} className="rounded-xl bg-white/5 p-3 text-sm"><b className={turn.speaker === "Candidate" ? "text-mint" : "text-violet"}>{turn.speaker}</b><p className="mt-1 leading-5 text-slate-300">{turn.text}</p></div>)}</div><div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-5 text-amber-100"><ShieldAlert className="mb-2" size={15}/>AI-assisted interview only. Human review remains required; this page does not make a hiring decision.</div></aside></div></main>;
}
