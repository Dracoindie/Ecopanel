import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { HrContext } from "@/lib/server/session";
import { getPrisma } from "@/lib/server/db";
import { getEmailConfig, getEmailProviderStatus, type EmailDeliveryMode } from "@/lib/server/email/config";
import { appendSignature, previewText } from "@/lib/server/email/render";
import { requeueFailedEmail } from "@/lib/server/email/outbox";

export class HrEmailError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "HrEmailError";
  }
}

const CATEGORIES = ["Application", "Shortlist", "Interview", "Outcome"] as const;
const MESSAGE_MODES = ["draft", "queue"] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface HrEmailTemplate {
  id: string;
  name: string;
  category: (typeof CATEGORIES)[number];
  description: string;
  subject: string;
  body: string;
  updatedAt: string;
}

export interface HrEmailMessage {
  id: string;
  applicationId: string | null;
  candidateId: string | null;
  jobId: string | null;
  interviewId: string | null;
  templateId: string | null;
  templateName: string | null;
  kind: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  body: string;
  preview: string;
  status: string;
  providerName: string | null;
  providerMode: string | null;
  providerMessageId: string | null;
  failureCode: string | null;
  lastError: string | null;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  acceptedAt: string | null;
  deliveredAt: string | null;
  bouncedAt: string | null;
  complainedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  attachments: string[];
  isDemo: boolean;
}

export interface HrMailSettings {
  senderName: string;
  senderAddress: string;
  replyTo: string;
  signature: string;
  provider: string;
  deliveryStatus: string;
  providerConfigured: boolean;
  providerMode: EmailDeliveryMode;
  fromAddress: string | null;
  webhookConfigured: boolean;
  configurationIssue: string | null;
  updatedAt: string | null;
}

type TemplateRow = {
  id: string;
  name: string;
  category: string;
  description: string;
  subject: string;
  body: string;
  updatedAt: Date;
};

type MessageRow = Prisma.EmailMessageGetPayload<{
  include: { template: { select: { name: true } } };
}>;

function templateToDomain(row: TemplateRow): HrEmailTemplate {
  return {
    id: row.id,
    name: row.name,
    category: row.category as HrEmailTemplate["category"],
    description: row.description,
    subject: row.subject,
    body: row.body,
    updatedAt: row.updatedAt.toISOString()
  };
}

function attachmentNames(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function messageToDomain(row: MessageRow): HrEmailMessage {
  return {
    id: row.id,
    applicationId: row.applicationId,
    candidateId: row.candidateId,
    jobId: row.jobId,
    interviewId: row.interviewId,
    templateId: row.templateId,
    templateName: row.template?.name ?? null,
    kind: row.kind,
    recipientName: row.recipientName,
    recipientEmail: row.recipientEmail,
    subject: row.subject,
    body: row.body,
    preview: row.preview,
    status: row.status,
    providerName: row.providerName,
    providerMode: row.providerMode,
    providerMessageId: row.providerMessageId,
    failureCode: row.failureCode,
    lastError: row.lastError,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    availableAt: row.availableAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    bouncedAt: row.bouncedAt?.toISOString() ?? null,
    complainedAt: row.complainedAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    attachments: attachmentNames(row.attachments),
    isDemo: row.isDemo
  };
}

function text(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "string") throw new HrEmailError(`${label} is required.`, 400, "INVALID_EMAIL");
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new HrEmailError(`${label} must be between ${min} and ${max} characters.`, 400, "INVALID_EMAIL");
  }
  return normalized;
}

function optionalText(value: unknown, label: string, max: number) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new HrEmailError(`${label} must be text.`, 400, "INVALID_EMAIL");
  const normalized = value.trim();
  if (normalized.length > max) throw new HrEmailError(`${label} is too long.`, 400, "INVALID_EMAIL");
  return normalized;
}

function parseTemplate(raw: unknown, partial = false) {
  if (!raw || typeof raw !== "object") throw new HrEmailError("Send a template payload.", 400, "INVALID_TEMPLATE");
  const body = raw as Record<string, unknown>;
  const category = String(body.category ?? "");
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    throw new HrEmailError("Choose a valid template category.", 400, "INVALID_TEMPLATE");
  }
  return {
    name: text(body.name, "Template name", 2, 120),
    category,
    description: optionalText(body.description, "Description", 500),
    subject: text(body.subject, "Subject", 3, 240),
    body: text(body.body, "Message body", 20, 20000),
    partial
  };
}

export async function listEmailTemplates(organizationId: string): Promise<HrEmailTemplate[]> {
  const rows = await getPrisma().emailTemplate.findMany({
    where: { organizationId },
    orderBy: [{ category: "asc" }, { name: "asc" }]
  });
  return rows.map(templateToDomain);
}

