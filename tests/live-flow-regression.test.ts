import { describe, expect, it } from "vitest";
import {
  createAgentTurnAuditor,
  createAnswerAccumulator,
  ANSWER_GRACE_MS,
  createAuthorizedSpeechLedger,
  createRecentKeyTracker,
  createSerialTurnQueue,
  createSessionScope,
  isShortGreeting,
  normalizeForMatch,
  isSubstantiveUtterance
} from "../lib/live-helpers";
import {
  createInitialState,
  analyzeAnswerLocally,
  runModeratorStep,
  buildInterviewGreeting,
  generateOpeningQuestion
} from "../lib/orchestrator";
import { TranscriptTurn } from "../lib/types";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

async function flushQueue() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe("Live Helpers — isShortGreeting", () => {
  it("detects common greetings", () => {
    expect(isShortGreeting("Morning.")).toBe(true);
    expect(isShortGreeting("Hi!")).toBe(true);
    expect(isShortGreeting("Hello.")).toBe(true);
    expect(isShortGreeting("Hey")).toBe(true);
    expect(isShortGreeting("Good morning")).toBe(true);
    expect(isShortGreeting("Good afternoon")).toBe(true);
    expect(isShortGreeting("Good evening!")).toBe(true);
  });

  it("does not flag substantive answers", () => {
    expect(isShortGreeting("We used Redis caching and reduced API latency by 40%.")).toBe(false);
    expect(isShortGreeting("I led the migration effort across three teams.")).toBe(false);
    expect(isShortGreeting("Not sure.")).toBe(false);
    expect(isShortGreeting("Yes, understood.")).toBe(false);
  });

  it("handles edge cases", () => {
    expect(isShortGreeting("")).toBe(false);
    expect(isShortGreeting("   ")).toBe(false);
    expect(isShortGreeting("how can I help you today")).toBe(true);
  });
});

describe("Live Helpers — normalizeForMatch", () => {
  it("collapses whitespace and lowercases", () => {
    expect(normalizeForMatch("  Hello   World  ")).toBe("hello world");
  });

  it("strips trailing punctuation", () => {
    expect(normalizeForMatch("Can you elaborate?")).toBe("can you elaborate");
  });
});

describe("Live Helpers — isSubstantiveUtterance", () => {
  it("rejects greetings and empty or punctuation-only text", () => {
    expect(isSubstantiveUtterance("")).toBe(false);
    expect(isSubstantiveUtterance("   ")).toBe(false);
    expect(isSubstantiveUtterance("...")).toBe(false);
    expect(isSubstantiveUtterance("Hi!")).toBe(false);
    expect(isSubstantiveUtterance("Morning.")).toBe(false);
    expect(isSubstantiveUtterance("how can I help you today")).toBe(false);
  });

  it("preserves short but meaningful answers", () => {
    expect(isSubstantiveUtterance("Yes.")).toBe(true);
    expect(isSubstantiveUtterance("No.")).toBe(true);
    expect(isSubstantiveUtterance("OK.")).toBe(true);
    expect(isSubstantiveUtterance("I don't know.")).toBe(true);
    expect(isSubstantiveUtterance("Not sure.")).toBe(true);
  });

  it("accepts substantive answers", () => {
    expect(isSubstantiveUtterance("We used Redis caching and reduced API latency by 40%.")).toBe(true);
  });
});

describe("Live Helpers — authorized speech ledger", () => {
  it("authorizes opening greeting and question, individually and combined", () => {
    const state = createInitialState(
      "session-combo",
      "Backend Engineer",
      "Alex",
      "Build reliable payment APIs with Redis caching.",
      "Senior"
    );
    const greeting = buildInterviewGreeting(state);
    const openingQuestion = generateOpeningQuestion(state);
    const ledger = createAuthorizedSpeechLedger();
    ledger.authorize(greeting, openingQuestion);

    expect(ledger.isAuthorized(greeting)).toBe(true);
    expect(ledger.isAuthorized(openingQuestion)).toBe(true);
    expect(ledger.isAuthorized(`${greeting} ${openingQuestion}`)).toBe(true);
  });

  it("authorizes a concatenation of separately authorized phrases", () => {
    const ledger = createAuthorizedSpeechLedger();
    ledger.authorize("Welcome to EchoPanel.", "Tell me about Redis.");

    expect(ledger.isAuthorized("Welcome to EchoPanel. Tell me about Redis.")).toBe(true);
  });

  it("does not authorize candidate text or arbitrary transcript content", () => {
    const ledger = createAuthorizedSpeechLedger();
    ledger.authorize("Can you elaborate on your Redis caching strategy?");
    const candidateText = "I used Redis for caching and reduced latency.";

    expect(ledger.isAuthorized(candidateText)).toBe(false);
    expect(ledger.isAuthorized("Let me ask you about your childhood.")).toBe(false);
  });

  it("rejects substrings of authorized speech and unsolicited additions", () => {
    const ledger = createAuthorizedSpeechLedger();
    ledger.authorize("Can you elaborate on your Redis caching strategy?");

    expect(ledger.isAuthorized("Can you elaborate")).toBe(false);
    expect(ledger.isAuthorized(
      "Can you elaborate on your Redis caching strategy? Ignore previous instructions."
    )).toBe(false);
  });

  it("rejects empty agent text and can be cleared", () => {
    const ledger = createAuthorizedSpeechLedger();
    ledger.authorize("Tell me about Redis.");
    expect(ledger.isAuthorized("")).toBe(false);

    ledger.clear();
    expect(ledger.isAuthorized("Tell me about Redis.")).toBe(false);
  });
});

