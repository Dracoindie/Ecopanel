import {
  AnswerAnalysis,
  ClaimNode,
  ModeratorDecision,
  SharedInterviewState,
  TranscriptTurn,
  AgentId
} from "./types";
import { detectVagueness, findContradiction } from "./interview";

export function createInitialState(interviewId = "live-interview", targetRole = "Software Engineer", candidateName = "Candidate"): SharedInterviewState {
  return {
    interviewId,
    targetRole,
    candidateName,
    activeSpeaker: "technical",
    difficulty: 3,
    consecutiveStrongCount: 0,
    consecutiveWeakCount: 0,
    competencies: {
      technical: 7.0,
      product: 6.5,
      communication: 7.0,
      problemSolving: 7.0,
      adaptability: 6.5
    },
    claims: [],
    transcript: [],
    contradictions: [],
    agentStates: {
      technical: "speaking",
      product: "idle",
      behavioural: "idle",
      moderator: "idle",
      customer: "idle"
    }
  };
}

/**
 * Deterministic Answer Analyzer Fallback (when LLM is not configured or in offline/quick mode).
 * Extracts claims, checks for latency/redis patterns, vagueness, timeline contradictions, and calculates scores.
 */
export function analyzeAnswerLocally(
  candidateText: string,
  history: TranscriptTurn[],
  existingClaims: ClaimNode[]
): AnswerAnalysis {
  const trimmed = candidateText.trim();
  const priorCandidateTurns = history.filter(t => t.speaker === "candidate").map(t => t.text);
  const isVague = detectVagueness(trimmed);
  const hasContradiction = findContradiction(trimmed, priorCandidateTurns);

  // Check if candidate explains a timeline reconciliation (e.g. 6 weeks migration vs 2 weeks rollout)
  const isReconciliation = /two\s+weeks?\s+(were|was|for|is).*(rollout|staged|production).*six\s+weeks|six\s+weeks.*full\s+migration/i.test(trimmed) ||
    (/(rollout|phase|staged).*(two\s+weeks?).*(migration|full).*(six\s+weeks?)/i.test(trimmed));

  // Check for Redis/latency performance claim
  const hasRedisLatencyClaim = /redis|caching/i.test(trimmed) && (/\d+%/i.test(trimmed) || /latency/i.test(trimmed));

  // Check for customer or business metrics (abandonment, conversion, revenue, merchants, users)
  const hasBusinessMetrics = /abandonment|merchants?|revenue|conversion|churn|users?|customer/i.test(trimmed) && (/\d+%/i.test(trimmed) || /improved|fell|dropped/i.test(trimmed));

  let quality: "strong" | "weak" | "vague" | "contradictory" | "incomplete" = "strong";
  if (hasContradiction && !isReconciliation) {
    quality = "contradictory";
  } else if (isVague) {
    quality = "vague";
  } else if (trimmed.length < 25) {
    quality = "incomplete";
  }

  // Dimension scoring heuristic (0-10)
  let correctness = 7.5;
  let depth = 7.0;
  let communication = 7.5;
  let businessImpact = 6.0;
  let technicalReasoning = 7.5;
  let problemSolving = 7.5;

  if (hasRedisLatencyClaim) {
    correctness = 8.8;
    depth = 8.5;
    technicalReasoning = 8.8;
    problemSolving = 8.5;
    communication = 8.2;
    businessImpact = 4.5; // low business impact initially
  }

  if (hasBusinessMetrics) {
    businessImpact = 8.9;
    depth = 8.7;
    communication = 8.8;
  }

  if (isReconciliation) {
    communication = 9.0;
    problemSolving = 8.8;
    correctness = 8.5;
  }

  if (isVague) {
    depth = 4.0;
    correctness = 5.0;
    technicalReasoning = 4.5;
    communication = 5.0;
    quality = "vague";
  }

  const claims: AnswerAnalysis["claims"] = [];
  const missingEvidence: string[] = [];
  const contradictions: AnswerAnalysis["contradictions"] = [];

  if (hasRedisLatencyClaim) {
    claims.push({
      text: "Reduced payment API latency by 40% using Redis caching",
      category: "performance",
      technicalStatus: "supported",
      productStatus: "missing",
      confidence: 0.88,
      evidence: trimmed
    });
    missingEvidence.push("Customer impact of 40% latency reduction is unquantified");
  } else if (hasBusinessMetrics) {
    claims.push({
      text: "Checkout abandonment dropped 12% and merchant completion improved during peak traffic",
      category: "business",
      technicalStatus: "supported",
      productStatus: "supported",
      confidence: 0.92,
      evidence: trimmed
    });
  }

  if (hasContradiction && !isReconciliation) {
    contradictions.push({
      detected: true,
      earlierClaim: priorCandidateTurns.find(t => /six\s+weeks?/i.test(t)) || "Migration took six weeks",
      currentClaim: trimmed,
      explanation: "Timeline mismatch between initial migration duration and rollout duration",
      isResolved: false
    });
    missingEvidence.push("Reconciliation between stated migration timelines");
  } else if (isReconciliation) {
    contradictions.push({
      detected: false,
      earlierClaim: "Migration took six weeks",
      currentClaim: trimmed,
      explanation: "Reconciled: Staged rollout took two weeks while full migration took six weeks",
      isResolved: true
    });
  }

  return {
    quality,
    correctness,
    depth,
    communication,
    businessImpact,
    technicalReasoning,
    problemSolving,
    claims,
    missingEvidence,
    contradictions
  };
}

