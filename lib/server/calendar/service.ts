import { createHash } from "node:crypto";
import type { CalendarConnection, Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/server/db";
import { getCalendarConfig } from "@/lib/server/calendar/config";
import type {
  CalendarNotificationPolicy,
  CalendarOperation
} from "@/lib/server/calendar/types";

export class CalendarSyncError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "CalendarSyncError";
  }
}

interface EnqueueInput {
  organizationId: string;
  interviewId: string;
  operation: CalendarOperation;
  notificationPolicy: CalendarNotificationPolicy;
}

export function calendarEventId(interviewId: string) {
  return `ecopanel${createHash("sha256").update(interviewId).digest("hex").slice(0, 32)}`;
}

function calendarState(connection: CalendarConnection | null) {
  if (!connection) {
    return {
      queueable: false,
      failureCode: "CALENDAR_NOT_CONNECTED",
      lastError: "Connect a Google Calendar account to sync this interview."
    };
  }
  if (connection.status === "Connected" && connection.refreshTokenEncrypted) {
    return { queueable: true, failureCode: null, lastError: null };
  }
  if (connection.status === "NeedsReauth") {
    return {
      queueable: false,
      failureCode: "CALENDAR_REAUTH_REQUIRED",
      lastError: "Google Calendar authorization must be renewed."
    };
  }
  return {
    queueable: false,
    failureCode: "CALENDAR_DISCONNECTED",
    lastError: "Connect a Google Calendar account to sync this interview."
  };
}

export async function enqueueInterviewCalendarSync(
  tx: Prisma.TransactionClient,
  input: EnqueueInput
) {
  const interview = await tx.interview.findFirst({
    where: {
      id: input.interviewId,
      organizationId: input.organizationId
    },
    include: {
      application: {
        include: {
          candidate: true,
          job: true
        }
      }
    }
  });
  if (!interview) return null;

  const connection = await tx.calendarConnection.findUnique({
    where: { organizationId: input.organizationId }
  });
  const state = calendarState(connection);
  const existing = await tx.calendarEvent.findUnique({
    where: {
      interviewId_provider: {
        interviewId: input.interviewId,
        provider: "google"
      }
    }
  });

  if (input.operation === "Cancel" && !existing && state.queueable) {
    return tx.calendarEvent.create({
      data: {
        organizationId: input.organizationId,
        interviewId: input.interviewId,
        connectionId: connection?.id ?? null,
        provider: "google",
        operation: "Cancel",
        externalId: calendarEventId(input.interviewId),
        status: "Succeeded",
        notificationPolicy: input.notificationPolicy,
        notificationRequestedAt: input.notificationPolicy === "All" ? new Date() : null,
        startsAt: interview.scheduledAt,
        endsAt: new Date(interview.scheduledAt.getTime() + interview.durationMinutes * 60_000),
        lastSyncedAt: new Date(),
        lastError: "No external event was present; nothing to cancel."
      }
    });
  }

  const config = getCalendarConfig();
  const now = new Date();
  const data = {
    connectionId: connection?.id ?? null,
    operation: input.operation,
    status: state.queueable ? "Pending" : "Skipped",
    failureCode: state.failureCode,
    lastError: state.lastError,
    notificationPolicy: input.notificationPolicy,
    notificationRequestedAt: input.notificationPolicy === "All" ? now : null,
    startsAt: interview.scheduledAt,
    endsAt: new Date(interview.scheduledAt.getTime() + interview.durationMinutes * 60_000),
    attempts: 0,
    maxAttempts: config.maxAttempts,
    availableAt: now,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastAttemptAt: null
  } satisfies Prisma.CalendarEventUncheckedUpdateInput;

  if (existing) {
    return tx.calendarEvent.update({
      where: { id: existing.id },
      data: { ...data, version: { increment: 1 } }
    });
  }

  return tx.calendarEvent.create({
    data: {
      ...data,
      organizationId: input.organizationId,
      interviewId: input.interviewId,
      provider: "google",
      externalId: calendarEventId(input.interviewId),
      version: 1
    }
  });
}

export async function scheduleInterviewCalendarSync(
  input: EnqueueInput
) {
  return getPrisma().$transaction(tx => enqueueInterviewCalendarSync(tx, input));
}