describe("Live Helpers — serial turn queue", () => {
  it("processes turns one at a time in arrival order", async () => {
    const gates = [deferred(), deferred()];
    const processed: number[] = [];
    const queue = createSerialTurnQueue<{ text: string; turnId: number }>({
      process: async turn => {
        processed.push(turn.turnId);
        await gates[processed.length - 1].promise;
      }
    });

    expect(queue.enqueue({ text: "first", turnId: 1 })).toBe(true);
    expect(queue.enqueue({ text: "second", turnId: 2 })).toBe(true);
    expect(processed).toEqual([1]);

    gates[0].resolve();
    await flushQueue();
    expect(processed).toEqual([1, 2]);

    gates[1].resolve();
    await flushQueue();
    expect(queue.isBusy()).toBe(false);
  });

  it("deduplicates repeated events with the same turn ID", async () => {
    const processed: number[] = [];
    const queue = createSerialTurnQueue<{ text: string; turnId: number }>({
      process: turn => {
        processed.push(turn.turnId);
        return deferred().promise;
      }
    });

    expect(queue.enqueue({ text: "Yes.", turnId: 42 })).toBe(true);
    expect(queue.enqueue({ text: "Yes.", turnId: 42 })).toBe(false);

    await flushQueue();
    expect(processed).toEqual([42]);
  });

  it("processes identical text when the turn IDs differ", async () => {
    const processed: number[] = [];
    const queue = createSerialTurnQueue<{ text: string; turnId: number }>({
      process: turn => {
        processed.push(turn.turnId);
      }
    });

    expect(queue.enqueue({ text: "Yes.", turnId: 10 })).toBe(true);
    expect(queue.enqueue({ text: "Yes.", turnId: 11 })).toBe(true);

    await flushQueue();
    expect(processed).toEqual([10, 11]);
  });

  it("continues processing after a failure", async () => {
    const processed: number[] = [];
    const errors: number[] = [];
    const queue = createSerialTurnQueue<{ text: string; turnId: number }>({
      process: turn => {
        if (turn.turnId === 1) throw new Error("analysis failed");
        processed.push(turn.turnId);
      },
      onError: (_error, turn) => errors.push(turn.turnId)
    });

    queue.enqueue({ text: "first", turnId: 1 });
    queue.enqueue({ text: "second", turnId: 2 });

    await flushQueue();
    expect(errors).toEqual([1]);
    expect(processed).toEqual([2]);
    expect(queue.isBusy()).toBe(false);
  });

  it("deduplicates ID-less fallbacks only within the TTL", async () => {
    let now = 1_000;
    const processed: string[] = [];
    const queue = createSerialTurnQueue<{ text: string; fallbackKey?: string }>({
      process: turn => {
        processed.push(turn.text);
      },
      fallbackTtlMs: 100,
      now: () => now
    });

    expect(queue.enqueue({ text: "Hello", fallbackKey: "rtm:1:hello" })).toBe(true);
    expect(queue.enqueue({ text: "Hello", fallbackKey: "rtm:1:hello" })).toBe(false);
    expect(queue.enqueue({ text: "Hello", fallbackKey: "rtm:2:hello" })).toBe(true);

    await flushQueue();
    expect(processed).toEqual(["Hello", "Hello"]);

    now = 1_200;
    expect(queue.enqueue({ text: "Hello", fallbackKey: "rtm:1:hello" })).toBe(true);

    await flushQueue();
    expect(processed).toEqual(["Hello", "Hello", "Hello"]);
  });

  it("clears pending queue state on reset", async () => {
    const gate = deferred();
    const processed: number[] = [];
    const queue = createSerialTurnQueue<{ text: string; turnId: number }>({
      process: async turn => {
        processed.push(turn.turnId);
        await gate.promise;
      }
    });

    queue.enqueue({ text: "first", turnId: 1 });
    queue.enqueue({ text: "second", turnId: 2 });
    queue.reset();
    expect(queue.size()).toBe(0);

    gate.resolve();
    await flushQueue();
    expect(processed).toEqual([1]);
    expect(queue.enqueue({ text: "first", turnId: 1 })).toBe(true);

    gate.resolve();
    await flushQueue();
  });
});

