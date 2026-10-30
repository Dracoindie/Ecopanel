import { describe, expect, it } from "vitest";
import { assessmentStatusMessage, reportLinkLabel, safeAssessmentFailureReason } from "../lib/assessment-status";

const configured = { providerConfigured: true };
const unconfigured = { providerConfigured: false };

describe("HR report status when no assessment exists", () => {
  it("says the provider is not configured when a job is queued without one (tonight's journey)", () => {
    const status = assessmentStatusMessage({ hasTranscript: true, job: { status: "Pending", failureCode: null }, provider: unconfigured });
    expect(status.title).toBe("Assessment provider not configured");
    expect(status.detail).toMatch(/transcript is saved/);
  });

  it.each(["Pending", "Processing", "Retrying"])("says pending while the job is %s and a provider is configured", status => {
    expect(assessmentStatusMessage({ hasTranscript: true, job: { status, failureCode: null }, provider: configured }).title).toBe("Assessment pending");
  });

  it("names a safe failure reason and never echoes raw error text", () => {
    const status = assessmentStatusMessage({
      hasTranscript: true,
      job: { status: "Failed", failureCode: "ASSESSMENT_PROVIDER_UNAVAILABLE" },
      provider: configured
    });
    expect(status.title).toBe("Assessment failed: the assessment provider was unavailable");
    expect(status.tone).toBe("rose");
  });

  it("falls back to a generic reason for unknown failure codes", () => {
    expect(safeAssessmentFailureReason("SOMETHING_NEW")).toBe("an unexpected error occurred");
    expect(safeAssessmentFailureReason(null)).toBe("an unexpected error occurred");
  });

  it("reports a failure even when the provider is unconfigured", () => {
    const status = assessmentStatusMessage({ hasTranscript: true, job: { status: "Failed", failureCode: "ASSESSMENT_PROVIDER_UNCONFIGURED" }, provider: unconfigured });
    expect(status.title).toBe("Assessment failed: the assessment provider is not configured");
  });

  it("explains when there is nothing to assess yet", () => {
    expect(assessmentStatusMessage({ hasTranscript: false, job: null, provider: configured }).title).toBe("No assessment yet");
  });
});

// 2026-10-30: the interview page's report link must always exist and say where the report stands.
describe("Interview page report link label", () => {
  it("opens the report once an assessment exists", () => {
    expect(reportLinkLabel({ hasAssessment: true, hasTranscript: true, job: { status: "Completed", failureCode: null }, provider: configured })).toBe("Open report");
  });

  it("says pending while the job is queued or running", () => {
    for (const status of ["Pending", "Processing", "Retrying"]) {
      expect(reportLinkLabel({ hasAssessment: false, hasTranscript: true, job: { status, failureCode: null }, provider: configured })).toBe("Assessment pending");
    }
  });

  it("names the safe failure reason, never the raw error", () => {
    expect(reportLinkLabel({ hasAssessment: false, hasTranscript: true, job: { status: "Failed", failureCode: "ASSESSMENT_OUTPUT_INVALID" }, provider: configured }))
      .toBe("Assessment failed: the generated assessment did not pass validation");
  });

  it("still gives a label when there is no transcript or job", () => {
    expect(reportLinkLabel({ hasAssessment: false, hasTranscript: false, job: null, provider: configured })).toBe("No assessment yet");
  });
});
