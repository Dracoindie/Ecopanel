export type EmailProviderName = "resend";
export type EmailDeliveryMode = "disabled" | "test" | "live";

export interface EmailProviderStatus {
  provider: string;
  providerConfigured: boolean;
  providerMode: EmailDeliveryMode;
  deliveryStatus: string;
  fromAddress: string | null;
  webhookConfigured: boolean;
  testRecipientConfigured: boolean;
  configurationIssue: string | null;
}

const EMAIL_PATTERN = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const FROM_PATTERN = /^(?:"?([^"<>]+?)"?\s*)?<([^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)>$/;

export interface EmailConfig {
  provider: EmailProviderName | null;
  mode: EmailDeliveryMode;
  apiKey: string | null;
  webhookSecret: string | null;
  from: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  testRecipient: string | null;
  timeoutMs: number;
  maxAttempts: number;
  reminderHours: number;
  leaseMs: number;
  configured: boolean;
  configurationIssue: string | null;
}

function clean(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseMode(raw: string | null): EmailDeliveryMode {
  if (raw === "test" || raw === "live") return raw;
  return "disabled";
}

function parseFrom(value: string | null) {
  if (!value) return null;
  const match = FROM_PATTERN.exec(value);
  if (match) {
    return { name: match[1]?.trim() || null, email: match[2].trim().toLowerCase() };
  }
  const email = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? { name: null, email } : null;
}

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function getEmailConfig(): EmailConfig {
  const providerRaw = clean(process.env.EMAIL_PROVIDER)?.toLowerCase() ?? "disabled";
  const provider = providerRaw === "resend" ? "resend" : null;
  const mode = provider ? parseMode(clean(process.env.EMAIL_MODE)?.toLowerCase() ?? null) : "disabled";
  const apiKey = provider === "resend" ? clean(process.env.RESEND_API_KEY) : null;
  const webhookSecret = provider === "resend" ? clean(process.env.EMAIL_WEBHOOK_SECRET) : null;
  const from = provider ? clean(process.env.EMAIL_FROM) : null;
  const parsedFrom = parseFrom(from);
  const replyToRaw = clean(process.env.EMAIL_REPLY_TO);
  const replyTo = replyToRaw && EMAIL_PATTERN.test(replyToRaw) ? replyToRaw.toLowerCase() : null;
  const testRecipientRaw = clean(process.env.EMAIL_TEST_RECIPIENT);
  const testRecipient = testRecipientRaw && EMAIL_PATTERN.test(testRecipientRaw) ? testRecipientRaw.toLowerCase() : null;

  let configurationIssue: string | null = null;
  if (providerRaw === "resend" && !provider) configurationIssue = "EMAIL_PROVIDER must be resend or disabled.";
  else if (provider && mode === "disabled") configurationIssue = "EMAIL_MODE is disabled.";
  else if (provider && !apiKey) configurationIssue = "RESEND_API_KEY is not configured.";
  else if (provider && !from) configurationIssue = "EMAIL_FROM is not configured.";
  else if (provider && from && !parsedFrom) configurationIssue = "EMAIL_FROM must contain a valid email address.";
  else if (provider && replyToRaw && !replyTo) configurationIssue = "EMAIL_REPLY_TO is not a valid email address.";
  else if (mode === "test" && !testRecipient) configurationIssue = "EMAIL_TEST_RECIPIENT is required in test mode.";
  if (providerRaw !== "resend" && providerRaw !== "disabled" && !configurationIssue) {
    configurationIssue = "EMAIL_PROVIDER must be resend or disabled.";
  }

  const configured = Boolean(
    provider &&
    mode !== "disabled" &&
    apiKey &&
    from &&
    parsedFrom &&
    !configurationIssue
  );

  return {
    provider,
    mode,
    apiKey,
    webhookSecret,
    from,
    fromEmail: parsedFrom?.email ?? null,
    replyTo,
    testRecipient,
    timeoutMs: boundedNumber(process.env.EMAIL_SEND_TIMEOUT_MS, 15_000, 1_000, 120_000),
    maxAttempts: boundedNumber(process.env.EMAIL_MAX_ATTEMPTS, 5, 1, 20),
    reminderHours: boundedNumber(process.env.EMAIL_INTERVIEW_REMINDER_HOURS, 24, 1, 168),
    leaseMs: boundedNumber(process.env.EMAIL_WORKER_LEASE_MS, 120_000, 30_000, 900_000),
    configured,
    configurationIssue
  };
}

export function getEmailProviderStatus(): EmailProviderStatus {
  const config = getEmailConfig();
  return {
    provider: config.configured ? "Resend" : "Not connected",
    providerConfigured: config.configured,
    providerMode: config.mode,
    deliveryStatus:
      config.configured
        ? config.mode === "test"
          ? "Test delivery to a designated inbox"
          : "Live delivery enabled"
        : config.provider
          ? "Provider configuration incomplete"
          : "Provider not configured",
    fromAddress: config.configured ? config.fromEmail : null,
    webhookConfigured: Boolean(config.configured && config.webhookSecret),
    testRecipientConfigured: Boolean(config.testRecipient),
    configurationIssue: config.configurationIssue
  };
}

export function getResendWebhookSecret() {
  const config = getEmailConfig();
  if (!config.webhookSecret) return null;
  return config.webhookSecret;
}