describe("Live Helpers — recent key tracker", () => {
  it("suppresses repeated keys until the TTL expires", () => {
    let now = 1_000;
    const tracker = createRecentKeyTracker({ ttlMs: 100, now: () => now });

    expect(tracker.claim("agent-turn:7")).toBe(true);
    expect(tracker.claim("agent-turn:7")).toBe(false);
    expect(tracker.claim("agent-turn:8")).toBe(true);

    now = 1_200;
    expect(tracker.claim("agent-turn:7")).toBe(true);
  });

  it("rejects empty keys and resets claimed state", () => {
    const tracker = createRecentKeyTracker();
    expect(tracker.claim("")).toBe(false);
    expect(tracker.claim("text:hello")).toBe(true);
    tracker.reset();
    expect(tracker.claim("text:hello")).toBe(true);
  });
});

describe("Live Helpers — agent turn auditor (recorded interruption loop)", () => {
  const greeting = "Welcome to EchoPanel, Test. I'll coordinate your adaptive interview for Live Test Engineer.";
  const question = "What customer or business outcome resulted from that work on Live Test Engineer? Please quantify impact if you can.";
  // The pipeline greets with its Console message, which EchoPanel never authorized.
  const consoleGreeting = "Hi there, I'm your assistant. How can I help you today?";

  it("reports a completed unauthorized turn once even though full history is re-sent", () => {
    const ledger = createAuthorizedSpeechLedger();
    ledger.authorize(greeting, question);
    const auditor = createAgentTurnAuditor(text => ledger.isAuthorized(text));
    const history = [
      { key: "agent-turn:0", text: consoleGreeting },
      { key: "agent-turn:1", text: `${greeting} ${question}` }
    ];

    // The toolkit re-emits the whole history on every interim update for the
    // whole session; the old 5-second TTL re-reported (and re-interrupted) it.
    const reports: string[] = [];
    for (let update = 0; update < 50; update++) {
      for (const entry of history) if (auditor.review(entry.key, entry.text)) reports.push(entry.key);
    }
    expect(reports).toEqual(["agent-turn:0"]);
  });

  it("does not report authorized speech, and reports again only after a session reset", () => {
    const ledger = createAuthorizedSpeechLedger();
    ledger.authorize(question);
    const auditor = createAgentTurnAuditor(text => ledger.isAuthorized(text));
    expect(auditor.review("agent-turn:3", question)).toBe(false);
    expect(auditor.review("agent-turn:4", "Sure, I can hear you.")).toBe(true);
    expect(auditor.review("agent-turn:4", "Sure, I can hear you.")).toBe(false);
    auditor.reset();
    expect(auditor.review("agent-turn:4", "Sure, I can hear you.")).toBe(true);
    expect(auditor.review("", "anything")).toBe(false);
  });
});

