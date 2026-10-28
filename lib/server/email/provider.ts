import { createHash } from "node:crypto";
import { sanitizeLogString } from "@/lib/server/logger";
import { getEmailConfig } from "@/lib/server/email/config";
import { emailHtml } from "@/lib/server/email/render";

export interface EmailSendRequest {
  messageId: string;
  idempotencyKey: string | null;
  to: string;
  subject: string;
  text: string;
  replyTo: string | null;
}

export type EmailSendResult =
  | { outcome: "accepted"; providerMessageId: string }
  | { outcome: "retryable"; code: string; message: string; retryAfterMs?: number }
  | { outcome: "permanent"; code: string; message: string }
  | { outcome: "ambiguous"; code: string; message: string };

export interface EmailProvider {
  name: string;
  mode: "live" | "test";
  send(input: EmailSendRequest): Promise<EmailSendResult>;
}

function safeProviderError(value: unknown) {
  const message = typeof value === "string" ? value : value instanceof Error ? value.message : "Provider request failed.";
  return sanitizeLogString(message).slice(0, 240);
}

function retryAfterMs(value: string | null) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 15 * 60_000);
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return Math.max(0, Math.min(date.getTime() - Date.now(), 15 * 60_000));
  return undefined;
}

function idempotencyKey(value: string) {
  return `ecopanel-${createHash("sha256").update(value).digest("hex")}`;
}

function readErrorCode(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const name = (body as { name?: unknown }).name;
  if (typeof name === "string" && /^[a-z0-9_]{2,64}$/i.test(name)) return name.toUpperCase().slice(0, 64);
  return fallback;
}

export function createResendProvider(): EmailProvider | null {
  const config = getEmailConfig();
  if (!config.configured || !config.apiKey || !config.from || !config.fromEmail) return null;
  const mode = config.mode === "test" ? "test" : "live";
  const testRecipient = config.testRecipient;

  return {
    name: "resend",
    mode,
    async send(input) {
      if (mode === "test" && !testRecipient) {
        return { outcome: "permanent", code: "TEST_RECIPIENT_MISSING", message: "Test mode has no designated recipient." };
      }
      const recipient = mode === "test" ? testRecipient! : input.to;
      const subject = mode === "test" ? `[TEST to ${input.to}] ${input.subject}`.slice(0, 240) : input.subject;
      const text = mode === "test"
        ? `Test delivery redirected from ${input.to}.\n\n${input.text}`
        : input.text;
      const payload = {
        from: config.from,
        to: [recipient],
        subject,
        text,
        html: emailHtml(subject, text),
        ...(input.replyTo || config.replyTo ? { reply_to: input.replyTo || config.replyTo } : {})
      };

      let response: Response;
      try {
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey(input.idempotencyKey || input.messageId)
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(config.timeoutMs)
        });
      } catch (error) {
        return {
          outcome: "ambiguous",
          code: "PROVIDER_CONNECTION_AMBIGUOUS",
          message: `Provider response was not received: ${safeProviderError(error)}`
        };
      }

      const raw = await response.text().catch(() => "");
      let body: unknown = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = null;
      }

      if (response.ok) {
        const providerMessageId = body && typeof body === "object" && typeof (body as { id?: unknown }).id === "string"
          ? (body as { id: string }).id
          : null;
        if (!providerMessageId) {
          return {
            outcome: "ambiguous",
            code: "PROVIDER_RESPONSE_INVALID",
            message: "Provider accepted the request without a usable message id."
          };
        }
        return { outcome: "accepted", providerMessageId };
      }

      const apiMessage = body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : raw || `Provider returned HTTP ${response.status}.`;
      const code = readErrorCode(body, `PROVIDER_HTTP_${response.status}`);
      if (response.status === 429 || response.status === 408 || response.status >= 500) {
        return {
          outcome: "retryable",
          code,
          message: safeProviderError(apiMessage),
          retryAfterMs: retryAfterMs(response.headers.get("retry-after"))
        };
      }
      return { outcome: "permanent", code, message: safeProviderError(apiMessage) };
    }
  };
}

export function getEmailProvider(): EmailProvider | null {
  return createResendProvider();
}