export async function getEmailTemplate(organizationId: string, id: string): Promise<HrEmailTemplate | null> {
  const row = await getPrisma().emailTemplate.findFirst({ where: { id, organizationId } });
  return row ? templateToDomain(row) : null;
}

export async function createEmailTemplate(context: HrContext, raw: unknown): Promise<HrEmailTemplate> {
  const input = parseTemplate(raw);
  const row = await getPrisma().emailTemplate.create({
    data: {
      id: randomUUID(),
      organizationId: context.organization.id,
      name: input.name,
      category: input.category,
      description: input.description,
      subject: input.subject,
      body: input.body
    }
  });
  return templateToDomain(row);
}

export async function updateEmailTemplate(context: HrContext, id: string, raw: unknown): Promise<HrEmailTemplate> {
  const existing = await getPrisma().emailTemplate.findFirst({
    where: { id, organizationId: context.organization.id }
  });
  if (!existing) throw new HrEmailError("Template not found.", 404, "TEMPLATE_NOT_FOUND");
  const input = parseTemplate(raw, true);
  const row = await getPrisma().emailTemplate.update({
    where: { id },
    data: {
      name: input.name,
      category: input.category,
      description: input.description,
      subject: input.subject,
      body: input.body
    }
  });
  return templateToDomain(row);
}

export async function listEmailMessages(organizationId: string, limit = 250): Promise<HrEmailMessage[]> {
  const rows = await getPrisma().emailMessage.findMany({
    where: { organizationId },
    include: { template: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500)
  });
  return rows.map(messageToDomain);
}

export async function getEmailMessage(organizationId: string, id: string): Promise<HrEmailMessage | null> {
  const row = await getPrisma().emailMessage.findFirst({
    where: { id, organizationId },
    include: { template: { select: { name: true } } }
  });
  return row ? messageToDomain(row) : null;
}

export async function createEmailMessage(context: HrContext, raw: unknown): Promise<HrEmailMessage> {
  if (!raw || typeof raw !== "object") throw new HrEmailError("Send a message payload.", 400, "INVALID_MESSAGE");
  const body = raw as Record<string, unknown>;
  const applicationId = text(body.applicationId, "Application", 1, 120);
  const subject = text(body.subject, "Subject", 3, 240);
  const messageBody = text(body.body, "Message body", 20, 40000);
  const mode = String(body.mode ?? "draft");
  if (!MESSAGE_MODES.includes(mode as (typeof MESSAGE_MODES)[number])) {
    throw new HrEmailError("Choose draft or queue.", 400, "INVALID_MESSAGE");
  }
  const templateIdRaw = body.templateId;
  let templateId: string | null = null;
  if (templateIdRaw !== undefined && templateIdRaw !== null && templateIdRaw !== "") {
    if (typeof templateIdRaw !== "string") throw new HrEmailError("Template id is invalid.", 400, "INVALID_MESSAGE");
    const template = await getPrisma().emailTemplate.findFirst({
      where: { id: templateIdRaw, organizationId: context.organization.id },
      select: { id: true }
    });
    if (!template) throw new HrEmailError("Template not found.", 404, "TEMPLATE_NOT_FOUND");
    templateId = template.id;
  }
  const attachments = Array.isArray(body.attachments)
    ? body.attachments.filter(item => typeof item === "string").map(item => (item as string).trim()).filter(Boolean).slice(0, 5)
    : [];
  if (attachments.some(item => item.length > 240)) {
    throw new HrEmailError("Attachment names are too long.", 400, "INVALID_MESSAGE");
  }

  const application = await getPrisma().application.findFirst({
    where: { id: applicationId, organizationId: context.organization.id },
    include: { candidate: true, job: true }
  });
  if (!application) throw new HrEmailError("Application not found.", 404, "APPLICATION_NOT_FOUND");

  const config = getEmailConfig();
  const settings = await getPrisma().mailSettings.findUnique({ where: { organizationId: context.organization.id } });
  const storedBody = appendSignature(messageBody, settings?.signature);
  const status = mode === "queue" ? "Queued" : "Draft";
  const preview = previewText(storedBody);

  const row = await getPrisma().$transaction(async tx => {
    const created = await tx.emailMessage.create({
      data: {
        organizationId: context.organization.id,
        applicationId: application.id,
        candidateId: application.candidateId,
        jobId: application.jobId,
        templateId,
        kind: "manual",
        recipientName: application.candidate.name,
        recipientEmail: application.candidate.email,
        subject,
        body: storedBody,
        preview,
        status,
        availableAt: new Date(),
        maxAttempts: config.maxAttempts,
        fromAddress: config.fromEmail,
        replyTo: settings?.replyTo?.trim() || config.replyTo,
        isDemo: false,
        attachments: attachments as Prisma.InputJsonValue
      },
      include: { template: { select: { name: true } } }
    });
    if (status === "Queued") {
      await tx.applicationEvent.create({
        data: {
          organizationId: context.organization.id,
          applicationId: application.id,
          type: "email",
          label: "Email queued",
          detail: `"${subject}" was added to the durable email outbox. Delivery depends on provider configuration and the email worker.`,
          actorUserId: context.user.id,
          actorLabel: context.user.name
        }
      });
    }
    return created;
  });
  return messageToDomain(row);
}

