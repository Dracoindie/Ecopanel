import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { CalendarConnection } from "@prisma/client";
import { getPrisma } from "@/lib/server/db";
import { logError, logInfo } from "@/lib/server/logger";
import type { HrContext } from "@/lib/server/session";
import { getCalendarConfig, requireCalendarConfig } from "@/lib/server/calendar/config";
import {
  CalendarCryptoError,
  decryptCalendarSecret,
  encryptCalendarSecret,
  oauthVerifierAad,
  tokenAad
} from "@/lib/server/calendar/crypto";
import { GoogleCalendarProvider } from "@/lib/server/calendar/provider";
import { resumeUpcomingCalendarSync } from "@/lib/server/calendar/service";
import { CalendarProviderError, type CalendarTokens } from "@/lib/server/calendar/types";

const STATE_TTL_MS = 10 * 60 * 1000;

export class CalendarOAuthError extends Error {
  readonly code = "CALENDAR_OAUTH_FAILED";
  readonly status = 400;

  constructor(message = "The calendar connection request could not be completed. Start the connection again.") {
    super(message);
    this.name = "CalendarOAuthError";
  }
}

function hashState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

function codeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function validState(state: string | null): state is string {
  return Boolean(state && /^[A-Za-z0-9_-]{40,128}$/.test(state));
}

export async function createGoogleAuthorizationUrl(context: HrContext) {
  const config = requireCalendarConfig();
  const prisma = getPrisma();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const id = randomUUID();
  const now = new Date();

  await prisma.calendarOAuthState.deleteMany({
    where: { expiresAt: { lt: now } }
  });
  await prisma.calendarOAuthState.create({
    data: {
      id,
      stateHash: hashState(state),
      organizationId: context.organization.id,
      userId: context.user.id,
      sessionId: context.sessionId,
      provider: "google",
      redirectUri: config.redirectUri,
      codeVerifierEncrypted: encryptCalendarSecret(verifier, oauthVerifierAad(id)),
      expiresAt: new Date(now.getTime() + STATE_TTL_MS)
    }
  });

  const provider = new GoogleCalendarProvider();
  return provider.authorizationUrl({
    state,
    codeChallenge: codeChallenge(verifier),
    redirectUri: config.redirectUri,
    scope: config.scope
  });
}

async function consumeState(input: {
  state: string;
  context: HrContext;
  provider: string;
}) {
  const prisma = getPrisma();
  const stateHash = hashState(input.state);
  const now = new Date();
  const record = await prisma.calendarOAuthState.findUnique({ where: { stateHash } });
  if (
    !record ||
    record.consumedAt ||
    record.expiresAt <= now ||
    record.organizationId !== input.context.organization.id ||
    record.userId !== input.context.user.id ||
    record.sessionId !== input.context.sessionId ||
    record.provider !== input.provider
  ) {
    throw new CalendarOAuthError();
  }

  const consumed = await prisma.calendarOAuthState.updateMany({
    where: {
      id: record.id,
      consumedAt: null,
      expiresAt: { gt: now },
      organizationId: input.context.organization.id,
      userId: input.context.user.id,
      sessionId: input.context.sessionId,
      provider: input.provider
    },
    data: { consumedAt: now }
  });
  if (consumed.count !== 1) throw new CalendarOAuthError();
  return record;
}

function grantedScopeAllowsEvents(scope: string) {
  return scope
    .split(/\s+/)
    .filter(Boolean)
    .some(value => value === "https://www.googleapis.com/auth/calendar.events");
}

function connectionData(context: HrContext, tokens: CalendarTokens, accountId: string, email: string) {
  return {
    organizationId: context.organization.id,
    provider: "google",
    providerAccountId: accountId,
    accountEmail: email,
    calendarId: "primary",
    accessTokenEncrypted: encryptCalendarSecret(
      tokens.accessToken,
      tokenAad(context.organization.id, "google", "access")
    ),
    refreshTokenEncrypted: tokens.refreshToken
      ? encryptCalendarSecret(tokens.refreshToken, tokenAad(context.organization.id, "google", "refresh"))
      : null,
    accessTokenExpiresAt: tokens.expiresAt,
    scope: tokens.scope,
    tokenType: tokens.tokenType,
    status: "Connected",
    connectedByUserId: context.user.id,
    lastVerifiedAt: new Date(),
    lastRefreshedAt: new Date(),
    disconnectedAt: null,
    lastErrorCode: null,
    lastError: null
  };
}

