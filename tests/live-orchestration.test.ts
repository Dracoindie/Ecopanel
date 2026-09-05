import { describe, expect, it } from "vitest";
import {
  createInitialState,
  analyzeAnswerLocally,
  runModeratorStep,
  generateFinalAssessment,
  initializeInterviewSession,
  extractJdSignals,
  generateOpeningQuestion,
  authorizeSpeaker
} from "../lib/orchestrator";
import { TranscriptTurn } from "../lib/types";

describe("Live Orchestration & Multi-Agent Engine", () => {
  it("initializes shared state with Moderator listening and baseline difficulty", () => {
    const state = createInitialState("session-1", "Backend Engineer", "Alex", "Own payment APIs and Redis latency", "Senior");
    expect(state.activeSpeaker).toBe("moderator");
    expect(state.difficulty).toBe(3);
    expect(state.jobDescription).toContain("Redis");
    expect(state.experienceLevel).toBe("Senior");
    expect(state.agentStates.moderator).toBe("listening");
    expect(state.agentStates.technical).toBe("idle");
    expect(state.agentStates.product).toBe("idle");
  });

  it("initializes interview with non-generic greeting and JD-grounded opening question", () => {
    const state = createInitialState(
      "session-jd",
      "Payments Platform Engineer",
      "Alex",
      "Build reliable payment APIs with Redis caching, low latency, and merchant checkout reliability.",
      "Senior"
    );
    const init = initializeInterviewSession(state);
    expect(init.greeting.toLowerCase()).not.toContain("how can i help you today");
    expect(init.greeting).toMatch(/EchoPanel|adaptive interview/i);
    expect(init.openingQuestion.toLowerCase()).toMatch(/payment|redis|latency|merchant|api/);
    expect(init.decision.nextSpeaker).toBe("technical");
    expect(init.updatedState.interviewInitialized).toBe(true);
    expect(extractJdSignals(state.jobDescription, state.targetRole)).toEqual(
      expect.arrayContaining(["payments", "api", "latency", "redis"])
    );
    expect(generateOpeningQuestion(state)).toMatch(/Payments Platform Engineer|payment|redis/i);
  });

  it("Acceptance Test 1: extracts Redis latency claim, marks technical supported and product missing, and Moderator routes to Product", () => {
    const state = createInitialState();
    const candidateTurn: TranscriptTurn = {
      id: "turn-1",
      speaker: "candidate",
      text: "We used Redis caching and reduced API latency by 40%.",
      timestamp: Date.now(),
      isFinal: true
    };

    const analysis = analyzeAnswerLocally(candidateTurn.text, state.transcript, state.claims);
    expect(analysis.claims.length).toBeGreaterThan(0);
    expect(analysis.claims[0].technicalStatus).toBe("supported");
    expect(analysis.claims[0].productStatus).toBe("missing");

    const { updatedState, decision } = runModeratorStep(state, candidateTurn, analysis);
    expect(decision.nextSpeaker).toBe("product");
    expect(decision.reason).toBe("Business impact evidence missing");
    expect(updatedState.agentStates.product).toBe("requesting");
    expect(updatedState.claims[0].claim).toContain("40%");
    expect(decision.suggestedQuestion?.toLowerCase()).toMatch(/customer|business/);

    const authorized = authorizeSpeaker(updatedState, "product", decision.suggestedQuestion);
    expect(authorized.activeSpeaker).toBe("product");
    expect(authorized.agentStates.product).toBe("speaking");
    expect(authorized.agentStates.technical).toBe("idle");
  });

  it("Acceptance Test 2: detects timeline contradiction, routes to behavioural, then resolves upon explanation", () => {
    let state = createInitialState();
    const turn1: TranscriptTurn = {
      id: "turn-1",
      speaker: "candidate",
      text: "The migration took six weeks across all services.",
      timestamp: Date.now(),
      isFinal: true
    };
    const analysis1 = analyzeAnswerLocally(turn1.text, state.transcript, state.claims);
    state = runModeratorStep(state, turn1, analysis1).updatedState;

    const turn2: TranscriptTurn = {
      id: "turn-2",
      speaker: "candidate",
      text: "We completed it in two weeks without downtime.",
      timestamp: Date.now() + 1000,
      isFinal: true
    };
    const analysis2 = analyzeAnswerLocally(turn2.text, state.transcript, state.claims);
    expect(analysis2.contradictions.length).toBeGreaterThan(0);
    expect(analysis2.contradictions[0].detected).toBe(true);

    const step2 = runModeratorStep(state, turn2, analysis2);
    state = step2.updatedState;
    expect(step2.decision.nextSpeaker).toBe("behavioural");
    expect(step2.decision.reason).toBe("Timeline contradiction needs reconciliation");

    const turn3: TranscriptTurn = {
      id: "turn-3",
      speaker: "candidate",
      text: "The two weeks were the staged production rollout; the full migration, including shadow traffic and validation, took six weeks.",
      timestamp: Date.now() + 2000,
      isFinal: true
    };
    const analysis3 = analyzeAnswerLocally(turn3.text, state.transcript, state.claims);
    expect(analysis3.contradictions[0].isResolved).toBe(true);

    const step3 = runModeratorStep(state, turn3, analysis3);
    expect(step3.updatedState.contradictions.every(c => c.resolved)).toBe(true);
  });

  it("Acceptance Test 3: increases difficulty after consecutive strong answers and decreases after weak ones", () => {
    let state = createInitialState();
    expect(state.difficulty).toBe(3);

    const turn1: TranscriptTurn = {
      id: "turn-1",
      speaker: "candidate",
      text: "We implemented idempotency keys, distributed locks, and retry queues with exponential backoff.",
      timestamp: Date.now(),
      isFinal: true
    };
    const analysis1 = analyzeAnswerLocally(turn1.text, [], []);
    state = runModeratorStep(state, turn1, analysis1).updatedState;

    const turn2: TranscriptTurn = {
      id: "turn-2",
      speaker: "candidate",
      text: "Checkout abandonment dropped 12% and merchant payment completion improved during peak traffic.",
      timestamp: Date.now() + 1000,
      isFinal: true
    };
    const analysis2 = analyzeAnswerLocally(turn2.text, state.transcript, state.claims);
    state = runModeratorStep(state, turn2, analysis2).updatedState;
    expect(state.difficulty).toBe(4);

    // Two weak/incomplete answers should decrease
    const weak1: TranscriptTurn = {
      id: "turn-w1",
      speaker: "candidate",
      text: "Not sure.",
      timestamp: Date.now() + 2000,
      isFinal: true
    };
    state = runModeratorStep(state, weak1, analyzeAnswerLocally(weak1.text, state.transcript, state.claims)).updatedState;
    const weak2: TranscriptTurn = {
      id: "turn-w2",
      speaker: "candidate",
      text: "I forget.",
      timestamp: Date.now() + 3000,
      isFinal: true
    };
    state = runModeratorStep(state, weak2, analyzeAnswerLocally(weak2.text, state.transcript, state.claims)).updatedState;
    expect(state.difficulty).toBe(3);
  });

  it("Acceptance Test 4: detects vagueness and demands quantified evidence at same difficulty", () => {
    const state = createInitialState();
    const before = state.difficulty;
    const candidateTurn: TranscriptTurn = {
      id: "turn-vague",
      speaker: "candidate",
      text: "We improved performance significantly and users liked it.",
      timestamp: Date.now(),
      isFinal: true
    };

    const analysis = analyzeAnswerLocally(candidateTurn.text, [], []);
    expect(analysis.quality).toBe("vague");

    const { decision, updatedState } = runModeratorStep(state, candidateTurn, analysis);
    expect(decision.nextSpeaker).toBe("technical");
    expect(decision.reason).toContain("Vague response detected");
    expect(decision.questionObjective).toBe("quantify_evidence");
    expect(updatedState.difficulty).toBe(before);
    expect(decision.suggestedQuestion?.toLowerCase()).toMatch(/p95|p99|quantify|throughput/);
  });

  it("Acceptance Test 5: generates evidence-backed assessment linked to source turns", () => {
    let state = createInitialState();
    const turn1: TranscriptTurn = {
      id: "turn-101",
      speaker: "candidate",
      text: "We used Redis caching and reduced API latency by 40%.",
      timestamp: Date.now(),
      isFinal: true
    };
    const analysis1 = analyzeAnswerLocally(turn1.text, [], []);
    state = runModeratorStep(state, turn1, analysis1).updatedState;

    const assessment = generateFinalAssessment(state);
    expect(assessment).toBeDefined();
    expect(assessment?.dimensions.technical.score).toBeGreaterThan(7.0);
    expect(assessment?.dimensions.technical.sourceTurns).toContain("turn-101");
    expect(assessment?.isAiAssisted).toBe(true);
  });

  it("Acceptance Test 6: role switching across Technical, Product, and Behavioural", () => {
    let state = createInitialState(
      "switch",
      "Backend Engineer",
      "Alex",
      "Own distributed payment systems, Redis, customer impact, and incident ownership.",
      "Mid"
    );
    const speakers = new Set<string>();

    const redisTurn: TranscriptTurn = {
      id: "t-redis",
      speaker: "candidate",
      text: "We used Redis caching and reduced API latency by 40%.",
      timestamp: Date.now(),
      isFinal: true
    };
    let step = runModeratorStep(state, redisTurn, analyzeAnswerLocally(redisTurn.text, state.transcript, state.claims));
    speakers.add(step.decision.nextSpeaker);
    state = authorizeSpeaker(step.updatedState, step.decision.nextSpeaker, step.decision.suggestedQuestion);

    const businessTurn: TranscriptTurn = {
      id: "t-biz",
      speaker: "candidate",
      text: "Checkout abandonment dropped 12% and merchants saw better completion during peak traffic.",
      timestamp: Date.now() + 1,
      isFinal: true
    };
    step = runModeratorStep(state, businessTurn, analyzeAnswerLocally(businessTurn.text, state.transcript, state.claims));
    speakers.add(step.decision.nextSpeaker);
    state = authorizeSpeaker(step.updatedState, step.decision.nextSpeaker, step.decision.suggestedQuestion);

    const contraTurn: TranscriptTurn = {
      id: "t-contra",
      speaker: "candidate",
      text: "The migration took six weeks.",
      timestamp: Date.now() + 2,
      isFinal: true
    };
    state = runModeratorStep(state, contraTurn, analyzeAnswerLocally(contraTurn.text, state.transcript, state.claims)).updatedState;
    const contra2: TranscriptTurn = {
      id: "t-contra2",
      speaker: "candidate",
      text: "We completed it in two weeks.",
      timestamp: Date.now() + 3,
      isFinal: true
    };
    step = runModeratorStep(state, contra2, analyzeAnswerLocally(contra2.text, state.transcript, state.claims));
    speakers.add(step.decision.nextSpeaker);

    expect(speakers.has("product")).toBe(true);
    expect(speakers.has("behavioural")).toBe(true);
    expect(speakers.size).toBeGreaterThanOrEqual(2);
  });
});