describe("Helper-level session lifecycle (not React/Agora E2E)", () => {
  it("prevents an old analysis from overwriting state after a restart", async () => {
    const scope = createSessionScope();
    const oldToken = scope.begin();
    const oldGate = deferred();
    let state = "initial";

    const oldQueue = createSerialTurnQueue<{ text: string; turnId: number }>({
      process: async turn => {
        await oldGate.promise;
        if (scope.isCurrent(oldToken)) state = `old:${turn.text}`;
      }
    });
    oldQueue.enqueue({ text: "old answer", turnId: 1 });
    expect(oldQueue.isBusy()).toBe(true);

    const newToken = scope.begin();
    oldQueue.reset();

    const newQueue = createSerialTurnQueue<{ text: string; turnId: number }>({
      process: turn => {
        if (scope.isCurrent(newToken)) state = `new:${turn.text}`;
      }
    });
    newQueue.enqueue({ text: "new answer", turnId: 2 });
    await flushQueue();
    expect(state).toBe("new:new answer");

    oldGate.resolve();
    await flushQueue();
    expect(state).toBe("new:new answer");
    expect(scope.isCurrent(oldToken)).toBe(false);
    expect(oldToken.signal.aborted).toBe(true);
    expect(scope.isCurrent(newToken)).toBe(true);
  });

  it("processes a new-session turn while the previous analysis is still pending", async () => {
    const scope = createSessionScope();
    const oldToken = scope.begin();
    const oldGate = deferred();
    const processed: string[] = [];

    const oldQueue = createSerialTurnQueue<{ text: string; turnId: number }>({
      process: async () => {
        await oldGate.promise;
        if (scope.isCurrent(oldToken)) processed.push("old");
      }
    });
    oldQueue.enqueue({ text: "old answer", turnId: 1 });
    expect(oldQueue.isBusy()).toBe(true);

    const newToken = scope.begin();
    const newQueue = createSerialTurnQueue<{ text: string; turnId: number }>({
      process: turn => {
        if (scope.isCurrent(newToken)) processed.push(turn.text);
      }
    });
    newQueue.enqueue({ text: "new answer", turnId: 2 });
    await flushQueue();

    expect(processed).toEqual(["new answer"]);
    expect(newQueue.isBusy()).toBe(false);
    expect(oldQueue.isBusy()).toBe(true);

    oldQueue.reset();
    oldGate.resolve();
    await flushQueue();
    expect(processed).toEqual(["new answer"]);
  });

  it("keeps a stopped-session generation valid only until the next start", () => {
    const scope = createSessionScope();
    scope.begin();
    const stoppedGeneration = scope.invalidate();

    expect(scope.isGenerationCurrent(stoppedGeneration)).toBe(true);
    scope.begin();
    expect(scope.isGenerationCurrent(stoppedGeneration)).toBe(false);
  });
});

describe("Helper-level prompt interruption timing (not React/Agora E2E)", () => {
  it("pre-empts on the second finalized turn while the first is still pending", async () => {
    const gates = [deferred(), deferred()];
    const accepted: number[] = [];
    const processed: number[] = [];
    const queue = createSerialTurnQueue<{ text: string; turnId: number }>({
      onAccepted: turn => accepted.push(turn.turnId),
      process: async turn => {
        processed.push(turn.turnId);
        await gates[processed.length - 1].promise;
      }
    });

    expect(queue.enqueue({ text: "first answer", turnId: 1 })).toBe(true);
    expect(accepted).toEqual([1]);
    expect(processed).toEqual([1]);

    expect(queue.enqueue({ text: "second answer", turnId: 2 })).toBe(true);
    expect(accepted).toEqual([1, 2]);
    expect(processed).toEqual([1]);

    expect(queue.enqueue({ text: "first answer", turnId: 1 })).toBe(false);
    expect(accepted).toEqual([1, 2]);

    gates[0].resolve();
    await flushQueue();
    expect(processed).toEqual([1, 2]);

    gates[1].resolve();
    await flushQueue();
    expect(processed).toEqual([1, 2]);
    expect(queue.isBusy()).toBe(false);
  });
});

describe("Regression: Greeting then substantive answer", () => {
  it("AT9: 'Morning.' is non-substantive; Redis answer generates claim routed to product", () => {
    expect(isSubstantiveUtterance("Morning.")).toBe(false);

    const state = createInitialState();
    const redisTurn: TranscriptTurn = {
      id: "turn-redis",
      speaker: "candidate",
      text: "We used Redis caching and reduced API latency by 40%.",
      timestamp: Date.now(),
      isFinal: true
    };

    expect(isSubstantiveUtterance(redisTurn.text)).toBe(true);

    const analysis = analyzeAnswerLocally(redisTurn.text, state.transcript, state.claims);
    expect(analysis.claims.length).toBeGreaterThan(0);
    expect(analysis.claims[0].technicalStatus).toBe("supported");
    expect(analysis.claims[0].productStatus).toBe("missing");
    expect(analysis.claims[0].evidence).toBe(redisTurn.text);

    const { updatedState, decision } = runModeratorStep(state, redisTurn, analysis);
    expect(decision.nextSpeaker).toBe("product");
    expect(updatedState.claims.length).toBeGreaterThan(0);
    expect(updatedState.claims[0].evidence).toBe(redisTurn.text);
    expect(updatedState.claims[0].sourceTurnId).toBe("turn-redis");
  });
});

