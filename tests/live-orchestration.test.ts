import { describe, expect, it } from "vitest";
import {
  createInitialState,
  analyzeAnswerLocally,
  runModeratorStep,
  generateFinalAssessment,
  initializeInterviewSession,
  extractJdSignals,
  generateOpeningQuestion,
  authorizeSpeaker,
  releaseFloor,
  LIVE_INTERVIEW_ANSWER_LIMIT
} from "../lib/orchestrator";
import { ModeratorDecision, TranscriptTurn } from "../lib/types";

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

  it("Acceptance Test 7: conversational fillers and greetings maintain difficulty and do not drop counters", () => {
    let state = createInitialState();
    expect(state.difficulty).toBe(3);

    const fillerTurn: TranscriptTurn = {
      id: "t-fill1",
      speaker: "candidate",
      text: "Yes, understood.",
      timestamp: Date.now(),
      isFinal: true
    };
    const analysis1 = analyzeAnswerLocally(fillerTurn.text, [], []);
    expect(analysis1.quality).toBe("vague");
    state = runModeratorStep(state, fillerTurn, analysis1).updatedState;
    expect(state.difficulty).toBe(3);
    expect(state.consecutiveWeakCount).toBe(0);

    const fillerTurn2: TranscriptTurn = {
      id: "t-fill2",
      speaker: "candidate",
      text: "Okay, got it.",
      timestamp: Date.now() + 1,
      isFinal: true
    };
    const analysis2 = analyzeAnswerLocally(fillerTurn2.text, [], []);
    state = runModeratorStep(state, fillerTurn2, analysis2).updatedState;
    expect(state.difficulty).toBe(3);
    expect(state.consecutiveWeakCount).toBe(0);
  });

  it("Acceptance Test 8 (Regression): creates ClaimGraph node linked to evidence for candidate Redis answers", () => {
    const testAnswers = [
      "We used Redis caching and reduced API latency by 40%.",
      "In our service we introduced caching to bring latency down by 35%.",
      "We deployed Redis cluster for session caching and saw a 50% drop in p95 latency."
    ];

    for (const answer of testAnswers) {
      const state = createInitialState();
      const turn: TranscriptTurn = {
        id: `turn-${Date.now()}`,
        speaker: "candidate",
        text: answer,
        timestamp: Date.now(),
        isFinal: true
      };

      const analysis = analyzeAnswerLocally(turn.text, state.transcript, state.claims);
      expect(analysis.claims.length).toBeGreaterThan(0);
      expect(analysis.claims[0].category).toBe("performance");
      expect(analysis.claims[0].technicalStatus).toBe("supported");
      expect(analysis.claims[0].productStatus).toBe("missing");
      expect(analysis.claims[0].evidence).toBe(answer);

      const { updatedState, decision } = runModeratorStep(state, turn, analysis);
      expect(updatedState.claims.length).toBeGreaterThan(0);
      const claimNode = updatedState.claims[0];
      expect(claimNode.evidence).toBe(answer);
      expect(claimNode.sourceTurnId).toBe(turn.id);
      expect(decision.nextSpeaker).toBe("product");
    }
  });
});

