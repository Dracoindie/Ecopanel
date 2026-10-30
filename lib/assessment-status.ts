/**
 * What the HR report page says when an interview has no saved assessment.
 * Failure reasons come from a fixed list keyed by failure code; the job's raw
 * lastError (which may contain provider output) is never shown.
 */
export type AssessmentStatusTone = "amber" | "rose" | "slate";

export interface AssessmentStatusInput {
  hasTranscript: boolean;
  job: { status: string; failureCode: string | null } | null;
  provider: { providerConfigured: boolean };
}

export interface AssessmentStatusMessage {
  title: string;
  detail: string;
  tone: AssessmentStatusTone;
}

const SAFE_FAILURE_REASONS: Record<string, string> = {
  ASSESSMENT_PROVIDER_UNCONFIGURED: "the assessment provider is not configured",
  ASSESSMENT_PROVIDER_MISCONFIGURED: "the assessment provider is misconfigured (check the API key and model)",
  ASSESSMENT_PROVIDER_UNAVAILABLE: "the assessment provider was unavailable",
  ASSESSMENT_PROVIDER_EMPTY: "the assessment provider returned no result",
  ASSESSMENT_PROVIDER_INCOMPLETE: "the assessment provider returned an incomplete result",
  ASSESSMENT_OUTPUT_INVALID: "the generated assessment did not pass validation",
  ASSESSMENT_VALIDATION_FAILED: "the generated assessment did not pass validation",
  ASSESSMENT_INSUFFICIENT_EVIDENCE: "the transcript did not contain enough evidence",
  ASSESSMENT_EVIDENCE_MISSING: "the assessment cited evidence that could not be verified",
  ASSESSMENT_EVIDENCE_QUOTE_INVALID: "the assessment cited evidence that could not be verified",
  ASSESSMENT_EVIDENCE_TURN_INVALID: "the assessment cited evidence that could not be verified",
  ASSESSMENT_EVIDENCE_SPEAKER_INVALID: "the assessment cited evidence that could not be verified",
  ASSESSMENT_EVIDENCE_INCONSISTENT: "the assessment cited evidence that could not be verified",
  ASSESSMENT_WORKER_INTERRUPTED: "the assessment worker was interrupted",
  TRANSCRIPT_TOO_LONG: "the transcript is too long to assess"
};

export function safeAssessmentFailureReason(code: string | null) {
  return (code && SAFE_FAILURE_REASONS[code]) || "an unexpected error occurred";
}

/** The interview page's report link: always present, labelled with the report's state. */
export function reportLinkLabel(input: AssessmentStatusInput & { hasAssessment: boolean }) {
  return input.hasAssessment ? "Open report" : assessmentStatusMessage(input).title;
}

export function assessmentStatusMessage(input: AssessmentStatusInput): AssessmentStatusMessage {
  const { job } = input;
  if (job?.status === "Failed") {
    return {
      title: `Assessment failed: ${safeAssessmentFailureReason(job.failureCode)}`,
      detail: "No report was generated. You can retry the assessment from the interview page once the cause is fixed.",
      tone: "rose"
    };
  }
  if (!input.provider.providerConfigured && (!job || job.status !== "Completed")) {
    return {
      title: "Assessment provider not configured",
      detail: input.hasTranscript
        ? "The transcript is saved and an assessment is queued, but no AI provider is configured, so no report can be generated yet."
        : "No AI assessment provider is configured, and this interview has no saved transcript yet.",
      tone: "amber"
    };
  }
  if (job && (job.status === "Pending" || job.status === "Processing" || job.status === "Retrying")) {
    return {
      title: "Assessment pending",
      detail: "The transcript is saved and the assessment is queued. The report appears here once it has been generated.",
      tone: "amber"
    };
  }
  return {
    title: "No assessment yet",
    detail: input.hasTranscript
      ? "A transcript is saved, but no assessment has been requested for it."
      : "This interview has no saved transcript, so there is nothing to assess yet.",
    tone: "slate"
  };
}