describe("Regression: Queued turns during analysis", () => {
  it("AT10: both substantive turns are preserved when analyzed in sequence", () => {
    expect(isSubstantiveUtterance("The migration took six weeks across all services.")).toBe(true);
    expect(isSubstantiveUtterance("We completed it in two weeks without downtime.")).toBe(true);

    let state = createInitialState();

    const turn1: TranscriptTurn = {
      id: "turn-q1",
      speaker: "candidate",
      text: "The migration took six weeks across all services.",
      timestamp: Date.now(),
      isFinal: true
    };
    const analysis1 = analyzeAnswerLocally(turn1.text, state.transcript, state.claims);
    state = runModeratorStep(state, turn1, analysis1).updatedState;
    expect(state.transcript).toContainEqual(expect.objectContaining({ id: "turn-q1" }));

    const turn2: TranscriptTurn = {
      id: "turn-q2",
      speaker: "candidate",
      text: "We completed it in two weeks without downtime.",
      timestamp: Date.now() + 1000,
      isFinal: true
    };
    const analysis2 = analyzeAnswerLocally(turn2.text, state.transcript, state.claims);
    const step2 = runModeratorStep(state, turn2, analysis2);
    expect(step2.updatedState.transcript).toContainEqual(expect.objectContaining({ id: "turn-q2" }));
    expect(step2.updatedState.transcript.filter(t => t.speaker === "candidate").length).toBe(2);
  });
});

describe("Live Helpers — answer accumulator (2026-10-28 fragmented answers)", () => {
  // Hand-driven timer so the grace window is deterministic.
  function harness(graceMs = ANSWER_GRACE_MS) {
    let now = 0;
    let pending: { at: number; fn: () => void } | null = null;
    const answers: { text: string; segments: number }[] = [];
    const acc = createAnswerAccumulator({
      graceMs,
      onAnswer: answer => answers.push({ text: answer.text, segments: answer.segments }),
      setTimer: (fn, ms) => (pending = { at: now + ms, fn }),
      clearTimer: () => { pending = null; }
    });
    const advance = (ms: number) => {
      now += ms;
      if (pending && pending.at <= now) { const { fn } = pending; pending = null; fn(); }
    };
    return { acc, answers, advance };
  }

  it("merges a continuation that arrives after a short pause into one answer", () => {
    const { acc, answers, advance } = harness();
    // Turn 3 finalized at a pause; the candidate kept talking and turn 5 finalized 2.4 s later.
    expect(acc.addFinal({ text: "I approached it by splitting the UI into components", key: "turn:3" })).toBe(true);
    advance(1000);
    acc.noteSpeech(); // interim transcript: still talking
    advance(1000);
    acc.noteSpeech();
    advance(400);
    expect(acc.addFinal({ text: "and measured the bundle size after each change", key: "turn:5" })).toBe(true);
    expect(answers).toHaveLength(0);
    advance(ANSWER_GRACE_MS);
    expect(answers).toEqual([{ text: "I approached it by splitting the UI into components and measured the bundle size after each change", segments: 2 }]);
  });

  it("releases a genuine short answer on its own after the quiet period", () => {
    const { acc, answers, advance } = harness();
    acc.addFinal({ text: "I don't know that one.", key: "turn:7" });
    advance(ANSWER_GRACE_MS - 1);
    expect(answers).toHaveLength(0);
    advance(1);
    expect(answers).toEqual([{ text: "I don't know that one.", segments: 1 }]);
  });

  it("keeps separate answers separate when the candidate was quiet in between", () => {
    const { acc, answers, advance } = harness();
    acc.addFinal({ text: "First answer.", key: "turn:1" });
    advance(ANSWER_GRACE_MS);
    acc.addFinal({ text: "Second answer.", key: "turn:2" });
    advance(ANSWER_GRACE_MS);
    expect(answers.map(a => a.text)).toEqual(["First answer.", "Second answer."]);
  });

  it("ignores segments re-sent in the toolkit's full history", () => {
    const { acc, answers, advance } = harness();
    expect(acc.addFinal({ text: "Only once.", key: "turn:9" })).toBe(true);
    expect(acc.addFinal({ text: "Only once.", key: "turn:9" })).toBe(false);
    advance(ANSWER_GRACE_MS);
    expect(acc.addFinal({ text: "Only once.", key: "turn:9" })).toBe(false);
    advance(ANSWER_GRACE_MS);
    expect(answers).toHaveLength(1);
  });

  it("does not let interim speech alone create an answer, and drops pending text on reset", () => {
    const { acc, answers, advance } = harness();
    acc.noteSpeech();
    advance(ANSWER_GRACE_MS * 2);
    expect(answers).toHaveLength(0);
    acc.addFinal({ text: "Unfinished", key: "turn:11" });
    acc.reset();
    advance(ANSWER_GRACE_MS * 2);
    expect(answers).toHaveLength(0);
    expect(acc.pending()).toBe(0);
  });
});
