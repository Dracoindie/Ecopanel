import { randomBytes } from "node:crypto";
import type { CalendarConnection, Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/server/db";
import { logError, logInfo } from "@/lib/server/logger";
import { getCalendarConfig } from "@/lib/server/calendar/config";
import { getCalendarAccessToken } from "@/lib/server/calendar/connection";
import { getGoogleCalendarProvider } from "@/lib/server/calendar/provider";
import { calendarEventId } from "@/lib/server/calendar/service";
import {
  CalendarProviderError,
  type CalendarEventProvider,
  type CalendarProviderEvent
} from "@/lib/server/calendar/types";

type ClaimedEvent = Prisma.CalendarEventGetPayload<{
  include: {
    connection: true;
    interview: {
      include: {
        application: {
          include: {
            candidate: true;
            job: true;
          };
        };
      };
    };
  };
}>;

function workerLeaseMs() {
  return getCalendarConfig().leaseMs;
}

function retryAt(attempts: number) {
  const baseMs = Math.min(60 * 60 * 1000, 30_000 * Math.pow(2, Math.max(0, attempts - 1)));
  const jitter = Math.floor(baseMs * 0.15 * Math.random());
  return new Date(Date.now() + baseMs + jitter);
}

async function recoverExpiredLeases(now: Date) {
  await getPrisma().calendarEvent.updateMany({
    where: {
      status: "Processing",
      leaseExpiresAt: { lt: now }
    },
    data: {
      status: "Retrying",
      failureCode: "CALENDAR_SYNC_INTERRUPTED",
      lastError: "Calendar synchronization was interrupted and will be retried.",
      attempts: { increment: 1 },
      leaseOwner: null,
      leaseExpiresAt: null,
      availableAt: now
    }
  });
}

export async function claimCalendarEvent(workerId: string) {
  const prisma = getPrisma();
  const now = new Date();
  await recoverExpiredLeases(now);

  const candidates = await prisma.calendarEvent.findMany({
    where: {
      status: { in: ["Pending", "Retrying"] },
      availableAt: { lte: now }
    },
    orderBy: { availableAt: "asc" },
    take: 10,
    select: { id: true, version: true, attempts: true, maxAttempts: true }
  });

  for (const candidate of candidates) {
    if (candidate.attempts >= candidate.maxAttempts) {
      await prisma.calendarEvent.updateMany({
        where: {
          id: candidate.id,
          version: candidate.version,
          status: { in: ["Pending", "Retrying"] }
        },
        data: {
          status: "Failed",
          failureCode: "CALENDAR_RETRIES_EXHAUSTED",
          lastError: "Calendar synchronization retries were exhausted."
        }
      });
      continue;
    }
    const claimed = await prisma.calendarEvent.updateMany({
      where: {
        id: candidate.id,
        version: candidate.version,
        status: { in: ["Pending", "Retrying"] },
        availableAt: { lte: now }
      },
      data: {
        status: "Processing",
        leaseOwner: workerId,
        leaseExpiresAt: new Date(now.getTime() + workerLeaseMs()),
        lastAttemptAt: now
      }
    });
    if (claimed.count !== 1) continue;
    return prisma.calendarEvent.findUnique({
      where: { id: candidate.id },
      include: {
        connection: true,
        interview: {
          include: {
            application: {
              include: {
                candidate: true,
                job: true
              }
            }
          }
        }
      }
    });
  }
  return null;
}

async function finishEvent(
  event: ClaimedEvent,
  workerId: string,
  data: Prisma.CalendarEventUpdateManyMutationInput
) {
  const result = await getPrisma().calendarEvent.updateMany({
    where: {
      id: event.id,
      version: event.version,
      leaseOwner: workerId,
      status: "Processing"
    },
    data: {
      ...data,
      leaseOwner: null,
      leaseExpiresAt: null
    }
  });
  return result.count === 1;
}

async function skipEvent(event: ClaimedEvent, workerId: string, code: string, message: string) {
  const updated = await finishEvent(event, workerId, {
    status: "Skipped",
    failureCode: code,
    lastError: message
  });
  if (!updated) {
    logInfo("Calendar event changed while it was being synchronized", {
      eventId: event.id,
      organizationId: event.organizationId
    });
  }
  return updated;
}

async function failEvent(
  event: ClaimedEvent,
  workerId: string,
  error: CalendarProviderError
) {
  if (error.reauthRequired) {
    return skipEvent(event, workerId, error.code, error.message);
  }
  const attempts = event.attempts + 1;
  const exhausted = attempts >= event.maxAttempts;
  const updated = await finishEvent(event, workerId, {
    status: exhausted ? "Failed" : "Retrying",
    attempts,
    availableAt: exhausted ? event.availableAt : retryAt(attempts),
    failureCode: error.code,
    lastError: error.message
  });
  if (!updated) {
    logInfo("Calendar event changed while a failed sync was being recorded", {
      eventId: event.id,
      organizationId: event.organizationId
    });
  }
  return updated;
}

function withTokenRefresh(
  connection: CalendarConnection,
  provider: CalendarEventProvider,
  operation: (accessToken: string) => Promise<void>
) {
  return (async () => {
    let accessToken = await getCalendarAccessToken(connection, provider);
    try {
      await operation(accessToken);
    } catch (error) {
      if (error instanceof CalendarProviderError && error.code === "CALENDAR_AUTH_EXPIRED") {
        accessToken = await getCalendarAccessToken(connection, provider, { forceRefresh: true });
        await operation(accessToken);
        return;
      }
      throw error;
    }
  })();
}

export async function processClaimedCalendarEvent(
  event: ClaimedEvent,
  workerId: string,
  provider: CalendarEventProvider
) {
  if (event.operation === "Cancel" && !event.externalId && !event.interviewId) {
    return skipEvent(event, workerId, "CALENDAR_EVENT_MISSING", "There is no calendar event to cancel.");
  }
  if (event.operation !== "Upsert" && event.operation !== "Cancel") {
    return skipEvent(event, workerId, "CALENDAR_OPERATION_INVALID", "The calendar operation is not supported.");
  }

  const connection = event.connection;
  if (!connection || connection.status !== "Connected") {
    const code = connection?.status === "NeedsReauth"
      ? "CALENDAR_REAUTH_REQUIRED"
      : "CALENDAR_NOT_CONNECTED";
    return skipEvent(
      event,
      workerId,
      code,
      code === "CALENDAR_REAUTH_REQUIRED"
        ? "Google Calendar authorization must be renewed."
        : "Connect a Google Calendar account to sync this interview."
    );
  }

  if (event.operation === "Cancel") {
    const externalId = event.externalId || (event.interviewId ? calendarEventId(event.interviewId) : null);
    if (!externalId) {
      return skipEvent(event, workerId, "CALENDAR_EVENT_MISSING", "There is no calendar event to cancel.");
    }
    try {
      await withTokenRefresh(connection, provider, async accessToken => {
        await provider.cancelEvent(accessToken, {
          calendarId: connection.calendarId,
          eventId: externalId,
          sendUpdates: event.notificationPolicy === "All" ? "all" : "none"
        });
      });
      const updated = await finishEvent(event, workerId, {
        status: "Succeeded",
        externalId,
        externalStatus: "cancelled",
        attempts: event.attempts + 1,
        lastSyncedAt: new Date(),
        failureCode: null,
        lastError: null
      });
      if (updated) {
        logInfo("Interview removed from Google Calendar", {
          eventId: event.id,
          organizationId: event.organizationId,
          interviewId: event.interviewId
        });
      }
      return updated;
    } catch (error) {
      if (error instanceof CalendarProviderError && error.notFound) {
        return finishEvent(event, workerId, {
          status: "Succeeded",
          externalId,
          externalStatus: "not_found",
          attempts: event.attempts + 1,
          lastSyncedAt: new Date(),
          failureCode: null,
          lastError: "The external event was already removed."
        });
      }
      if (error instanceof CalendarProviderError) return failEvent(event, workerId, error);
      throw error;
    }
  }

  const interview = event.interview;
  if (!interview) {
    return skipEvent(event, workerId, "CALENDAR_INTERVIEW_MISSING", "The interview is no longer available.");
  }
  if (interview.status === "Cancelled") {
    return skipEvent(event, workerId, "CALENDAR_INTERVIEW_CANCELLED", "The interview was cancelled before it could be synced.");
  }

  const startsAt = interview.scheduledAt.toISOString();
  const endsAt = new Date(
    interview.scheduledAt.getTime() + interview.durationMinutes * 60_000
  ).toISOString();
  const payload = {
    interviewId: interview.id,
    eventId: event.externalId || calendarEventId(interview.id),
    calendarId: connection.calendarId,
    summary: `Interview: ${interview.application.candidate.name} - ${interview.application.job.title}`.slice(0, 240),
    description: [
      `Candidate: ${interview.application.candidate.name}`,
      `Email: ${interview.application.candidate.email}`,
      `Role: ${interview.application.job.title}`,
      `Round: ${interview.round}`,
      "",
      "Scheduled in Ecopanel."
    ].join("\n"),
    startsAt,
    endsAt,
    timeZone: interview.timezone,
    attendees: [{
      email: interview.application.candidate.email,
      displayName: interview.application.candidate.name
    }],
    sendUpdates: event.notificationPolicy === "All" ? "all" as const : "none" as const
  };

  const hasConfirmedExternalEvent = Boolean(
    event.externalId && (event.lastSyncedAt || event.externalHtmlLink)
  );

  try {
    let external: CalendarProviderEvent | undefined;
    await withTokenRefresh(connection, provider, async accessToken => {
      if (hasConfirmedExternalEvent) {
        try {
          external = await provider.updateEvent(accessToken, payload);
          return;
        } catch (error) {
          if (!(error instanceof CalendarProviderError) || !error.notFound) throw error;
        }
      }
      external = await provider.createEvent(accessToken, payload);
    });
    if (!external) throw new CalendarProviderError("The calendar provider returned no event.", "CALENDAR_RESPONSE_INVALID", { retryable: true });
    const updated = await finishEvent(event, workerId, {
      status: "Succeeded",
      externalId: external.id,
      externalHtmlLink: external.htmlLink,
      externalStatus: external.status,
      attempts: event.attempts + 1,
      lastSyncedAt: new Date(),
      failureCode: null,
      lastError: null
    });
    if (updated) {
      logInfo("Interview synchronized to Google Calendar", {
        eventId: event.id,
        organizationId: event.organizationId,
        interviewId: event.interviewId
      });
    }
    return updated;
  } catch (error) {
    if (error instanceof CalendarProviderError) return failEvent(event, workerId, error);
    throw error;
  }
}

export async function processNextCalendarEvent(
  workerId: string,
  provider: CalendarEventProvider
) {
  const event = await claimCalendarEvent(workerId);
  if (!event) return { processed: false, eventId: null };
  try {
    const processed = await processClaimedCalendarEvent(event, workerId, provider);
    return { processed, eventId: event.id };
  } catch (error) {
    logError("Calendar synchronization failed unexpectedly", {
      error,
      eventId: event.id,
      organizationId: event.organizationId
    });
    await finishEvent(event, workerId, {
      status: "Retrying",
      attempts: event.attempts + 1,
      availableAt: retryAt(event.attempts + 1),
      failureCode: "CALENDAR_SYNC_ERROR",
      lastError: "Calendar synchronization failed unexpectedly."
    }).catch(() => undefined);
    return { processed: false, eventId: event.id };
  }
}

export function newCalendarWorkerId() {
  return `calendar-${process.pid}-${randomBytes(4).toString("hex")}`;
}

export async function runLiveCalendarWorkerOnce(workerId: string) {
  const provider = getGoogleCalendarProvider();
  if (!provider) return { processed: false, eventId: null, disabled: true };
  return {
    ...await processNextCalendarEvent(workerId, provider),
    disabled: false
  };
}
