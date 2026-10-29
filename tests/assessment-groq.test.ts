import { afterEach, describe, expect, it, vi } from "vitest";
import { getAssessmentConfig, getAssessmentProviderStatus, GROQ_DEFAULT_MODEL } from "../lib/server/assessment/config";
import { createGroqAssessmentProviderForTest, getAssessmentProvider } from "../lib/server/assessment/provider";
import type { AssessmentGenerationInput, StoredTranscriptTurn } from "../lib/server/assessment/types";

// Mocked provider only: no request ever reaches Groq.
const turns: StoredTranscriptTurn[] = [
  { id: "t-1", speaker: "interviewer", originalSpeaker: "technical", text: "How would you keep payments reliable?", timestamp: 1 },
  { id: "t-2", speaker: "candidate", originalSpeaker: "candidate", text: "I would use idempotency keys and a queue-backed workflow.", timestamp: 2 },
  { id: "t-3", speaker: "candidate", originalSpeaker: "candidate", text: "Checkout abandonment fell 12% for our merchants.", timestamp: 3 }
];

const input: AssessmentGenerationInput = {
  jobId: "job-1",
  interviewId: "int-1",
  organizationId: "org-1",
  jobTitle: "Backend Engineer",
  jobDescription: "Payments reliability.",
  interviewRound: "Technical",
  transcriptVersion: 1,
  turns
};

function dimension(evidence: Array<{ turnId: string; quote: string }>, score = 8) {
  return { score, confidence: 0.8, insufficientEvidence: false, rationale: "Grounded in the transcript.", evidence };
}

function output(quote = "idempotency keys") {
  return {
    summary: "Specific, evidence-backed answers about reliability.",
    dimensions: {
      technical: dimension([{ turnId: "t-2", quote }]),
      product: dimension([{ turnId: "t-3", quote: "Checkout abandonment fell 12%" }]),
      communication: dimension([{ turnId: "t-2", quote: "queue-backed workflow" }]),
      problemSolving: dimension([{ turnId: "t-2", quote: "I would use idempotency keys" }]),
      adaptability: { score: 0, confidence: 0.2, insufficientEvidence: true, rationale: "Not tested.", evidence: [] }
    },
    strengths: ["Specific metrics"],
    risks: [],
    unresolvedConcerns: []
  };
}

const completion = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }));

function mockFetch(...responses: Response[]) {
  const fetcher = vi.fn(async () => responses.shift() ?? new Response("{}", { status: 500 }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

const provider = () => createGroqAssessmentProviderForTest({ apiKey: "gsk_test", model: "llama-test", baseUrl: "https://groq.test/openai/v1" });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("groq assessment provider config", () => {
  it("is selected by ASSESSMENT_PROVIDER=groq with the Groq base URL and a default Llama model", () => {
    vi.stubEnv("ASSESSMENT_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("GROQ_ASSESSMENT_MODEL", "");
    const config = getAssessmentConfig();
    expect(config).toMatchObject({ provider: "groq", configured: true, model: GROQ_DEFAULT_MODEL, baseUrl: "https://api.groq.com/openai/v1" });
    expect(getAssessmentProvider()?.name).toBe("groq");
    expect(getAssessmentProviderStatus().provider).toBe("Groq");
  });

  it("reports a missing key", () => {
    vi.stubEnv("ASSESSMENT_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "");
    expect(getAssessmentConfig()).toMatchObject({ configured: false, configurationIssue: "GROQ_API_KEY is not configured." });
  });

  it("keeps the OpenAI path working", () => {
    vi.stubEnv("ASSESSMENT_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk_test");
    vi.stubEnv("OPENAI_ASSESSMENT_MODEL", "gpt-test");
    expect(getAssessmentConfig()).toMatchObject({ provider: "openai", configured: true, baseUrl: "https://api.openai.com/v1" });
    expect(getAssessmentProvider()?.name).toBe("openai");
  });
});

describe("groq assessment provider", () => {
  it("calls chat completions in JSON mode and returns validated output", async () => {
    const fetcher = mockFetch(completion(JSON.stringify(output())));
    const result = await provider().generate(input);
    expect(result).toMatchObject({ outcome: "completed", provider: "groq", model: "llama-test" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://groq.test/openai/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].content).toMatch(/JSON Schema/);
    expect(body.messages[1].content).toContain("[t-2] CANDIDATE: I would use idempotency keys");
  });

  it("retries once when a quote does not match a real candidate turn, then succeeds", async () => {
    const fetcher = mockFetch(completion(JSON.stringify(output("a made-up quote"))), completion(JSON.stringify(output())));
    const result = await provider().generate(input);
    expect(result.outcome).toBe("completed");
    expect(fetcher).toHaveBeenCalledTimes(2);
    const retry = JSON.parse(String((fetcher.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(retry.messages.at(-1).content).toMatch(/rejected/);
  });

  it("retries once on malformed JSON and Groq json_validate_failed, never more", async () => {
    const fetcher = mockFetch(
      completion("{not json"),
      new Response(JSON.stringify({ error: { message: "Failed to generate JSON", code: "json_validate_failed" } }), { status: 400 })
    );
    const result = await provider().generate(input);
    expect(result).toMatchObject({ outcome: "permanent", code: "ASSESSMENT_OUTPUT_INVALID" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not use the retry for rate limits; the job queue retries later", async () => {
    const fetcher = mockFetch(new Response(JSON.stringify({ error: { message: "Rate limit reached", code: "rate_limit_exceeded" } }), { status: 429, headers: { "retry-after": "7" } }));
    const result = await provider().generate(input);
    expect(result).toMatchObject({ outcome: "retryable", code: "RATE_LIMIT_EXCEEDED", retryAfterMs: 7_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("treats a truncated response as incomplete", async () => {
    mockFetch(new Response(JSON.stringify({ choices: [{ message: { content: "{\"summary\":" }, finish_reason: "length" }] })));
    expect(await provider().generate(input)).toMatchObject({ outcome: "permanent", code: "ASSESSMENT_PROVIDER_INCOMPLETE" });
  });
});