export async function completeGoogleOAuth(input: {
  context: HrContext;
  state: string | null;
  code: string | null;
  oauthError: string | null;
}): Promise<Pick<CalendarConnection, "id" | "accountEmail">> {
  const state = input.state;
  const code = input.code;
  if (input.oauthError || !code || !validState(state)) {
    throw new CalendarOAuthError();
  }
  const config = requireCalendarConfig();
  if (config.provider !== "google") throw new CalendarOAuthError();

  const stateRecord = await consumeState({
    state,
    context: input.context,
    provider: "google"
  });

  let verifier: string;
  try {
    verifier = decryptCalendarSecret(
      stateRecord.codeVerifierEncrypted,
      oauthVerifierAad(stateRecord.id)
    ).value;
  } catch (error) {
    if (error instanceof CalendarCryptoError) throw new CalendarOAuthError();
    throw error;
  }

  const provider = new GoogleCalendarProvider();
  const tokens = await provider.exchangeCode({
    code,
    codeVerifier: verifier,
    redirectUri: stateRecord.redirectUri
  });

  if (!grantedScopeAllowsEvents(tokens.scope)) {
    await provider.revokeToken(tokens.refreshToken || tokens.accessToken).catch(() => undefined);
    throw new CalendarOAuthError("Google Calendar permission was not granted. Reconnect and allow calendar access.");
  }

  try {
    await provider.verifyAccess(tokens.accessToken, "primary");
    const connection = await getPrisma().calendarConnection.upsert({
      where: { organizationId: input.context.organization.id },
      create: connectionData(input.context, tokens, tokens.account.accountId, tokens.account.email),
      update: connectionData(input.context, tokens, tokens.account.accountId, tokens.account.email)
    });
    logInfo("Calendar account connected", {
      organizationId: input.context.organization.id,
      connectionId: connection.id,
      provider: "google"
    });
    await resumeUpcomingCalendarSync(input.context.organization.id).catch(error => {
      logError("Upcoming interviews could not be queued for calendar sync", {
        error,
        organizationId: input.context.organization.id
      });
    });
    return { id: connection.id, accountEmail: connection.accountEmail };
  } catch (error) {
    await provider.revokeToken(tokens.refreshToken || tokens.accessToken).catch(() => undefined);
    if (error instanceof CalendarProviderError) throw error;
    throw error;
  }
}

export async function disconnectGoogleCalendar(context: HrContext) {
  const prisma = getPrisma();
  const connection = await prisma.calendarConnection.findUnique({
    where: { organizationId: context.organization.id }
  });
  if (!connection) return;
  const config = getCalendarConfig();

  let revokeTarget: string | null = null;
  if (config.configured) {
    try {
      if (connection.refreshTokenEncrypted) {
        revokeTarget = decryptCalendarSecret(
          connection.refreshTokenEncrypted,
          tokenAad(connection.organizationId, connection.provider, "refresh")
        ).value;
      } else if (connection.accessTokenEncrypted) {
        revokeTarget = decryptCalendarSecret(
          connection.accessTokenEncrypted,
          tokenAad(connection.organizationId, connection.provider, "access")
        ).value;
      }
    } catch {
      revokeTarget = null;
    }
  }

  if (revokeTarget && config.configured) {
    await new GoogleCalendarProvider().revokeToken(revokeTarget).catch(() => undefined);
  }

  await prisma.$transaction([
    prisma.calendarConnection.update({
      where: { id: connection.id },
      data: {
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: null,
        status: "Disconnected",
        disconnectedAt: new Date(),
        lastErrorCode: null,
        lastError: null
      }
    }),
    prisma.calendarEvent.updateMany({
      where: {
        organizationId: context.organization.id,
        status: { in: ["Pending", "Retrying", "Processing"] }
      },
      data: {
        status: "Skipped",
        failureCode: "CALENDAR_DISCONNECTED",
        lastError: "Calendar account disconnected.",
        leaseOwner: null,
        leaseExpiresAt: null,
        availableAt: new Date()
      }
    })
  ]);
  logInfo("Calendar account disconnected", {
    organizationId: context.organization.id,
    connectionId: connection.id
  });
}
