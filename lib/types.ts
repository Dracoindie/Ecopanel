import { z } from "zod";

export type AgentId = "technical" | "product" | "behavioural" | "moderator" | "customer";
export type SpeakerId = "candidate" | AgentId;

export type AgentStatus = "listening" | "thinking" | "requesting" | "speaking" | "handoff" | "idle";

export interface TranscriptTurn {
  id: string;
  speaker: SpeakerId;
  text: string;
  timestamp: number;
  isFinal: boolean;
  rawTurnId?: number;
}

export type ClaimCategory = "performance" | "architecture" | "scalability" | "business" | "timeline" | "general";
export type VerificationStatus = "supported" | "missing" | "unverified" | "pending" | "contradictory";

export interface ClaimNode {
  id: string;
  claim: string;
  category: ClaimCategory;
  sourceTurnId: string;
  evidence: string;
  technicalStatus: "supported" | "unverified" | "contradictory";
  productStatus: "supported" | "missing" | "unverified";
  behaviouralStatus?: "supported" | "pending" | "contradictory";
  status: "unresolved" | "resolved";
  confidence: number;
}

export const AnswerAnalysisSchema = z.object({
  quality: z.enum(["strong", "weak", "vague", "contradictory", "incomplete"]),
  correctness: z.number().min(0).max(10),
  depth: z.number().min(0).max(10),
  communication: z.number().min(0).max(10),
  businessImpact: z.number().min(0).max(10),
  technicalReasoning: z.number().min(0).max(10),
  problemSolving: z.number().min(0).max(10),
  claims: z.array(
    z.object({
      text: z.string(),
      category: z.enum(["performance", "architecture", "scalability", "business", "timeline", "general"]).default("general"),
      technicalStatus: z.enum(["supported", "unverified", "contradictory"]).default("supported"),
      productStatus: z.enum(["supported", "missing", "unverified"]).default("missing"),
      confidence: z.number().min(0).max(1).default(0.85),
      evidence: z.string().default("")
    })
  ).default([]),
  missingEvidence: z.array(z.string()).default([]),
  contradictions: z.array(
    z.object({
      detected: z.boolean(),
      earlierClaim: z.string(),
      currentClaim: z.string(),
      explanation: z.string(),
      isResolved: z.boolean().default(false)
    })
  ).default([])
});

export type AnswerAnalysis = z.infer<typeof AnswerAnalysisSchema>;

export interface ModeratorDecision {
  nextSpeaker: "technical" | "product" | "behavioural" | "moderator";
  reason: string;
  questionObjective: string;
  priority: number;
  difficulty: number;
  suggestedQuestion?: string;
}

export interface CompetencyState {
  technical: number;
  product: number;
  communication: number;
  problemSolving: number;
  adaptability: number;
}

export interface InterviewDimensionEvidence {
  score: number;
  evidence: string[];
  sourceTurns: string[];
  confidence: number;
}

export interface FinalAssessment {
  overallScore: number;
  recommendation: "Strong Hire" | "Hire" | "Leaning Hire" | "Needs Review";
  summary: string;
  dimensions: {
    technical: InterviewDimensionEvidence;
    product: InterviewDimensionEvidence;
    communication: InterviewDimensionEvidence;
    problemSolving: InterviewDimensionEvidence;
    adaptability: InterviewDimensionEvidence;
  };
  strengths: string[];
  risks: string[];
  contradictions: string[];
  unresolvedConcerns: string[];
  isAiAssisted: true;
}

export interface SharedInterviewState {
  interviewId: string;
  targetRole: string;
  candidateName: string;
  activeSpeaker: SpeakerId;
  difficulty: number;
  consecutiveStrongCount: number;
  consecutiveWeakCount: number;
  competencies: CompetencyState;
  claims: ClaimNode[];
  transcript: TranscriptTurn[];
  contradictions: Array<{
    id: string;
    description: string;
    earlierTurnId: string;
    currentTurnId: string;
    resolved: boolean;
  }>;
  agentStates: Record<AgentId, AgentStatus>;
  lastDecision?: ModeratorDecision;
  finalAssessment?: FinalAssessment;
}
