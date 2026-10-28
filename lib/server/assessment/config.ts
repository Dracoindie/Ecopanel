import type {
  AssessmentProviderName,
  AssessmentProviderMode,
  AssessmentProviderStatus
} from "@/lib/server/assessment/types";

export interface AssessmentConfig {
  provider: AssessmentProviderName | null;
  providerRaw: string;
  mode: AssessmentProviderMode;
  apiKey: string | null;
  model: string | null;
  baseUrl: string;
  timeoutMs: number;
  maxAttempts: number;
  leaseMs: number;
  maxInputChars: number;
  maxOutputTokens: number;
  configured: boolean;
  configurationIssue: string | null;
}

function clean(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function getAssessmentConfig(): AssessmentConfig {
  const providerRaw = clean(process.env.ASSESSMENT_PROVIDER)?.toLowerCase() ?? "disabled";
  const provider: AssessmentProviderName | null = providerRaw === "openai" ? "openai" : null;
  const apiKey = provider === "openai" ? clean(process.env.OPENAI_API_KEY) : null;
  const model = provider === "openai" ? clean(process.env.OPENAI_ASSESSMENT_MODEL) : null;
  const mode: AssessmentProviderMode = provider ? "live" : "disabled";

  let configurationIssue: string | null = null;
  if (providerRaw !== "disabled" && providerRaw !== "openai") {
    configurationIssue = "ASSESSMENT_PROVIDER must be openai or disabled.";
  } else if (provider === "openai" && !apiKey) {
    configurationIssue = "OPENAI_API_KEY is not configured.";
  } else if (provider === "openai" && !model) {
    configurationIssue = "OPENAI_ASSESSMENT_MODEL is not configured.";
  }

  const configured = Boolean(provider && apiKey && model && !configurationIssue);

  return {
    provider,
    providerRaw,
    mode,
    apiKey,
    model,
    baseUrl: clean(process.env.OPENAI_API_BASE_URL) ?? "https://api.openai.com/v1",
    timeoutMs: boundedNumber(process.env.ASSESSMENT_TIMEOUT_MS, 60_000, 5_000, 300_000),
    maxAttempts: boundedNumber(process.env.ASSESSMENT_MAX_ATTEMPTS, 3, 1, 10),
    leaseMs: boundedNumber(process.env.ASSESSMENT_WORKER_LEASE_MS, 300_000, 60_000, 1_800_000),
    maxInputChars: boundedNumber(process.env.ASSESSMENT_MAX_INPUT_CHARS, 120_000, 10_000, 800_000),
    maxOutputTokens: boundedNumber(process.env.ASSESSMENT_MAX_OUTPUT_TOKENS, 3_500, 500, 12_000),
    configured,
    configurationIssue
  };
}

export function getAssessmentProviderStatus(): AssessmentProviderStatus {
  const config = getAssessmentConfig();
  return {
    provider: config.configured ? "OpenAI" : "Not connected",
    providerConfigured: config.configured,
    providerMode: config.mode,
    model: config.configured ? config.model : null,
    status: config.configured
      ? "Assessment provider configured"
      : config.provider
        ? "Assessment provider configuration incomplete"
        : "Assessment provider not configured",
    configurationIssue: config.configurationIssue
  };
}
