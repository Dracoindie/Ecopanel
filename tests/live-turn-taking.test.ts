import { describe, expect, it } from "vitest";
import { createTurnTaker, MIN_HEARD_MS, type LiveQuestion } from "../lib/live-turn-taking";
import { ANSWER_GRACE_MS } from "../lib/live-helpers";

/**
 * Simulated live interview in 100 ms steps. Candidate speech intervals drive
 * microphone levels, interim transcripts and a final transcript 1.1 s after the
 * last word (Agora's measured end-of-speech latency). Each question plays for
 * its length unless interrupted; the stand-in Moderator asks the next question
 * 1.1 s after an answer and closes after 8 answers.
 */
type Speech = { start: number; end: number; words?: boolean };

function simulate(speech: Speech[], opts: { answersNeeded?: number; until: number }) {
  let now = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let timerId = 0;
  const log: string[] = [];
  const answers: string[] = [];
  const continuations: string[] = [];
  const plays: { question: string; sentAt: number; playedMs: number; cut: boolean }[] = [];
  // Assigned inside callbacks, so the cast stops TypeScript narrowing it to null.
  let playing = null as { question: string; start: number; end: number; idx: number } | null;
  let questionNo = 0;
  const limit = opts.answersNeeded ?? 8;

  const setTimer = (fn: () => void, ms: number) => { const id = ++timerId; timers.push({ at: now + ms, fn, id }); return id; };
  const clearTimer = (id: unknown) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); };

  const send = (q: LiveQuestion) => {
    tt.questionSent(q);
    const duration = Math.round((q.text.split(" ").length / 2.6) * 1000);
    plays.push({ question: q.text, sentAt: now, playedMs: 0, cut: false });
    playing = { question: q.text, start: now + 300, end: now + 300 + duration, idx: plays.length - 1 };
  };
  const nextQuestion = (): LiveQuestion => {
    questionNo += 1;
    return answers.length >= limit
      ? { text: "closing thank you for your time today", speaker: "moderator" }
      : { text: `question ${questionNo} ${"word ".repeat(18).trim()}`, speaker: "technical" };
  };
  const ask = (q: LiveQuestion) => { if (tt.requestQuestion(q)) send(q); };

  const tt = createTurnTaker({
    onAnswer: a => {
      answers.push(a.key);
      log.push(`${now} answer ${a.key}`);
      setTimer(() => ask(nextQuestion()), 1100);
    },
    onContinuation: a => { continuations.push(a.key); log.push(`${now} continuation ${a.key}`); },
    onAsk: (q, reason) => { log.push(`${now} ask(${reason})`); setTimer(() => send(q), 300); },
    onInterruptQuestion: () => {
      if (playing) { plays[playing.idx].cut = true; plays[playing.idx].playedMs = Math.max(0, now - playing.start); playing = null; }
    }
  }, { now: () => now, setTimer, clearTimer });

  // Opening question at t=0 (greeting + first question, 22.4 s).
  send({ text: `opening ${"word ".repeat(57).trim()}`, speaker: "technical" });

  const finals = new Set<number>();
  for (; now <= opts.until; now += 100) {
    for (const t of [...timers].sort((a, b) => a.at - b.at)) if (t.at <= now) { timers.splice(timers.indexOf(t), 1); t.fn(); }
    const active = speech.find(s => now >= s.start && now < s.end);
    tt.micLevel(active ? 0.2 : 0);
    if (active && active.words !== false && now - active.start >= 500 && (now - active.start) % 500 === 0) {
      tt.candidateTranscript({ final: false, text: "partial", key: "interim" });
    }
    speech.forEach((s, i) => {
      if (s.words !== false && !finals.has(i) && now >= s.end + 1100) {
        finals.add(i);
        tt.candidateTranscript({ final: true, text: `segment ${i}`, key: `seg:${i}` });
      }
    });
    if (playing) {
      if (now >= playing.start && now < playing.end) tt.agentLevel(0.3);
      else { tt.agentLevel(0); if (now >= playing.end) { plays[playing.idx].playedMs = playing.end - playing.start; playing = null; } }
    } else tt.agentLevel(0);
  }
  return { answers, continuations, plays, log };
}