describe("Live client turn sequence (recorded repeated-question loop)", () => {
  // Mirrors components/LiveAgoraInterview.tsx: the candidate takes the floor,
  // /api/interview/analyze runs the Moderator, the question is authorized and
  // spoken, then the floor is released back to the candidate.
  function clientTurn(state: ReturnType<typeof createInitialState>, id: string, text: string) {
    const turn: TranscriptTurn = { id, speaker: "candidate", text, timestamp: Date.now(), isFinal: true };
    const candidateState = { ...state, activeSpeaker: "candidate" as const, floorLocked: false, transcript: [...state.transcript, turn] };
    const step = runModeratorStep(candidateState, turn, analyzeAnswerLocally(text, candidateState.transcript, candidateState.claims));
    // Without a suggested question the client speaks nothing and keeps the Moderator's state.
    if (!step.decision.suggestedQuestion) return { state: step.updatedState, decision: step.decision };
    const spoken = authorizeSpeaker(step.updatedState, step.decision.nextSpeaker, step.decision.suggestedQuestion);
    return { state: releaseFloor(spoken), decision: step.decision };
  }

  const freshState = () => initializeInterviewSession(
    createInitialState("live-replay", "Live Test Engineer", "Test Candidate", "Live Test Engineer", "Mid")
  ).updatedState;

  // Shape of the latest live session (10:24 UTC): 14 finalized candidate turns of
  // similar length, one mentioning failover and peak load. Text is synthetic.
  const latestSessionAnswers = [
    "I worked on a live testing tool for our team, I split the work into smaller pieces and checked each piece with the people who would use it.",
    "Yes, that is right.",
    "It made our releases smoother overall.",
    "I usually talk it through openly.",
    "I balanced it against the other requests from the team by asking which problem hurt people the most, then we agreed together on the order and explained what had to wait and why.",
    "I kept people updated whenever the plan changed and adjusted priorities.",
    "Could you repeat that please?",
    "I owned the plan from the start, wrote down the milestones and shared them with everyone, and when something changed I updated the plan the same day so nobody was surprised, which kept the team calm.",
    "At failover and peak load the system crashed, so we added retries with backoff and a queue to absorb the spikes until it stayed up.",
    "We tracked how many people used it each week and asked for feedback in our team meetings, and the feedback was good, although we did not set a formal target, so I would add one next time.",
    "I would probably start by asking the users what they need most and then build the smallest version that solves it and improve it step by step.",
    "I think that answers the question well enough.",
    "I tried to stay positive and focused on what we could control when the deadline moved.",
    "Thank you, I have nothing more to add."
  ];

  it("replays the latest session without repeating a question or emitting a contradiction placeholder", () => {
    let state = freshState();
    const decisions: ModeratorDecision[] = [];
    for (const [index, text] of latestSessionAnswers.entries()) {
      const result = clientTurn(state, `replay-${index}`, text);
      decisions.push(result.decision);
      state = result.state;
    }
    const questions = decisions.map(d => d.suggestedQuestion).filter((q): q is string => Boolean(q));
    expect(new Set(questions.map(q => q.toLowerCase())).size).toBe(questions.length);
    for (const question of questions) {
      expect(question).not.toMatch(/an earlier timeline|earlier timeline claim|^earlier you/i);
    }
    // Every answer before the closing advanced to a new, recorded question.
    const asked = decisions.filter(d => !d.closing);
    expect(asked).toHaveLength(LIVE_INTERVIEW_ANSWER_LIMIT - 1);
    for (const decision of asked) {
      expect(state.transcript.some(t => t.text === decision.suggestedQuestion)).toBe(true);
    }
  });

  it("covers the resume and GitHub/LinkedIn questions, then closes with the confirmation-email message", () => {
    let state = freshState();
    const decisions: ModeratorDecision[] = [];
    for (const [index, text] of latestSessionAnswers.slice(0, LIVE_INTERVIEW_ANSWER_LIMIT).entries()) {
      const result = clientTurn(state, `plan-${index}`, text);
      decisions.push(result.decision);
      state = result.state;
    }
    expect(decisions[1].suggestedQuestion).toMatch(/your resume/i);
    expect(decisions[3].suggestedQuestion).toMatch(/GitHub or LinkedIn/);
    const closing = decisions[LIVE_INTERVIEW_ANSWER_LIMIT - 1];
    expect(closing).toMatchObject({ closing: true, nextSpeaker: "moderator" });
    expect(closing.suggestedQuestion).toBe(
      "Thank you for your time today, Test Candidate. That completes your interview for the Live Test Engineer role. Please wait for a confirmation email from the hiring team with the next steps. You can end the interview now."
    );
    expect(state.interviewComplete).toBe(true);

    // Anything said after the closing is recorded, but nothing more is asked.
    const after = clientTurn(state, "plan-after", "Thank you, have a nice day.");
    expect(after.decision.closing).toBe(true);
    expect(after.decision.suggestedQuestion).toBeUndefined();
    expect(after.state.transcript.at(-1)?.speaker).toBe("candidate");
  });

  it("lets a supported timeline contradiction go before the resume question, which follows next", () => {
    let state = freshState();
    state = clientTurn(state, "plan-weeks-1", "The migration took three weeks across all of our services.").state;
    const contradiction = clientTurn(state, "plan-weeks-2", "We finished the whole migration in five weeks without downtime.");
    expect(contradiction.decision.reason).toBe("Timeline contradiction needs reconciliation");
    const resume = clientTurn(contradiction.state, "plan-weeks-3", "The three weeks were the rollout and five weeks included validation.");
    expect(resume.decision.suggestedQuestion).toMatch(/your resume/i);
  });

  it("changes interviewer appropriately across the replayed session", () => {
    let state = freshState();
    const speakers: string[] = [];
    for (const [index, text] of latestSessionAnswers.entries()) {
      const result = clientTurn(state, `replay-${index}`, text);
      if (!result.decision.closing) speakers.push(result.decision.nextSpeaker);
      state = result.state;
    }
    expect(new Set(speakers)).toEqual(new Set(["technical", "product", "behavioural"]));
    for (let i = 2; i < speakers.length; i++) {
      expect(speakers[i] === speakers[i - 1] && speakers[i] === speakers[i - 2]).toBe(false);
    }
  });

  it("closes the interview once every suitable question has been asked, then stops requesting questions", () => {
    // Without the live plan's answer limit, only running out of questions closes the interview.
    let state = createInitialState("live-exhaust", "Live Test Engineer", "Test Candidate", "Live Test Engineer", "Mid");
    const decisions: ModeratorDecision[] = [];
    for (let index = 0; index < 60 && !state.interviewComplete; index++) {
      const text = latestSessionAnswers[index % latestSessionAnswers.length];
      const result = clientTurn(state, `exhaust-${index}`, text);
      decisions.push(result.decision);
      state = result.state;
    }
    const closing = decisions[decisions.length - 1];
    expect(state.interviewComplete).toBe(true);
    expect(closing.closing).toBe(true);
    expect(closing.nextSpeaker).toBe("moderator");
    expect(closing.suggestedQuestion).toMatch(/^Thank you for your time today, Test Candidate\..*confirmation email/);
    expect(state.transcript.filter(t => t.text === closing.suggestedQuestion)).toHaveLength(1);
    // No question was repeated before closing, including one that differs only
    // in its "At difficulty N/5" prefix (heard twice in the 12:20 live test).
    const questions = decisions.slice(0, -1).map(d => d.suggestedQuestion ?? "");
    const withoutDifficulty = questions.map(q => q.replace(/^At difficulty \d+\/\d+ for [^:]+:\s*/, ""));
    expect(new Set(withoutDifficulty).size).toBe(questions.length);

    // Later answers are recorded, but nothing more is asked or spoken.
    const transcriptLength = state.transcript.length;
    for (let index = 0; index < 3; index++) {
      const after = clientTurn(state, `after-close-${index}`, "One more thing I wanted to mention about the project.");
      expect(after.decision.closing).toBe(true);
      expect(after.decision.suggestedQuestion).toBeUndefined();
      state = after.state;
    }
    expect(state.transcript).toHaveLength(transcriptLength + 3);
    expect(state.transcript.slice(transcriptLength).every(t => t.speaker === "candidate")).toBe(true);
  });

  it("asks a timeline-contradiction question only with stated durations as evidence", () => {
    let state = freshState();
    state = clientTurn(state, "weeks-1", "The migration took three weeks across all of our services.").state;
    const result = clientTurn(state, "weeks-2", "We finished the whole migration in five weeks without downtime.");
    expect(result.decision.nextSpeaker).toBe("behavioural");
    expect(result.decision.reason).toBe("Timeline contradiction needs reconciliation");
    expect(result.decision.suggestedQuestion).toBe(
      "Earlier you said it took three weeks, but you just described five weeks. Can you clarify the difference and who owned the timeline?"
    );
  });

  // Answers like the live test's: substantive, but with no technical keywords or business metrics.
  const answers = [
    "I approached it with the help of AI tools, broke the problem into smaller parts and tested each part carefully with my team before we shipped it.",
    "The outcome was that the team could ship faster and the people using it were happier, although we did not measure it precisely at the time.",
    "I would say the main impact was saving time for everyone involved, and we got good feedback from the stakeholders who used it every day.",
    "Looking back I learned to communicate earlier with the other teams and to write down the plan so everyone agreed on what we were building."
  ];

  it("asks a new question after every legitimate answer instead of repeating one", () => {
    let state = initializeInterviewSession(
      createInitialState("live-loop", "Live Test Engineer", "Test Candidate", "Live Test Engineer", "Mid")
    ).updatedState;
    const asked: string[] = [];
    for (const [index, text] of answers.entries()) {
      const result = clientTurn(state, `turn-${index}`, text);
      asked.push(result.decision.suggestedQuestion ?? "");
      state = result.state;
    }

    expect(new Set(asked).size).toBe(asked.length);
    // Every spoken question is recorded as its own interviewer turn.
    const interviewerTurns = state.transcript.filter(t => t.speaker !== "candidate" && t.speaker !== "moderator");
    expect(interviewerTurns).toHaveLength(1 + answers.length);
  });

  it("rotates the panel instead of routing every answer to the same interviewer", () => {
    let state = initializeInterviewSession(
      createInitialState("live-rotate", "Live Test Engineer", "Test Candidate", "Live Test Engineer", "Mid")
    ).updatedState;
    const speakers: string[] = [];
    for (const [index, text] of answers.entries()) {
      const result = clientTurn(state, `turn-${index}`, text);
      speakers.push(result.decision.nextSpeaker);
      state = result.state;
    }
    for (let i = 1; i < speakers.length; i++) expect(speakers[i]).not.toBe(speakers[i - 1]);
  });
});