export async function resumeUpcomingCalendarSync(organizationId: string) {
  const prisma = getPrisma();
  const connection = await prisma.calendarConnection.findUnique({
    where: { organizationId }
  });
  const resumedCancellations = connection
    ? await prisma.calendarEvent.updateMany({
      where: {
        organizationId,
        provider: "google",
        operation: "Cancel",
        status: "Skipped",
        externalId: { not: null },
        failureCode: {
          in: ["CALENDAR_NOT_CONNECTED", "CALENDAR_REAUTH_REQUIRED", "CALENDAR_DISCONNECTED"]
        }
      },
      data: {
        connectionId: connection.id,
        status: "Pending",
        failureCode: null,
        lastError: null,
        attempts: 0,
        availableAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        version: { increment: 1 }
      }
    })
    : { count: 0 };
  const interviews = await prisma.interview.findMany({
    where: {
      organizationId,
      status: "Scheduled",
      scheduledAt: { gte: new Date() }
    },
    select: { id: true },
    orderBy: { scheduledAt: "asc" }
  });

  let queued = resumedCancellations.count;
  for (const interview of interviews) {
    await prisma.$transaction(async tx => {
      const existing = await tx.calendarEvent.findUnique({
        where: {
          interviewId_provider: {
            interviewId: interview.id,
            provider: "google"
          }
        }
      });
      if (existing && existing.status !== "Skipped") return;
      if (existing && existing.operation === "Cancel") return;
      await enqueueInterviewCalendarSync(tx, {
        organizationId,
        interviewId: interview.id,
        operation: "Upsert",
        notificationPolicy: existing?.notificationPolicy === "All" ? "All" : "None"
      });
      queued += 1;
    });
  }
  return queued;
}

export async function retryCalendarEvent(input: {
  organizationId: string;
  eventId: string;
}) {
  const prisma = getPrisma();
  const event = await prisma.calendarEvent.findFirst({
    where: { id: input.eventId, organizationId: input.organizationId }
  });
  if (!event) return null;
  if (event.status === "Succeeded") {
    throw new CalendarSyncError("This interview is already synchronized.", 409, "CALENDAR_ALREADY_SYNCED");
  }
  if (event.status === "Processing") return event;

  const connection = await prisma.calendarConnection.findUnique({
    where: { organizationId: input.organizationId }
  });
  const state = calendarState(connection);
  if (!state.queueable) {
    throw new CalendarSyncError(
      state.lastError || "Google Calendar is not connected.",
      409,
      state.failureCode || "CALENDAR_NOT_CONNECTED"
    );
  }

  return prisma.calendarEvent.update({
    where: { id: event.id },
    data: {
      connectionId: connection?.id ?? null,
      status: "Pending",
      failureCode: null,
      lastError: null,
      attempts: 0,
      availableAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
      version: { increment: 1 }
    }
  });
}

export function calendarEventSummary(event: {
  id: string;
  operation: string;
  status: string;
  externalHtmlLink: string | null;
  externalStatus: string | null;
  notificationPolicy: string;
  notificationRequestedAt: Date | null;
  lastSyncedAt: Date | null;
  attempts: number;
  maxAttempts: number;
  failureCode: string | null;
  lastError: string | null;
  version: number;
}) {
  return {
    id: event.id,
    operation: event.operation,
    status: event.status,
    htmlLink: event.externalHtmlLink,
    externalStatus: event.externalStatus,
    notificationPolicy: event.notificationPolicy,
    notificationRequestedAt: event.notificationRequestedAt?.toISOString() ?? null,
    lastSyncedAt: event.lastSyncedAt?.toISOString() ?? null,
    attempts: event.attempts,
    maxAttempts: event.maxAttempts,
    failureCode: event.failureCode,
    lastError: event.lastError,
    canRetry: ["Failed", "Skipped"].includes(event.status),
    version: event.version
  };
}

export async function getCalendarConnectionStatus(organizationId: string) {
  const config = getCalendarConfig();
  const prisma = getPrisma();
  const [connection, grouped] = await Promise.all([
    prisma.calendarConnection.findUnique({ where: { organizationId } }),
    prisma.calendarEvent.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true }
    })
  ]);
  const counts: Record<string, number> = {};
  for (const row of grouped) counts[row.status] = row._count._all;
  return {
    provider: "google" as const,
    configured: config.configured,
    configurationIssue: config.configurationIssue,
    connection: connection
      ? {
        id: connection.id,
        status: connection.status,
        accountEmail: connection.accountEmail,
        calendarId: connection.calendarId,
        connectedByUserId: connection.connectedByUserId,
        createdAt: connection.createdAt.toISOString(),
        lastVerifiedAt: connection.lastVerifiedAt?.toISOString() ?? null,
        lastRefreshedAt: connection.lastRefreshedAt?.toISOString() ?? null,
        disconnectedAt: connection.disconnectedAt?.toISOString() ?? null,
        lastErrorCode: connection.lastErrorCode,
        lastError: connection.lastError
      }
      : null,
    queue: {
      pending: counts.Pending ?? 0,
      retrying: counts.Retrying ?? 0,
      processing: counts.Processing ?? 0,
      failed: counts.Failed ?? 0,
      succeeded: counts.Succeeded ?? 0,
      skipped: counts.Skipped ?? 0
    }
  };
}
