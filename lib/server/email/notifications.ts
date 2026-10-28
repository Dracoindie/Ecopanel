import { Prisma } from "@prisma/client";
import { seedTemplates } from "@/lib/demo-data";
import type { HrContext } from "@/lib/server/session";
import { getEmailConfig } from "@/lib/server/email/config";
import {
  appendSignature,
  formatInterviewDate,
  formatInterviewTime,
  previewText,
  renderEmailTemplate
} from "@/lib/server/email/render";

export type EmailNotificationKind =
  | "application_received"
  | "status_update"
  | "shortlisted"
  | "interview_invite"
  | "interview_reschedule"
  | "interview_cancel"
  | "interview_reminder"
  | "offer"
  | "rejection";

type NotificationDb = Pick<
  Prisma.TransactionClient,
  "application" | "organization" | "mailSettings" | "emailTemplate" | "emailMessage" | "applicationEvent"
>;

interface NotificationTemplates {
  templateId: string;
  kind: string;
  label: string;
}

const NOTIFICATION_TEMPLATES: Record<EmailNotificationKind, NotificationTemplates> = {
  application_received: { templateId: "tpl-app-received", kind: "application-received", label: "Application receipt" },
  status_update: { templateId: "tpl-status-update", kind: "status-update", label: "Status update" },
  shortlisted: { templateId: "tpl-shortlisted", kind: "shortlisted", label: "Shortlisting" },
  interview_invite: { templateId: "tpl-interview-invite", kind: "interview-invite", label: "Interview invitation" },
  interview_reschedule: { templateId: "tpl-interview-reschedule", kind: "interview-reschedule", label: "Interview reschedule" },
  interview_cancel: { templateId: "tpl-interview-cancel", kind: "interview-cancel", label: "Interview cancellation" },
  interview_reminder: { templateId: "tpl-interview-reminder", kind: "interview-reminder", label: "Interview reminder" },
  offer: { templateId: "tpl-offer", kind: "offer", label: "Selection / offer" },
  rejection: { templateId: "tpl-rejection", kind: "rejection", label: "Rejection" }
};

const STAGE_NOTIFICATION: Partial<Record<string, EmailNotificationKind>> = {
  "In Review": "status_update",
  Shortlisted: "shortlisted",
  Selected: "offer",
  Rejected: "rejection"
};

export function stageNotificationKind(stage: string): EmailNotificationKind | null {
  return STAGE_NOTIFICATION[stage] ?? null;
}

export function isEmailNotificationKind(value: unknown): value is EmailNotificationKind {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(NOTIFICATION_TEMPLATES, value);
}

function fallbackTemplate(templateId: string) {
  return seedTemplates.find(template => template.id === templateId) ?? {
    id: templateId,
    name: "Hiring update",
    category: "Application",
    description: "",
    subject: "An update on your application",
    body: "Hi {{candidate_first_name}},\n\nThere is an update on your application for {{job_title}} at {{company_name}}.\n\nBest,\n{{sender_name}}",
    updatedAt: new Date(0).toISOString()
  };
}

function idempotencyKey(input: {
  kind: EmailNotificationKind;
  applicationId: string;
  interviewId?: string | null;
  scheduledAt?: Date | null;
  version?: string | number | null;
}) {
  const suffix = input.interviewId
    ? `${input.interviewId}${input.scheduledAt ? `:${input.scheduledAt.toISOString()}` : ""}${input.version ? `:${input.version}` : ""}`
    : input.applicationId;
  return `notification:${NOTIFICATION_TEMPLATES[input.kind].kind}:${suffix}`;
}

export function notificationIdempotencyKey(input: {
  kind: EmailNotificationKind;
  applicationId: string;
  interviewId?: string | null;
  scheduledAt?: Date | null;
  version?: string | number | null;
}) {
  return idempotencyKey(input);
}

export function notificationAvailableAt(kind: EmailNotificationKind, scheduledAt: Date | null, now = new Date()) {
  if (kind !== "interview_reminder" || !scheduledAt) return now;
  const reminderHours = getEmailConfig().reminderHours;
  const availableAt = new Date(scheduledAt.getTime() - reminderHours * 60 * 60 * 1000);
  return availableAt > now ? availableAt : null;
}

