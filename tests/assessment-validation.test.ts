import { describe, expect, it } from "vitest";
import { validateAssessmentOutput } from "../lib/server/assessment/validation";
import type { StoredTranscriptTurn } from "../lib/server/assessment/types";

const turns: StoredTranscriptTurn[] = [
  { id: "t-1", speaker: "interviewer", originalSpeaker: "technical", text: "How would you keep payments reliable?", timestamp: 1 },
  { id: "t-2", speaker: "candidate", originalSpeaker: "candidate", text: "I would use idempotency keys and a queue-backed workflow.", timestamp: 2 },
  { id: "t-3", speaker: "candidate", originalSpeaker: "candidate", text: "Checkout abandonment fell 12% for our merchants.", timestamp: 3 }
];

function dimension(evidence: Array<{ turnId: string; quote: string }>, score = 8) {
  return { score, confidence: 0.8, insufficientEvidence: false, rationale: "Grounded in the transcript.", evidence };
}

function output(overrides: Record<string, unknown> = {}) {
  return {
    summary: "The candidate gave specific, evidence-backed answers about reliability.",
    dimensions: {
      technical: dimension([{ turnId: "t-2", quote: "idempotency keys" }], 8.46),
      product: dimension([{ turnId: "t-3", quote: "Checkout abandonment fell 12%" }]),
      communication: dimension([{ turnId: "t-2", quote: "queue-backed workflow" }]),
      problemSolving: dimension([{ turnId: "t-2", quote: "I would use idempotency keys" }]),
      adaptability: { score: 0, confidence: 0.2, insufficientEvidence: true, rationale: "Not tested in this round.", evidence: [] },
      ...overrides
    },
    strengths: ["Specific metrics"],
    risks: [],
    unresolvedConcerns: []
  };
}

describe("assessment provider output validation", () => {
  it("keeps only evidence quoted from candidate turns and rounds scores", () => {
    const result = validateAssessmentOutput(output(), turns);

    expect(result.dimensions.technical).toMatchObject({ score: 8.5, sourceTurns: ["t-2"], evidenceItems: [{ turnId: "t-2", quote: "idempotency keys" }] });
    expect(result.dimensions.adaptability).toMatchObject({ score: null, insufficientEvidence: true, evidence: [] });
    expect(result.overallScore).toBe(8.1);
    expect(result.recommendation).toBe("Hire");
  });

  it.each([
    ["a quote that is not in the transcript", { technical: dimension([{ turnId: "t-2", quote: "led a team of fifty" }]) }, "ASSESSMENT_EVIDENCE_QUOTE_INVALID"],
    ["an interviewer turn as candidate evidence", { technical: dimension([{ turnId: "t-1", quote: "keep payments reliable" }]) }, "ASSESSMENT_EVIDENCE_SPEAKER_INVALID"],
    ["a turn id that does not exist", { technical: dimension([{ turnId: "t-99", quote: "idempotency keys" }]) }, "ASSESSMENT_EVIDENCE_TURN_INVALID"],
    ["a scored dimension without evidence", { technical: dimension([]) }, "ASSESSMENT_EVIDENCE_MISSING"],
    ["an out-of-range score", { technical: dimension([{ turnId: "t-2", quote: "idempotency keys" }], 11) }, "ASSESSMENT_OUTPUT_INVALID"]
  ])("rejects %s", (_label, overrides, code) => {
    expect(() => validateAssessmentOutput(output(overrides), turns)).toThrow(expect.objectContaining({ code }));
  });

  it("rejects unexpected fields from the provider", () => {
    expect(() => validateAssessmentOutput({ ...output(), hireDecision: "yes" }, turns))
      .toThrow(expect.objectContaining({ code: "ASSESSMENT_OUTPUT_INVALID" }));
  });

  it("refuses an assessment where every competency lacks evidence", () => {
    const none = { score: 0, confidence: 0.1, insufficientEvidence: true, rationale: "No evidence.", evidence: [] };
    const all = { technical: none, product: none, communication: none, problemSolving: none, adaptability: none };
    expect(() => validateAssessmentOutput(output(all), turns)).toThrow(expect.objectContaining({ code: "ASSESSMENT_INSUFFICIENT_EVIDENCE" }));
  });
});