// Tonight's candidate speech (16:09 session), seconds from the opening, from
// Agora turn timings: end = voice_input start - 1.1 s, start = end - speech duration.
const tonight: Speech[] = [
  { start: 3900, end: 4070, words: false }, // 170 ms sound that cut the greeting at 4.0 s
  { start: 13600, end: 15400 },             // answer 1
  { start: 26200, end: 30400 },             // answer 2
  { start: 34100, end: 38700 },             // resumed 3.7 s later; cut the resume question at 0.13 s
  { start: 53900, end: 57300 },             // answer 3
  { start: 59300, end: 63500 },             // resumed 2.0 s later
  { start: 66500, end: 73600 },             // resumed 3.0 s later; cut the GitHub question at 0 s
  { start: 86500, end: 97000 },             // answer 4
  { start: 107600, end: 131900 }            // answer 5
];

describe("Live turn taking — replay of the 2026-10-28 16:09 session", () => {
  const run = simulate(tonight, { until: 140_000 });

  it("does not let a 170 ms sound cut the greeting and opening question", () => {
    expect(run.plays[0].cut && run.plays[0].playedMs < 13_000).toBe(false);
    expect(run.plays[0].playedMs).toBeGreaterThan(13_000);
  });

  it("counts each spoken answer once: 5 answers, the 3 resumptions merged into the answer they continued", () => {
    expect(run.answers).toHaveLength(5);
    const segmentsUsed = [...run.answers, ...run.continuations].join("+").split("+").map(k => k.replace(/^answer:/, ""));
    expect(new Set(segmentsUsed).size).toBe(segmentsUsed.length); // no segment counted twice
    expect(segmentsUsed.sort()).toEqual(["seg:1", "seg:2", "seg:3", "seg:4", "seg:5", "seg:6", "seg:7", "seg:8"]);
  });

  it("never loses a question: every question is eventually heard for at least MIN_HEARD_MS", () => {
    const heard = new Set(run.plays.filter(p => p.playedMs >= MIN_HEARD_MS).map(p => p.question));
    const asked = new Set(run.plays.map(p => p.question));
    for (const q of asked) {
      if (q === run.plays[run.plays.length - 1].question && run.plays[run.plays.length - 1].sentAt > 135_000) continue; // still playing at end of replay
      expect(heard.has(q)).toBe(true);
    }
  });

  it("re-asks a cut question instead of moving on", () => {
    const cut = run.plays.filter(p => p.cut && p.playedMs < MIN_HEARD_MS);
    for (const c of cut) expect(run.plays.filter(p => p.question === c.question).length).toBeGreaterThan(1);
  });
});

describe("Live turn taking — reaching 8 real answers", () => {
  it("reaches 8 real answers with mid-answer pauses and closes once", () => {
    // Tonight's 5 answers, then 3 more, each with a 2.5 s thinking pause mid-answer.
    const more: Speech[] = [];
    let t = 150_000;
    for (let i = 0; i < 3; i++) {
      more.push({ start: t, end: t + 6000 }, { start: t + 8500, end: t + 14_000 });
      t += 40_000;
    }
    const run = simulate([...tonight, ...more], { until: t + 20_000 });
    expect(run.answers).toHaveLength(8);
    const closing = run.plays.filter(p => p.question.startsWith("closing"));
    expect(closing).toHaveLength(1);
    expect(closing[0].cut).toBe(false);
  });

  it("keeps a short genuine answer as one answer", () => {
    const run = simulate([{ start: 25_000, end: 25_800 }], { until: 40_000, answersNeeded: 8 });
    expect(run.answers).toHaveLength(1);
    expect(run.continuations).toHaveLength(0);
  });

  it("does not let a cough during a question cut it off", () => {
    const run = simulate([{ start: 5_000, end: 5_400, words: false }, { start: 9_000, end: 9_300, words: false }], { until: 30_000 });
    expect(run.plays[0].cut).toBe(false);
    expect(run.answers).toHaveLength(0);
  });

  it("uses the configured grace window", () => {
    expect(ANSWER_GRACE_MS).toBe(2000);
  });
});
