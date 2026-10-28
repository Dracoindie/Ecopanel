import { getAssessmentConfig, type AssessmentConfig } from "@/lib/server/assessment/config";
import {
  ASSESSMENT_RUBRIC,
  ASSESSMENT_RUBRIC_VERSION
} from "@/lib/server/assessment/rubric";
import {
  assessmentOutputJsonSchema,
  normalizeEvidenceText
} from "@/lib/server/assessment/validation";
import type {
  AssessmentGenerationInput,
  AssessmentProvider,
  AssessmentProviderResult
} from "@/lib/server/assessment/types";
import { sanitizeLogString } from "@/lib/server/logger";

function retryAfterMs(value: string | null) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 15 * 60_000);
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return Math.max(0, Math.min(date.getTime() - Date.now(), 15 * 60_000));
  return undefined;
}

function safeMessage(value: unknown) {
  const message = typeof value === "string" ? value : value instanceof Error ? value.message : "Assessment provider request failed.";
  return sanitizeLogString(message).slice(0, 240);
}

function errorCode(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const code = (body as { code?: unknown }).code;
  if (typeof code === "string" && /^[a-z0-9_.-]{2,80}$/i.test(code)) return code.toUpperCase().slice(0, 80);
  return fallback;
}

function responseText(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const direct = (body as { output_text?: unknown }).output_text;
  if (typeof direct === "string" && direct.trim()) return direct;
  const output = (body as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const typed = part as { type?: unknown; text?: unknown };
      if (typed.type === "output_text" && typeof typed.text === "string") chunks.push(typed.text);
    }
  }
  return chunks.join("").trim() || null;
}

function transcriptPrompt(input: AssessmentGenerationInput) {
  const rubric = Object.fromEntries(
    Object.entries(ASSESSMENT_RUBRIC).map(([key, dimension]) => [
      key,
      {
        label: dimension.label,
        description: dimension.description,
        anchors: dimension.anchors
      }
    ])
  );

  const transcript = input.turns
    .map(turn => `[${turn.id}] ${turn.speaker === "candidate" ? "CANDIDATE" : "INTERVIEWER"}: ${turn.text}`)
    .join("\n");

  return [
    `Rubric version: ${ASSESSMENT_RUBRIC_VERSION}`,
    `Role: ${input.jobTitle}`,
    `Interview round: ${input.interviewRound}`,
    input.jobDescription ? `Job requirements:\n${input.jobDescription.slice(0, 4_000)}` : "Job requirements: not provided.",
    "",
    "Rubric:",
    JSON.stringify(rubric, null, 2),
    "",
    "Transcript:",
    transcript
  ].join("\n");
}

function buildInstructions() {
  return [
    "You assess a completed job interview transcript for a human recruiter.",
    "Use only the supplied transcript. Do not infer facts from outside knowledge or protected personal characteristics.",
    "Every non-insufficient dimension must cite at least one candidate turn and an exact quote copied from that turn.",
    "Quotes must be verbatim substrings of the candidate turn after normalizing CRLF line endings and trimming outer whitespace.",
    "Never cite an interviewer turn as candidate evidence. Never paraphrase or repair a quote.",
    "If a competency lacks sufficient candidate evidence, set insufficientEvidence=true, score=0 (the server will ignore it), and evidence=[].",
    "Do not reward verbosity, confidence, accent, emotion, or personality. Assess only job-relevant evidence.",
    "Do not make a hiring, rejection, ranking, or employment decision. The server derives the overall score and recommendation.",
    "Return only the requested JSON object. Do not include markdown or commentary."
  ].join(" ");
}

function configuredProvider(config: AssessmentConfig, name: "openai", apiKey: string, model: string): AssessmentProvider {
  return {
    name,
    mode: "live",
    model,
    async generate(input) {
      const prompt = transcriptPrompt(input);
      if (prompt.length > config.maxInputChars) {
        return {
          outcome: "permanent",
          code: "TRANSCRIPT_TOO_LONG",
          message: "The persisted transcript exceeds the configured assessment input limit."
        };
      }

      let response: Response;
      try {
        response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/responses`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model,
            store: false,
            instructions: buildInstructions(),
            input: prompt,
            max_output_tokens: config.maxOutputTokens,
            text: {
              format: {
                type: "json_schema",
                name: "interview_assessment",
                strict: true,
                schema: assessmentOutputJsonSchema()
              }
            }
          }),
          signal: AbortSignal.timeout(config.timeoutMs)
        });
      } catch (error) {
        return {
          outcome: "retryable",
          code: "ASSESSMENT_PROVIDER_UNAVAILABLE",
          message: `The assessment provider did not respond: ${safeMessage(error)}`
        };
      }

      const raw = await response.text().catch(() => "");
      let body: unknown = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = null;
      }

      if (!response.ok) {
        const detail = body && typeof body === "object" && (body as { error?: unknown }).error
          ? (body as { error: { message?: unknown } }).error.message
          : raw || `Provider returned HTTP ${response.status}.`;
        const code = errorCode(body && typeof body === "object" ? (body as { error?: unknown }).error : null, `ASSESSMENT_PROVIDER_HTTP_${response.status}`);
        if (response.status === 408 || response.status === 429 || response.status >= 500) {
          return {
            outcome: "retryable",
            code,
            message: safeMessage(detail),
            retryAfterMs: retryAfterMs(response.headers.get("retry-after"))
          };
        }
        return { outcome: "permanent", code, message: safeMessage(detail) };
      }

      if (body && typeof body === "object" && (body as { status?: unknown }).status === "incomplete") {
        return {
          outcome: "permanent",
          code: "ASSESSMENT_PROVIDER_INCOMPLETE",
          message: "The assessment provider returned an incomplete response."
        };
      }

      const text = responseText(body);
      if (!text) {
        return {
          outcome: "permanent",
          code: "ASSESSMENT_PROVIDER_EMPTY",
          message: "The assessment provider returned no structured output."
        };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return {
          outcome: "permanent",
          code: "ASSESSMENT_OUTPUT_INVALID",
          message: "The assessment provider returned malformed JSON."
        };
      }

      return { outcome: "completed", output: parsed, provider: name, model };
    }
  };
}

export function getAssessmentProvider(): AssessmentProvider | null {
  const config = getAssessmentConfig();
  if (!config.configured || !config.apiKey || !config.model) return null;
  return configuredProvider(config, "openai", config.apiKey, config.model);
}

export function createAssessmentProviderForTest(input: {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs?: number;
  maxInputChars?: number;
  maxOutputTokens?: number;
}): AssessmentProvider {
  const config = {
    ...getAssessmentConfig(),
    provider: "openai" as const,
    mode: "live" as const,
    apiKey: input.apiKey,
    model: input.model,
    baseUrl: input.baseUrl,
    timeoutMs: input.timeoutMs ?? 10_000,
    maxInputChars: input.maxInputChars ?? 120_000,
    maxOutputTokens: input.maxOutputTokens ?? 3_500,
    configured: true,
    configurationIssue: null
  };
  return configuredProvider(config, "openai", input.apiKey, input.model);
}

export function transcriptForProvider(turns: AssessmentGenerationInput["turns"]) {
  return turns.map(turn => ({
    id: turn.id,
    speaker: turn.speaker,
    text: normalizeEvidenceText(turn.text)
  }));
}
