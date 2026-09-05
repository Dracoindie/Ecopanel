import { describe, expect, it } from "vitest";
import {
  createInitialState,
  analyzeAnswerLocally,
  runModeratorStep,
  generateFinalAssessment
} from "../lib/orchestrator";
import { TranscriptTurn } from "../lib/types";

describe("Live Orchestration & Multi-Agent Engine", () => {
  it("initializes shared state with single authorized speaker and baseline difficulty", () => {
    const state = createInitialState("session-1", "Backend Engineer", "Alex");
    expect(state.activeSpeaker).toBe("technical");
    expect(state.difficulty).toBe(3);
    expect(state.agentStates.technical).toBe("speaking");
    expect(state.agentStates.product).toBe("idle");
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

    // Conflicting turn
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

    // Reconciliation turn
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

  it("Acceptance Test 3: increases difficulty after consecutive strong answers", () => {
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

    // Difficulty should now adapt up to 4
    expect(state.difficulty).toBe(4);
  });

  it("Acceptance Test 4: detects vagueness and demands quantified evidence", () => {
    const state = createInitialState();
    const candidateTurn: TranscriptTurn = {
      id: "turn-vague",
      speaker: "candidate",
      text: "We improved performance significantly and users liked it.",
      timestamp: Date.now(),
      isFinal: true
    };

    const analysis = analyzeAnswerLocally(candidateTurn.text, [], []);
    expect(analysis.quality).toBe("vague");

    const { decision } = runModeratorStep(state, candidateTurn, analysis);
    expect(decision.nextSpeaker).toBe("technical");
    expect(decision.reason).toContain("Vague response detected");
    expect(decision.questionObjective).toBe("quantify_evidence");
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
});