export async function enqueueHiringNotification(
  db: NotificationDb,
  input: {
    organizationId: string;
    applicationId: string;
    kind: EmailNotificationKind;
    interviewId?: string | null;
    scheduledAt?: Date | null;
    timezone?: string | null;
    notificationVersion?: string | number | null;
    actorUserId?: string | null;
    actorLabel?: string | null;
  }
) {
  const values = await Promise.all([
    db.application.findFirst({
      where: { id: input.applicationId, organizationId: input.organizationId },
      include: { candidate: true, job: true }
    }),
    db.organization.findUnique({ where: { id: input.organizationId }, select: { name: true } }),
    db.mailSettings.findUnique({ where: { organizationId: input.organizationId } })
  ]);
  const [application, organization, settings] = values;
  if (!application || !organization) return null;

  const now = new Date();
  const availableAt = notificationAvailableAt(input.kind, input.scheduledAt ?? null, now);
  if (!availableAt) return null;

  const definition = NOTIFICATION_TEMPLATES[input.kind];
  const row = await db.emailTemplate.findFirst({
    where: { id: definition.templateId, organizationId: input.organizationId }
  });
  const template = row ?? fallbackTemplate(definition.templateId);
  const senderName = settings?.senderName?.trim() || organization.name;
  const templateValues = {
    candidate_name: application.candidate.name,
    candidate_first_name: application.candidate.name.split(/\s+/)[0] || application.candidate.name,
    job_title: application.job.title,
    company_name: organization.name,
    interview_date: input.scheduledAt
      ? formatInterviewDate(input.scheduledAt, input.timezone || "UTC")
      : "[not scheduled]",
    interview_time: input.scheduledAt
      ? formatInterviewTime(input.scheduledAt, input.timezone || "UTC")
      : "[not scheduled]",
    sender_name: senderName
  };
  const subject = renderEmailTemplate(template.subject, templateValues).slice(0, 240);
  const body = appendSignature(renderEmailTemplate(template.body, templateValues), settings?.signature);
  const key = idempotencyKey({
    kind: input.kind,
    applicationId: application.id,
    interviewId: input.interviewId,
    scheduledAt: input.kind === "interview_reschedule" || input.kind === "interview_reminder" ? input.scheduledAt : null,
    version: input.kind === "interview_reschedule" || input.kind === "interview_reminder" ? input.notificationVersion ?? null : null
  });

  const existing = await db.emailMessage.findUnique({ where: { idempotencyKey: key } });
  if (existing) return existing;

  try {
    const created = await db.emailMessage.create({
      data: {
        organizationId: input.organizationId,
        applicationId: application.id,
        candidateId: application.candidateId,
        jobId: application.jobId,
        interviewId: input.interviewId ?? null,
        templateId: row?.id ?? null,
        kind: definition.kind,
        recipientName: application.candidate.name,
        recipientEmail: application.candidate.email,
        subject,
        body,
        preview: previewText(body),
        status: "Queued",
        availableAt,
        maxAttempts: getEmailConfig().maxAttempts,
        fromAddress: getEmailConfig().fromEmail,
        replyTo: settings?.replyTo?.trim() || getEmailConfig().replyTo,
        idempotencyKey: key,
        isDemo: false
      }
    });
    await db.applicationEvent.create({
      data: {
        organizationId: input.organizationId,
        applicationId: application.id,
        type: "email",
        label: `${definition.label} queued`,
        detail: `"${subject}" is queued in the email outbox. Delivery depends on the configured provider and worker.`,
        actorUserId: input.actorUserId ?? null,
        actorLabel: input.actorLabel ?? "Hiring workflow"
      }
    });
    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return db.emailMessage.findUnique({ where: { idempotencyKey: key } });
    }
    throw error;
  }
}

export async function cancelQueuedInterviewEmails(
  db: NotificationDb,
  input: { organizationId: string; interviewId: string; exceptKind?: string }
) {
  return db.emailMessage.updateMany({
    where: {
      organizationId: input.organizationId,
      interviewId: input.interviewId,
      status: "Queued",
      ...(input.exceptKind ? { kind: { not: input.exceptKind } } : {})
    },
    data: {
      status: "Cancelled",
      cancelledAt: new Date(),
      lockedBy: null,
      lockedUntil: null,
      failureCode: "CANCELLED_BY_WORKFLOW",
      lastError: "Cancelled because the interview changed."
    }
  });
}

export function notificationActor(context: HrContext) {
  return { actorUserId: context.user.id, actorLabel: context.user.name };
}
