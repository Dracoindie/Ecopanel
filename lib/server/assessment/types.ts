export const ASSESSMENT_DIMENSION_KEYS = [
  "technical",
  "product",
  "communication",
  "problemSolving",
  "adaptability"
] as const;

export type AssessmentDimensionKey = (typeof ASSESSMENT_DIMENSION_KEYS)[number];
export type AssessmentProviderName = "openai" | "groq";
export type AssessmentProviderMode = "disabled" | "live";
export type AssessmentJobStatus = "Pending" | "Retrying" | "Processing" | "Completed" | "Failed" | "Cancelled";

export interface AssessmentProviderStatus {
  provider: string;
  providerConfigured: boolean;
  providerMode: AssessmentProviderMode;
  model: string | null;
  status: string;
  configurationIssue: string | null;
}

export interface StoredTranscriptTurn {
  id: string;
  speaker: "candidate" | "interviewer";
  originalSpeaker: string;
  text: string;
  timestamp: number;
}

export interface AssessmentEvidence {
  turnId: string;
  quote: string;
}

export interface AssessmentDimension {
  score: number | null;
  confidence: number;
  evidence: string[];
  sourceTurns: string[];
  evidenceItems: AssessmentEvidence[];
  rationale: string;
  insufficientEvidence: boolean;
}

export interface ValidatedAssessment {
  summary: string;
  dimensions: Record<AssessmentDimensionKey, AssessmentDimension>;
  strengths: string[];
  risks: string[];
  unresolvedConcerns: string[];
  overallScore: number;
  recommendation: "Strong Hire" | "Hire" | "Leaning Hire" | "Needs Review";
}

export interface AssessmentGenerationInput {
  jobId: string;
  interviewId: string;
  organizationId: string;
  jobTitle: string;
  jobDescription: string;
  interviewRound: string;
  transcriptVersion: number;
  turns: StoredTranscriptTurn[];
}

export type AssessmentProviderResult =
  | {
      outcome: "completed";
      output: unknown;
      provider: string;
      model: string;
    }
  | {
      outcome: "retryable";
      code: string;
      message: string;
      retryAfterMs?: number;
    }
  | {
      outcome: "permanent";
      code: string;
      message: string;
    };

export interface AssessmentProvider {
  name: string;
  mode: "live";
  model: string;
  generate(input: AssessmentGenerationInput): Promise<AssessmentProviderResult>;
}

export class AssessmentValidationError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "AssessmentValidationError";
  }
}

export class AssessmentServiceError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "AssessmentServiceError";
  }
}
