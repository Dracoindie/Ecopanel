import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveHrAssessment } from "@/lib/server/recruitment/hr-interviews";
import type { HrContext } from "@/lib/server/session";

const mockAssessmentCreate = vi.fn();

vi.mock("@/lib/server/db", () => ({
  getPrisma: () => ({
    interview: {
      findFirst: vi.fn(async () => ({ id: "int-1", applicationId: "app-1", organizationId: "org-1", status: "Completed" }))
    },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        assessment: { create: mockAssessmentCreate },
        applicationEvent: { create: vi.fn(async () => ({})) }
      })
  })
}));

const context = {
  user: { id: "user-1", name: "Recruiter", email: "r@example.test" },
  organization: { id: "org-1", name: "Org", slug: "org" },
  role: "ADMIN",
  sessionId: "s-1"
} as HrContext;

function dimension(score: unknown, confidence: unknown = 0.8) {
  return { score, confidence, evidence: ["  Explained trade-offs.  ", 42, ""], sourceTurns: ["turn-1"] };
}

function payload(dimensions: Record<string, unknown>) {
  return {
    overallScore: 8,
    recommendation: "Hire",
    summary: "A sufficiently detailed assessment summary for validation.",
    dimensions,
    strengths: [],
    risks: [],
    unresolvedConcerns: []
  };
}

const validDimensions = {
  technical: dimension(8.5, 0.86),
  product: dimension("8.1"),
  communication: dimension(8.7, 0.9),
  problemSolving: dimension(0, 0),
  adaptability: dimension(10, 1)
};

describe("saveHrAssessment dimension persistence", () => {
  beforeEach(() => {
    mockAssessmentCreate.mockReset();
    mockAssessmentCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: "asm-1",
      generatedAt: new Date("2026-10-27T00:00:00.000Z"),
      provider: null,
      model: null,
      rubricVersion: null,
      promptVersion: null,
      transcriptId: null,
      transcriptVersion: null,
      reviewStatus: "PENDING",
      reviewedAt: null,
      reviewNote: null
    }));
  });

  it("persists normalized, JSON-safe dimensions", async () => {
    const result = await saveHrAssessment(context, "int-1", payload(validDimensions));
    const stored = mockAssessmentCreate.mock.calls[0][0].data.dimensions;

    expect(stored.technical).toEqual({
      score: 8.5,
      evidence: ["Explained trade-offs."],
      sourceTurns: ["turn-1"],
      evidenceItems: [],
      rationale: "",
      insufficientEvidence: false,
      confidence: 0.86
    });
    expect(stored.product.score).toBe(8.1);
    expect(Object.keys(stored)).toEqual(["technical", "product", "communication", "problemSolving", "adaptability"]);
    expect(JSON.parse(JSON.stringify(stored))).toEqual(stored);
    expect(result.dimensions).toEqual(stored);
  });

  it.each([
    ["NaN score", dimension("not-a-number")],
    ["infinite score", dimension(Infinity)],
    ["out-of-range score", dimension(11)],
    ["missing confidence", { score: 8, evidence: [], sourceTurns: [] }],
    ["infinite confidence", dimension(8, -Infinity)]
  ])("rejects a %s before writing", async (_label, bad) => {
    await expect(saveHrAssessment(context, "int-1", payload({ ...validDimensions, technical: bad })))
      .rejects.toMatchObject({ status: 400, code: "INVALID_ASSESSMENT" });
    expect(mockAssessmentCreate).not.toHaveBeenCalled();
  });
});
