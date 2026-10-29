/**
 * Browser-side turn taking for the live interview.
 *
 * EchoPanel's own questions are sent with interruptable=false, so Agora never
 * cuts them on a short sound; this module decides instead. A question is cut
 * only by sustained candidate speech (SUSTAINED_SPEECH_MS of microphone level
 * plus recognised words). When the candidate is still continuing their
 * previous answer (they resumed soon after their last words, or the question
 * had barely played), the speech is merged into that answer, no new answer is
 * counted, and the cut question is asked again once they finish. A question
 * that becomes ready while the candidate is still talking is held, not spoken.
 *
 * Pure and clock-injected: the component feeds audio levels and transcript
 * events; tests replay recorded timings.
 */
import { ANSWER_GRACE_MS, createAnswerAccumulator, type AnswerSegment } from "@/lib/live-helpers";

/** Speech must be sustained this long before it may cut a question. */
export const SUSTAINED_SPEECH_MS = 600;
/** Speech that resumes within this long after the candidate's last words continues that answer. */
export const CONTINUATION_WINDOW_MS = 5000;
/** A question cut before this much playback cannot have been heard, so it is always asked again. */
export const MIN_HEARD_MS = 1500;
/** Microphone level (0-1) treated as candidate voice. */
export const MIC_SPEECH_LEVEL = 0.06;
/** Remote agent audio level (0-1) treated as playback. */
export const AGENT_AUDIO_LEVEL = 0.02;
/** Silence after which voice or playback is considered stopped. */
const VOICE_HANGOVER_MS = 400;
const PLAYBACK_HANGOVER_MS = 700;
/** A sent question that never starts playing is treated as finished after this long. */
const PLAYBACK_START_TIMEOUT_MS = 5000;

export type LiveQuestion = { text: string; speaker: string };

export type TurnTakingEvents = {
  /** A complete new answer for the Moderator. */
  onAnswer: (answer: AnswerSegment & { segments: number }) => void;
  /** Speech that continues the previous answer; merge it, do not count a new answer. */
  onContinuation: (answer: AnswerSegment & { segments: number }) => void;
  /** Send this question to the agent now (a held or cut question). */
  onAsk: (question: LiveQuestion, reason: "held" | "reask") => void;
  /** Stop the question that is playing. */
  onInterruptQuestion: () => void;
  /** Timestamps and durations only. */
  onDiag?: (event: string, fields: Record<string, number | boolean | string>) => void;
};

export type TurnTaker = {
  /** The Moderator has a question ready. Returns false when it is held for later. */
  requestQuestion: (question: LiveQuestion) => boolean;
  /** A question was sent to the agent for playback. */
  questionSent: (question: LiveQuestion) => void;
  /** True while an EchoPanel question is sent, held or playing. */
  questionActive: () => boolean;
  micLevel: (level: number) => void;
  agentLevel: (level: number) => void;
  /** Candidate transcript: interim (still speaking) or a finalized segment. */
  candidateTranscript: (entry: { final: boolean; text: string; key: string }) => void;
  reset: () => void;
};