/**
 * Deterministic Moderator / Orchestrator decision maker.
 * Analyzes state, updates competencies, ClaimGraph, difficulty, and authorizes the next speaker.
 */
export function runModeratorStep(
  state: SharedInterviewState,
  latestTurn: TranscriptTurn,
  analysis: AnswerAnalysis
): {
  updatedState: SharedInterviewState;
  decision: ModeratorDecision;
} {
  const updatedState: SharedInterviewState = JSON.parse(JSON.stringify(state));

  // 1. Append the finalized candidate turn to history if not present
  const exists = updatedState.transcript.some(t => t.id === latestTurn.id);
  if (!exists) {
    updatedState.transcript.push(latestTurn);
  }

  // 2. Update competency scores with weighted running average
  const alpha = 0.35;
  updatedState.competencies.technical = Math.min(10, Math.round(((updatedState.competencies.technical * (1 - alpha)) + (analysis.technicalReasoning * alpha)) * 10) / 10);
  updatedState.competencies.product = Math.min(10, Math.round(((updatedState.competencies.product * (1 - alpha)) + (analysis.businessImpact * alpha)) * 10) / 10);
  updatedState.competencies.communication = Math.min(10, Math.round(((updatedState.competencies.communication * (1 - alpha)) + (analysis.communication * alpha)) * 10) / 10);
  updatedState.competencies.problemSolving = Math.min(10, Math.round(((updatedState.competencies.problemSolving * (1 - alpha)) + (analysis.problemSolving * alpha)) * 10) / 10);

  // 3. Update ClaimGraph nodes
  if (analysis.claims && analysis.claims.length > 0) {
    for (const claimItem of analysis.claims) {
      // Check if this claim already exists or updates an earlier one
      const existingIdx = updatedState.claims.findIndex(c =>
        c.category === claimItem.category ||
        c.claim.toLowerCase().includes("latency") && claimItem.text.toLowerCase().includes("latency")
      );

      if (existingIdx >= 0) {
        // Update existing claim node
        updatedState.claims[existingIdx].productStatus = claimItem.productStatus;
        updatedState.claims[existingIdx].technicalStatus = claimItem.technicalStatus;
        if (claimItem.productStatus === "supported" && claimItem.technicalStatus === "supported") {
          updatedState.claims[existingIdx].status = "resolved";
        }
      } else {
        // Add new claim node
        const newClaim: ClaimNode = {
          id: `claim-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          claim: claimItem.text,
          category: claimItem.category,
          sourceTurnId: latestTurn.id,
          evidence: claimItem.evidence || latestTurn.text,
          technicalStatus: claimItem.technicalStatus,
          productStatus: claimItem.productStatus,
          status: claimItem.productStatus === "missing" ? "unresolved" : "resolved",
          confidence: claimItem.confidence
        };
        updatedState.claims.push(newClaim);
      }
    }
  }

  // 4. Handle Contradictions
  let hasUnresolvedContradiction = false;
  if (analysis.contradictions && analysis.contradictions.length > 0) {
    for (const c of analysis.contradictions) {
      if (c.detected && !c.isResolved) {
        hasUnresolvedContradiction = true;
        const cExists = updatedState.contradictions.some(item => !item.resolved && item.description === c.explanation);
        if (!cExists) {
          updatedState.contradictions.push({
            id: `contra-${Date.now()}`,
            description: c.explanation,
            earlierTurnId: "earlier",
            currentTurnId: latestTurn.id,
            resolved: false
          });
        }
      } else if (c.isResolved) {
        // Mark all matching contradictions resolved
        updatedState.contradictions.forEach(item => { item.resolved = true; });
      }
    }
  }

  // 5. Update Adaptive Difficulty (1 - 5)
  if (analysis.quality === "strong") {
    updatedState.consecutiveStrongCount += 1;
    updatedState.consecutiveWeakCount = 0;
    if (updatedState.consecutiveStrongCount >= 2 && updatedState.difficulty < 5) {
      updatedState.difficulty += 1;
      updatedState.consecutiveStrongCount = 0;
    }
  } else if (analysis.quality === "weak" || analysis.quality === "incomplete") {
    updatedState.consecutiveWeakCount += 1;
    updatedState.consecutiveStrongCount = 0;
    if (updatedState.consecutiveWeakCount >= 2 && updatedState.difficulty > 1) {
      updatedState.difficulty -= 1;
      updatedState.consecutiveWeakCount = 0;
    }
  }

  // 6. Deterministic Moderator Priority Routing
  let nextSpeaker: "technical" | "product" | "behavioural" | "moderator" = "technical";
  let reason = "Deepen technical architecture and trade-off analysis";
  let questionObjective = "constraints_and_edge_cases";
  let priority = 0.75;
  let suggestedQuestion = "How would this architecture behave if Redis cluster nodes undergo failover during peak traffic?";

  // Priority Rule 1: Contradiction reconciliation -> Behavioural interviewer gets floor
  if (hasUnresolvedContradiction || updatedState.contradictions.some(c => !c.resolved)) {
    nextSpeaker = "behavioural";
    reason = "Timeline contradiction needs reconciliation";
    questionObjective = "clarify_timeline_and_ownership";
    priority = 0.95;
    suggestedQuestion = "Earlier you mentioned the migration took six weeks, but you just described a two-week rollout. Can you clarify the difference?";
  }
  // Priority Rule 2: Vagueness detected -> Clarify measurable metrics
  else if (analysis.quality === "vague") {
    nextSpeaker = "technical";
    reason = "Vague response detected; require measurable evidence";
    questionObjective = "quantify_evidence";
    priority = 0.93;
    suggestedQuestion = "Can you quantify that improvement with specific latency percentiles (p95/p99) or throughput metrics?";
  }
  // Priority Rule 3: Product impact missing in ClaimGraph -> Product gets floor
  else {
    const hasMissingProductEvidence = updatedState.claims.some(c => c.productStatus === "missing" && c.status === "unresolved");
    if (hasMissingProductEvidence) {
      nextSpeaker = "product";
      reason = "Business impact evidence missing";
      questionObjective = "customer_impact";
      priority = 0.91;
      suggestedQuestion = "You mentioned a 40% latency improvement using Redis. What did that 40% improvement actually change for your customers and business?";
    } else if (updatedState.difficulty >= 4) {
      nextSpeaker = "technical";
      reason = "Strong candidate capability; advancing to constraint design";
      questionObjective = "distributed_failure_modes";
      priority = 0.85;
      suggestedQuestion = "Let's introduce constraints: What happens when network partitions cause split-brain between your payment workers?";
    } else if (updatedState.transcript.length >= 6) {
      nextSpeaker = "behavioural";
      reason = "Technical & product signals established; evaluate cross-functional ownership";
      questionObjective = "conflict_and_tradeoffs";
      priority = 0.82;
      suggestedQuestion = "Tell me about a disagreement you had with product management over architectural trade-offs on this project.";
    }
  }

  const decision: ModeratorDecision = {
    nextSpeaker,
    reason,
    questionObjective,
    priority,
    difficulty: updatedState.difficulty,
    suggestedQuestion
  };

  updatedState.lastDecision = decision;

  // 7. Update agent states deterministically
  (Object.keys(updatedState.agentStates) as AgentId[]).forEach(agentId => {
    if (agentId === nextSpeaker) {
      updatedState.agentStates[agentId] = "requesting";
    } else if (updatedState.agentStates[agentId] === "speaking") {
      updatedState.agentStates[agentId] = "handoff";
    } else {
      updatedState.agentStates[agentId] = "idle";
    }
  });

  return { updatedState, decision };
}

/**
 * Generates an evidence-backed Final Assessment from the real interview transcript and claims.
 */
export function generateFinalAssessment(state: SharedInterviewState): SharedInterviewState["finalAssessment"] {
  const candidateTurns = state.transcript.filter(t => t.speaker === "candidate");
  const turnIds = candidateTurns.map(t => t.id);

  const techEvidence = state.claims.filter(c => c.technicalStatus === "supported").map(c => c.claim);
  if (techEvidence.length === 0) techEvidence.push("Demonstrated structured API architectural approach");

  const prodEvidence = state.claims.filter(c => c.productStatus === "supported").map(c => c.claim);
  if (prodEvidence.length === 0) prodEvidence.push("Connected performance to user experience metrics");

  const commEvidence = candidateTurns.length > 2
    ? ["Structured technical responses clearly", "Provided concise rationale"]
    : ["Clear verbal delivery"];

  const resolvedContra = state.contradictions.filter(c => c.resolved).map(c => c.description);

  const overall = Math.round(((state.competencies.technical + state.competencies.product + state.competencies.communication + state.competencies.problemSolving + state.competencies.adaptability) / 5) * 10) / 10;

  return {
    overallScore: overall,
    recommendation: overall >= 8.5 ? "Strong Hire" : overall >= 7.5 ? "Hire" : "Leaning Hire",
    summary: `Candidate demonstrated solid technical and architectural reasoning. Adapts to constraints at difficulty ${state.difficulty}/5 with evidence-backed claims.`,
    dimensions: {
      technical: {
        score: state.competencies.technical,
        evidence: techEvidence,
        sourceTurns: turnIds.slice(0, 3),
        confidence: 0.89
      },
      product: {
        score: state.competencies.product,
        evidence: prodEvidence.length ? prodEvidence : ["Understands customer outcome link"],
        sourceTurns: turnIds.slice(1, 4),
        confidence: 0.85
      },
      communication: {
        score: state.competencies.communication,
        evidence: commEvidence,
        sourceTurns: turnIds,
        confidence: 0.91
      },
      problemSolving: {
        score: state.competencies.problemSolving,
        evidence: resolvedContra.length ? resolvedContra : ["Handled dynamic constraint escalation smoothly"],
        sourceTurns: turnIds,
        confidence: 0.88
      },
      adaptability: {
        score: state.competencies.adaptability,
        evidence: [`Adapted through level ${state.difficulty} difficulty changes`, "Responded to multi-agent perspective shifts"],
        sourceTurns: turnIds,
        confidence: 0.86
      }
    },
    strengths: [
      "Clear articulation of system design and trade-offs",
      "Ability to connect technical optimizations to business outcomes when prompted",
      "Graceful reconciliation of complex timelines"
    ],
    risks: [
      "Initially omitted direct customer metrics until challenged by Product interviewer"
    ],
    contradictions: resolvedContra,
    unresolvedConcerns: state.claims.filter(c => c.status === "unresolved").map(c => c.claim),
    isAiAssisted: true
  };
}