export async function getMailSettings(organizationId: string): Promise<HrMailSettings> {
  const row = await getPrisma().mailSettings.findUnique({ where: { organizationId } });
  const providerStatus = getEmailProviderStatus();
  if (!row) {
    return {
      senderName: "",
      senderAddress: "",
      replyTo: "",
      signature: "",
      provider: providerStatus.provider,
      deliveryStatus: providerStatus.deliveryStatus,
      providerConfigured: providerStatus.providerConfigured,
      providerMode: providerStatus.providerMode,
      fromAddress: providerStatus.fromAddress,
      webhookConfigured: providerStatus.webhookConfigured,
      configurationIssue: providerStatus.configurationIssue,
      updatedAt: null
    };
  }
  return {
    senderName: row.senderName,
    senderAddress: row.senderAddress,
    replyTo: row.replyTo,
    signature: row.signature,
    provider: providerStatus.provider,
    deliveryStatus: providerStatus.deliveryStatus,
    providerConfigured: providerStatus.providerConfigured,
    providerMode: providerStatus.providerMode,
    fromAddress: providerStatus.fromAddress,
    webhookConfigured: providerStatus.webhookConfigured,
    configurationIssue: providerStatus.configurationIssue,
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function updateMailSettings(context: HrContext, raw: unknown): Promise<HrMailSettings> {
  if (!raw || typeof raw !== "object") throw new HrEmailError("Send a settings payload.", 400, "INVALID_SETTINGS");
  const body = raw as Record<string, unknown>;
  const senderName = text(body.senderName, "Sender name", 2, 120);
  const senderAddress = text(body.senderAddress, "Sender address", 3, 240);
  if (!EMAIL_PATTERN.test(senderAddress)) {
    throw new HrEmailError("Enter a valid sender address.", 400, "INVALID_SETTINGS");
  }
  const replyTo = optionalText(body.replyTo, "Reply-to address", 240);
  if (replyTo && !EMAIL_PATTERN.test(replyTo)) {
    throw new HrEmailError("Enter a valid reply-to address.", 400, "INVALID_SETTINGS");
  }
  const signature = text(body.signature, "Signature", 2, 2000);
  const providerStatus = getEmailProviderStatus();
  const data = {
    senderName,
    senderAddress,
    replyTo,
    signature,
    provider: providerStatus.provider,
    deliveryStatus: providerStatus.deliveryStatus
  };
  const row = await getPrisma().mailSettings.upsert({
    where: { organizationId: context.organization.id },
    update: data,
    create: { organizationId: context.organization.id, ...data }
  });
  return {
    senderName: row.senderName,
    senderAddress: row.senderAddress,
    replyTo: row.replyTo,
    signature: row.signature,
    provider: providerStatus.provider,
    deliveryStatus: providerStatus.deliveryStatus,
    providerConfigured: providerStatus.providerConfigured,
    providerMode: providerStatus.providerMode,
    fromAddress: providerStatus.fromAddress,
    webhookConfigured: providerStatus.webhookConfigured,
    configurationIssue: providerStatus.configurationIssue,
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function retryEmailMessage(context: HrContext, id: string): Promise<HrEmailMessage> {
  const result = await requeueFailedEmail(getPrisma(), {
    organizationId: context.organization.id,
    messageId: id,
    actorUserId: context.user.id,
    actorLabel: context.user.name
  });
  if (result.outcome === "not_found") throw new HrEmailError("Message not found.", 404, "MESSAGE_NOT_FOUND");
  if (result.outcome === "ambiguous") {
    throw new HrEmailError(
      "This message has an uncertain provider outcome. Check the provider dashboard instead of retrying automatically.",
      409,
      "AMBIGUOUS_SEND"
    );
  }
  if (result.outcome === "not_failed") {
    throw new HrEmailError("Only definitively failed messages can be requeued.", 409, "MESSAGE_NOT_FAILED");
  }
  const message = await getEmailMessage(context.organization.id, id);
  if (!message) throw new HrEmailError("Message not found.", 404, "MESSAGE_NOT_FOUND");
  return message;
}
