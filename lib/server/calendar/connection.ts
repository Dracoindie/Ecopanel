import type { CalendarConnection } from "@prisma/client";
import { getPrisma } from "@/lib/server/db";
import {
  CalendarCryptoError,
  decryptCalendarSecret,
  encryptCalendarSecret,
  tokenAad
} from "@/lib/server/calendar/crypto";
import {
  CalendarProviderError,
  type CalendarEventProvider
} from "@/lib/server/calendar/types";

const REFRESH_WINDOW_MS = 120_000;

function accessNeedsRefresh(connection: CalendarConnection, now: Date) {
  return !connection.accessTokenEncrypted ||
    !connection.accessTokenExpiresAt ||
    connection.accessTokenExpiresAt.getTime() <= now.getTime() + REFRESH_WINDOW_MS;
}

function decryptAccessToken(connection: CalendarConnection) {
  if (!connection.accessTokenEncrypted) {
    throw new CalendarProviderError(
      "Google Calendar must be reconnected.",
      "CALENDAR_REAUTH_REQUIRED",
      { reauthRequired: true }
    );
  }
  return decryptCalendarSecret(
    connection.accessTokenEncrypted,
    tokenAad(connection.organizationId, connection.provider, "access")
  ).value;
}

function decryptRefreshToken(connection: CalendarConnection) {
  if (!connection.refreshTokenEncrypted) {
    throw new CalendarProviderError(
      "Google Calendar must be reconnected.",
      "CALENDAR_REAUTH_REQUIRED",
      { reauthRequired: true }
    );
  }
  return decryptCalendarSecret(
    connection.refreshTokenEncrypted,
    tokenAad(connection.organizationId, connection.provider, "refresh")
  ).value;
}

async function markNeedsReauth(connectionId: string, message: string) {
  await getPrisma().calendarConnection.updateMany({
    where: { id: connectionId },
    data: {
      status: "NeedsReauth",
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      accessTokenExpiresAt: null,
      lastErrorCode: "CALENDAR_REAUTH_REQUIRED",
      lastError: message
    }
  });
}

export async function getCalendarAccessToken(
  connection: CalendarConnection,
  provider: CalendarEventProvider,
  options: { forceRefresh?: boolean } = {}
) {
  if (connection.status !== "Connected") {
    throw new CalendarProviderError(
      "Google Calendar must be reconnected.",
      "CALENDAR_REAUTH_REQUIRED",
      { reauthRequired: true }
    );
  }

  if (!options.forceRefresh && !accessNeedsRefresh(connection, new Date())) {
    return decryptAccessToken(connection);
  }

  let refreshToken: string;
  try {
    refreshToken = decryptRefreshToken(connection);
  } catch (error) {
    if (error instanceof CalendarCryptoError) {
      throw error;
    }
    await markNeedsReauth(connection.id, "Calendar authorization is no longer available.");
    throw error;
  }

  try {
    const tokens = await provider.refreshAccessToken(refreshToken);
    const refreshed = await getPrisma().calendarConnection.update({
      where: { id: connection.id },
      data: {
        accessTokenEncrypted: encryptCalendarSecret(
          tokens.accessToken,
          tokenAad(connection.organizationId, connection.provider, "access")
        ),
        refreshTokenEncrypted: encryptCalendarSecret(
          tokens.refreshToken || refreshToken,
          tokenAad(connection.organizationId, connection.provider, "refresh")
        ),
        accessTokenExpiresAt: tokens.expiresAt,
        scope: tokens.scope || connection.scope,
        tokenType: tokens.tokenType,
        status: "Connected",
        lastRefreshedAt: new Date(),
        lastErrorCode: null,
        lastError: null
      }
    });
    return decryptAccessToken(refreshed);
  } catch (error) {
    if (error instanceof CalendarProviderError && error.reauthRequired) {
      await markNeedsReauth(connection.id, "Calendar authorization must be renewed.");
    } else if (error instanceof CalendarProviderError) {
      await getPrisma().calendarConnection.updateMany({
        where: { id: connection.id },
        data: {
          lastErrorCode: error.code,
          lastError: error.message
        }
      });
    }
    throw error;
  }
}

export async function getConnectedCalendarConnection(organizationId: string) {
  return getPrisma().calendarConnection.findFirst({
    where: {
      organizationId,
      provider: "google",
      status: "Connected",
      refreshTokenEncrypted: { not: null }
    }
  });
}