export function createTurnTaker(events: TurnTakingEvents, options: {
  now?: () => number;
  graceMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
} = {}): TurnTaker {
  const now = options.now ?? Date.now;
  const diag = (event: string, fields: Record<string, number | boolean | string> = {}) => events.onDiag?.(event, { at: now(), ...fields });

  // Candidate voice (microphone).
  let voiceSince: number | null = null;
  let lastVoiceAt = -Infinity;
  let speaking = false;
  let speechStartedAt = 0;
  let wordsSinceSpeechStart = false;
  let lastAnswerEndAt = -Infinity;

  // Agent playback of the current question.
  let current: (LiveQuestion & { sentAt: number; playStartedAt: number | null }) | null = null;
  let agentPlaying = false;
  let lastAgentAudioAt = -Infinity;

  // A question waiting for the candidate to finish.
  let pending: { question: LiveQuestion; reason: "held" | "reask" } | null = null;
  let continuing = false;

  const graceMs = options.graceMs ?? ANSWER_GRACE_MS;
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let fallbackTimer: unknown = null;

  // A held or cut question is never lost: if the candidate stops without
  // producing a transcript to merge, ask it anyway after the grace period.
  const scheduleFallbackAsk = () => {
    if (fallbackTimer !== null) clearTimer(fallbackTimer);
    fallbackTimer = setTimer(() => {
      fallbackTimer = null;
      if (!continuing || !pending || speaking || accumulator.pending() > 0) return;
      const { question, reason } = pending;
      pending = null;
      continuing = false;
      diag("question-ask-after-silence", { reason });
      events.onAsk(question, reason);
    }, graceMs);
  };

  const accumulator = createAnswerAccumulator({
    graceMs,
    setTimer: options.setTimer,
    clearTimer: options.clearTimer,
    onAnswer: answer => {
      lastAnswerEndAt = Number.isFinite(lastVoiceAt) ? lastVoiceAt : now();
      if (continuing) {
        continuing = false;
        diag("answer-continuation", { segments: answer.segments });
        events.onContinuation(answer);
        if (pending) {
          const { question, reason } = pending;
          pending = null;
          diag(reason === "reask" ? "question-reask" : "question-released");
          events.onAsk(question, reason);
        }
        return;
      }
      diag("answer-complete", { segments: answer.segments });
      events.onAnswer(answer);
    }
  });

  const finishQuestion = (cause: "ended" | "cut" | "no-playback") => {
    if (!current) return;
    const playedMs = current.playStartedAt === null ? 0 : now() - current.playStartedAt;
    diag(cause === "cut" ? "question-cut" : "question-play-end", { playedMs, cause });
    current = null;
  };

  const sustainedSpeechStarted = () => {
    if (!current && !pending) return;
    if (current) {
      const playedMs = current.playStartedAt === null ? 0 : now() - current.playStartedAt;
      const gapMs = speechStartedAt - lastAnswerEndAt;
      const continuation = gapMs <= CONTINUATION_WINDOW_MS || playedMs < MIN_HEARD_MS;
      diag("question-cut-by-speech", { playedMs, gapMs: Number.isFinite(gapMs) ? gapMs : -1, continuation });
      const cutQuestion: LiveQuestion = { text: current.text, speaker: current.speaker };
      events.onInterruptQuestion();
      finishQuestion("cut");
      if (continuation) {
        continuing = true;
        pending = { question: cutQuestion, reason: "reask" };
      }
    }
  };

  return {
    requestQuestion(question) {
      // The candidate is still talking: hold the question and treat the speech as a continuation.
      if (speaking || accumulator.pending() > 0) {
        continuing = true;
        pending = { question, reason: "held" };
        diag("question-held", { speaking, pendingSegments: accumulator.pending() });
        return false;
      }
      return true;
    },
    questionSent(question) {
      current = { ...question, sentAt: now(), playStartedAt: null };
      diag("question-sent");
    },
    questionActive() {
      return current !== null || pending !== null;
    },
    micLevel(level) {
      const t = now();
      if (level >= MIC_SPEECH_LEVEL) {
        if (voiceSince === null) voiceSince = t;
        lastVoiceAt = t;
        accumulator.noteSpeech();
        if (!speaking && t - voiceSince >= SUSTAINED_SPEECH_MS) {
          speaking = true;
          speechStartedAt = voiceSince;
          diag("candidate-speech-start", { startedAt: voiceSince });
        }
        if (speaking && wordsSinceSpeechStart) sustainedSpeechStarted();
      } else if (t - lastVoiceAt >= VOICE_HANGOVER_MS) {
        if (speaking) {
          diag("candidate-speech-end", { durationMs: lastVoiceAt - speechStartedAt });
          if (continuing && pending) scheduleFallbackAsk();
        }
        speaking = false;
        voiceSince = null;
        wordsSinceSpeechStart = false;
      }
    },
    agentLevel(level) {
      const t = now();
      if (level >= AGENT_AUDIO_LEVEL) {
        lastAgentAudioAt = t;
        if (!agentPlaying) agentPlaying = true;
        if (current && current.playStartedAt === null) {
          current.playStartedAt = t;
          diag("question-play-start", { latencyMs: t - current.sentAt });
        }
      } else if (agentPlaying && t - lastAgentAudioAt >= PLAYBACK_HANGOVER_MS) {
        agentPlaying = false;
        if (current && current.playStartedAt !== null) finishQuestion("ended");
      }
      if (current && current.playStartedAt === null && t - current.sentAt >= PLAYBACK_START_TIMEOUT_MS) finishQuestion("no-playback");
    },
    candidateTranscript(entry) {
      if (!entry.text.trim()) return;
      if (speaking || voiceSince !== null) wordsSinceSpeechStart = true;
      if (!entry.final) {
        accumulator.noteSpeech();
      } else {
        accumulator.addFinal({ text: entry.text, key: entry.key });
      }
      // Recognised words confirm sustained speech: it may now cut a playing question.
      if (speaking) sustainedSpeechStarted();
    },
    reset() {
      accumulator.reset();
      if (fallbackTimer !== null) clearTimer(fallbackTimer);
      fallbackTimer = null;
      voiceSince = null;
      lastVoiceAt = -Infinity;
      speaking = false;
      wordsSinceSpeechStart = false;
      lastAnswerEndAt = -Infinity;
      current = null;
      agentPlaying = false;
      pending = null;
      continuing = false;
    }
  };
}
