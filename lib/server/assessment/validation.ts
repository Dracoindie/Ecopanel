import { z } from "zod";
import {
  ASSESSMENT_DIMENSION_KEYS,
  AssessmentValidationError,
  type AssessmentDimension,
  type AssessmentDimensionKey,
  type StoredTranscriptTurn,
  type ValidatedAssessment
} from "@/lib/server/assessment/types";

const EvidenceSchema = z.object({
  turnId: z.string().trim().min(1).max(120),
  quote: z.string().trim().min(3).max(600)
}).strict();

const DimensionSchema = z.object({
  score: z.number().min(0).max(10),
  confidence: z.number().min(0).max(1),
  insufficientEvidence: z.boolean(),
  rationale: z.string().trim().min(1).max(1_200),
  evidence: z.array(EvidenceSchema).max(6)
}).strict();

export const AssessmentOutputSchema = z.object({
  summary: z.string().trim().min(20).max(5_000),
  dimensions: z.object({
    technical: DimensionSchema,
    product: DimensionSchema,
    communication: DimensionSchema,
    problemSolving: DimensionSchema,
    adaptability: DimensionSchema
  }).strict(),
  strengths: z.array(z.string().trim().min(1).max(500)).max(8),
  risks: z.array(z.string().trim().min(1).max(500)).max(8),
  unresolvedConcerns: z.array(z.string().trim().min(1).max(500)).max(8)
}).strict();

export type AssessmentOutput = z.infer<typeof AssessmentOutputSchema>;

function dimensionJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["score", "confidence", "insufficientEvidence", "rationale", "evidence"],
    properties: {
      score: { type: "number", minimum: 0, maximum: 10 },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      insufficientEvidence: { type: "boolean" },
      rationale: { type: "string", minLength: 1, maxLength: 1_200 },
      evidence: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["turnId", "quote"],
          properties: {
            turnId: { type: "string", minLength: 1, maxLength: 120 },
            quote: { type: "string", minLength: 3, maxLength: 600 }
          }
        }
      }
    }
  };
}

export function assessmentOutputJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "dimensions", "strengths", "risks", "unresolvedConcerns"],
    properties: {
      summary: { type: "string", minLength: 20, maxLength: 5_000 },
      dimensions: {
        type: "object",
        additionalProperties: false,
        required: [...ASSESSMENT_DIMENSION_KEYS],
        properties: Object.fromEntries(
          ASSESSMENT_DIMENSION_KEYS.map(key => [key, dimensionJsonSchema()])
        )
      },
      strengths: {
        type: "array",
        maxItems: 8,
        items: { type: "string", minLength: 1, maxLength: 500 }
      },
      risks: {
        type: "array",
        maxItems: 8,
        items: { type: "string", minLength: 1, maxLength: 500 }
      },
      unresolvedConcerns: {
        type: "array",
        maxItems: 8,
        items: { type: "string", minLength: 1, maxLength: 500 }
      }
    }
  };
}

export function normalizeEvidenceText(value: string) {
  return value.replace(/\r\n?/g, "\n").trim();
}

function cleanList(items: string[]) {
  return Array.from(new Set(items.map(item => item.trim()).filter(Boolean))).slice(0, 8);
}

function validateDimension(
  key: AssessmentDimensionKey,
  raw: AssessmentOutput["dimensions"][AssessmentDimensionKey],
  turnsById: Map<string, StoredTranscriptTurn>
): AssessmentDimension {
  const rationale = raw.rationale.trim();
  if (raw.insufficientEvidence) {
    if (raw.evidence.length > 0) {
      throw new AssessmentValidationError(
        `Dimension ${key} marked insufficient evidence but still cited evidence.`,
        "ASSESSMENT_EVIDENCE_INCONSISTENT"
      );
    }
    return {
      score: null,
      confidence: raw.confidence,
      evidence: [],
      sourceTurns: [],
      evidenceItems: [],
      rationale,
      insufficientEvidence: true
    };
  }

  if (raw.evidence.length === 0) {
    throw new AssessmentValidationError(
      `Dimension ${key} has no verified evidence and was not marked insufficient.`,
      "ASSESSMENT_EVIDENCE_MISSING"
    );
  }

  const evidenceItems: AssessmentDimension["evidenceItems"] = [];
  const seen = new Set<string>();
  for (const item of raw.evidence) {
    const turn = turnsById.get(item.turnId);
    if (!turn) {
      throw new AssessmentValidationError(
        `Dimension ${key} cites a transcript turn that does not exist.`,
        "ASSESSMENT_EVIDENCE_TURN_INVALID"
      );
    }
    if (turn.speaker !== "candidate") {
      throw new AssessmentValidationError(
        `Dimension ${key} cites an interviewer turn as candidate evidence.`,
        "ASSESSMENT_EVIDENCE_SPEAKER_INVALID"
      );
    }
    const quote = normalizeEvidenceText(item.quote);
    const turnText = normalizeEvidenceText(turn.text);
    if (!quote || !turnText.includes(quote)) {
      throw new AssessmentValidationError(
        `Dimension ${key} cites a quote that is not an exact transcript substring.`,
        "ASSESSMENT_EVIDENCE_QUOTE_INVALID"
      );
    }
    const dedupeKey = `${turn.id}:${quote}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    evidenceItems.push({ turnId: turn.id, quote });
  }

  if (!evidenceItems.length) {
    throw new AssessmentValidationError(
      `Dimension ${key} has no usable evidence after validation.`,
      "ASSESSMENT_EVIDENCE_MISSING"
    );
  }

  return {
    score: Math.round(raw.score * 10) / 10,
    confidence: Math.round(raw.confidence * 100) / 100,
    evidence: evidenceItems.map(item => item.quote),
    sourceTurns: Array.from(new Set(evidenceItems.map(item => item.turnId))),
    evidenceItems,
    rationale,
    insufficientEvidence: false
  };
}

export function validateAssessmentOutput(
  raw: unknown,
  turns: StoredTranscriptTurn[]
): ValidatedAssessment {
  const parsed = AssessmentOutputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AssessmentValidationError(
      "The provider response did not match the assessment schema.",
      "ASSESSMENT_OUTPUT_INVALID"
    );
  }

  const turnsById = new Map(turns.map(turn => [turn.id, turn]));
  const dimensions = Object.fromEntries(
    ASSESSMENT_DIMENSION_KEYS.map(key => [
      key,
      validateDimension(key, parsed.data.dimensions[key], turnsById)
    ])
  ) as Record<AssessmentDimensionKey, AssessmentDimension>;

  const scored = ASSESSMENT_DIMENSION_KEYS
    .map(key => dimensions[key].score)
    .filter((score): score is number => score !== null);

  if (!scored.length) {
    throw new AssessmentValidationError(
      "The provider found insufficient evidence for every competency.",
      "ASSESSMENT_INSUFFICIENT_EVIDENCE"
    );
  }

  const overallScore = Math.round((scored.reduce((sum, score) => sum + score, 0) / scored.length) * 10) / 10;
  const recommendation: ValidatedAssessment["recommendation"] =
    scored.length < 3
      ? "Needs Review"
      : overallScore >= 8.5
        ? "Strong Hire"
        : overallScore >= 7.5
          ? "Hire"
          : overallScore >= 6
            ? "Leaning Hire"
            : "Needs Review";

  return {
    summary: parsed.data.summary.trim(),
    dimensions,
    strengths: cleanList(parsed.data.strengths),
    risks: cleanList(parsed.data.risks),
    unresolvedConcerns: cleanList(parsed.data.unresolvedConcerns),
    overallScore,
    recommendation
  };
}
