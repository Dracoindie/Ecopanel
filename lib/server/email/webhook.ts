import { createHmac, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
const PROVIDER = "resend";

const STATUS_RANK: Record<string, number> = {
  Draft: 0,
  Queued: 10,
  Sending: 20,
  Sent: 30,
  Delivered: 40,
  Bounced: 60,
  Failed: 60,
  Complained: 70,
  Cancelled: 80
};

const EVENT_STATUS: Record<string, string> = {
  "email.sent": "Sent",
  "email.delivered": "Delivered",
  "email.bounced": "Bounced",
  "email.failed": "Failed",
  "email.suppressed": "Failed",
  "email.complained": "Complained"
};

export class EmailWebhookError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "INVALID_WEBHOOK") {
    super(message);
    this.name = "EmailWebhookError";
  }
}

function decodeSecret(secret: string) {
  const value = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  try {
    const decoded = Buffer.from(value, "base64");
    if (!decoded.length) throw new Error("empty");
    return decoded;
  } catch {
    throw new EmailWebhookError("The email webhook secret is invalid.", 500, "WEBHOOK_NOT_CONFIGURED");
  }
}

export function verifySvixSignature(input: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  payload: string;
  now?: Date;
}) {
  if (!input.id || !input.timestamp || !input.signature) {
    throw new EmailWebhookError("Missing webhook signature headers.", 401, "WEBHOOK_SIGNATURE_MISSING");
  }
  const timestamp = Number(input.timestamp);
  if (!Number.isInteger(timestamp)) {
    throw new EmailWebhookError("Invalid webhook timestamp.", 401, "WEBHOOK_SIGNATURE_INVALID");
  }
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    throw new EmailWebhookError("Webhook timestamp is outside the allowed window.", 401, "WEBHOOK_TIMESTAMP_INVALID");
  }

  const expected = createHmac("sha256", decodeSecret(input.secret))
    .update(`${input.id}.${input.timestamp}.${input.payload}`)
    .digest();
  const candidates = input.signature
    .split(/\s+/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => item.startsWith("v1,") ? item.slice(3) : item)
    .map(item => {
      try {
        return Buffer.from(item, "base64");
      } catch {
        return Buffer.alloc(0);
      }
    })
    .filter(item => item.length > 0);

  const valid = candidates.some(candidate => candidate.length === expected.length && timingSafeEqual(candidate, expected));
  if (!valid) {
    throw new EmailWebhookError("Webhook signature verification failed.", 401, "WEBHOOK_SIGNATURE_INVALID");
  }
  return { timestamp, eventId: input.id };
}

function eventTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function processResendWebhook(
  prisma: PrismaClient,
  input: { eventId: string; payload: unknown; receivedAt?: Date }
) {
  if (!input.payload || typeof input.payload !== "object") {
    throw new EmailWebhookError("Webhook payload is invalid.", 400, "INVALID_WEBHOOK_PAYLOAD");
  }
  const payload = input.payload as Record<string, unknown>;
  const type = typeof payload.type === "string" ? payload.type : "";
  const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : null;
  if (!type || !data) {
    throw new EmailWebhookError("Webhook event or data is missing.", 400, "INVALID_WEBHOOK_PAYLOAD");
  }
  const providerMessageId = typeof data.email_id === "string"
    ? data.email_id
    : typeof data.message_id === "string"
      ? data.message_id
      : null;
  if (!providerMessageId) {
    return { outcome: "ignored" as const, reason: "missing_provider_message_id" };
  }
  const occurredAt = eventTimestamp(payload.created_at) ?? input.receivedAt ?? new Date();
  const receivedAt = input.receivedAt ?? new Date();

  const duplicate = await prisma.emailDeliveryEvent.findUnique({
    where: { providerEventId: input.eventId },
    select: { id: true }
  });
  if (duplicate) return { outcome: "duplicate" as const };

  const message = await prisma.emailMessage.findFirst({
    where: { providerMessageId },
    select: { id: true }
  });
  if (!message) return { outcome: "ignored" as const, reason: "message_not_found" };

  try {
    return await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "EmailMessage" WHERE "id" = ${message.id} FOR UPDATE`;
      const current = await tx.emailMessage.findUniqueOrThrow({ where: { id: message.id } });
      await tx.emailDeliveryEvent.create({
        data: {
          organizationId: current.organizationId,
          emailMessageId: current.id,
          provider: PROVIDER,
          providerEventId: input.eventId,
          providerMessageId,
          type,
          occurredAt,
          receivedAt,
          metadata: { source: PROVIDER }
        }
      });

      const newer = !current.lastEventAt || occurredAt >= current.lastEventAt;
      const nextStatus = EVENT_STATUS[type] ?? null;
      const ambiguousFailure = current.status === "Failed" && current.failureCode === "AMBIGUOUS_SEND";
      const canAdvance = nextStatus
        ? (ambiguousFailure && nextStatus !== "Queued" && nextStatus !== "Sending") ||
          (STATUS_RANK[nextStatus] ?? 0) > (STATUS_RANK[current.status] ?? 0)
        : false;
      if (!newer) return { outcome: "recorded" as const, statusChanged: false };

      if (!canAdvance) {
        await tx.emailMessage.update({
          where: { id: current.id },
          data: { lastEventAt: occurredAt }
        });
        return { outcome: "recorded" as const, statusChanged: false };
      }

      const failureCode = nextStatus === "Bounced"
        ? "PROVIDER_BOUNCED"
        : nextStatus === "Complained"
          ? "PROVIDER_COMPLAINED"
          : nextStatus === "Failed"
            ? type === "email.suppressed" ? "PROVIDER_SUPPRESSED" : "PROVIDER_FAILED"
            : null;
      const timestamps: Record<string, Date> = {};
      if (nextStatus === "Sent" && !current.acceptedAt) timestamps.acceptedAt = occurredAt;
      if (nextStatus === "Delivered") timestamps.deliveredAt = occurredAt;
      if (nextStatus === "Bounced") timestamps.bouncedAt = occurredAt;
      if (nextStatus === "Complained") timestamps.complainedAt = occurredAt;
      if (nextStatus === "Failed") timestamps.failedAt = occurredAt;

      await tx.emailMessage.update({
        where: { id: current.id },
        data: {
          status: nextStatus,
          lastEventAt: occurredAt,
          ...timestamps,
          ...(failureCode
            ? {
                failureCode,
                lastError: nextStatus === "Complained"
                  ? "The recipient marked this message as spam."
                  : nextStatus === "Bounced"
                    ? "The provider reported a bounce."
                    : "The provider reported a delivery failure."
              }
            : nextStatus === "Sent" || nextStatus === "Delivered"
              ? { failureCode: null, lastError: null }
              : {})
        }
      });

      if (current.applicationId && (nextStatus === "Delivered" || failureCode)) {
        await tx.applicationEvent.create({
          data: {
            organizationId: current.organizationId,
            applicationId: current.applicationId,
            type: "email",
            label:
              nextStatus === "Delivered"
                ? "Email delivered"
                : nextStatus === "Complained"
                  ? "Email marked as spam"
                  : nextStatus === "Bounced"
                    ? "Email bounced"
                    : "Email delivery failed",
            detail: "The email provider reported this delivery state through a verified webhook.",
            actorLabel: "Email delivery provider"
          }
        });
      }
      return { outcome: "recorded" as const, statusChanged: true };
    });
  } catch (error) {
    if (error && typeof error === "object" && (error as { code?: string }).code === "P2002") {
      return { outcome: "duplicate" as const };
    }
    throw error;
  }
}
