import { getCalendarConfig, requireCalendarConfig } from "@/lib/server/calendar/config";
import {
  CalendarProviderError,
  type CalendarEventPayload,
  type CalendarEventProvider,
  type CalendarOAuthClient,
  type CalendarProviderEvent,
  type CalendarProviderUser,
  type CalendarTokens
} from "@/lib/server/calendar/types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

function boundedTimeout() {
  return getCalendarConfig().timeoutMs;
}

async function fetchProvider(url: string, init: RequestInit) {
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(boundedTimeout())
    });
  } catch {
    throw new CalendarProviderError(
      "The calendar provider could not be reached.",
      "CALENDAR_UNAVAILABLE",
      { retryable: true }
    );
  }
}

function safeProviderReason(body: unknown) {
  if (!body || typeof body !== "object") return "";
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";
  const details = error as { errors?: unknown };
  if (!Array.isArray(details.errors) || !details.errors.length) return "";
  const first = details.errors[0];
  return first && typeof first === "object" && typeof (first as { reason?: unknown }).reason === "string"
    ? (first as { reason: string }).reason
    : "";
}

async function errorBody(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function mapStatusError(status: number, body: unknown = null): CalendarProviderError {
  const reason = safeProviderReason(body).toLowerCase();
  if (status === 401) {
    return new CalendarProviderError("Google Calendar authorization has expired.", "CALENDAR_AUTH_EXPIRED", {
      retryable: true,
      statusCode: status
    });
  }
  if (status === 403) {
    if (/(rate|quota)/i.test(reason)) {
      return new CalendarProviderError("Google Calendar rate limit reached.", "CALENDAR_RATE_LIMITED", {
        retryable: true,
        statusCode: status
      });
    }
    return new CalendarProviderError("Google Calendar access was denied.", "CALENDAR_FORBIDDEN", {
      statusCode: status
    });
  }
  if (status === 404 || status === 410) {
    return new CalendarProviderError("The external calendar event no longer exists.", "CALENDAR_NOT_FOUND", {
      notFound: true,
      statusCode: status
    });
  }
  if (status === 429) {
    return new CalendarProviderError("Google Calendar rate limit reached.", "CALENDAR_RATE_LIMITED", {
      retryable: true,
      statusCode: status
    });
  }
  if (status >= 500) {
    return new CalendarProviderError("Google Calendar is temporarily unavailable.", "CALENDAR_UNAVAILABLE", {
      retryable: true,
      statusCode: status
    });
  }
  return new CalendarProviderError("Google Calendar rejected the request.", "CALENDAR_REQUEST_REJECTED", {
    statusCode: status
  });
}

async function checked(response: Response) {
  if (response.ok) return response;
  throw mapStatusError(response.status, await errorBody(response));
}

function parseTokens(body: unknown, previousRefreshToken: string | null = null): CalendarTokens {
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  const refreshToken = typeof payload.refresh_token === "string" && payload.refresh_token
    ? payload.refresh_token
    : previousRefreshToken;
  const expiresIn = Number(payload.expires_in);
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new CalendarProviderError("Google returned an invalid token response.", "CALENDAR_TOKEN_INVALID", {
      retryable: true
    });
  }
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + Math.max(60, Math.floor(expiresIn)) * 1000),
    scope: typeof payload.scope === "string" ? payload.scope : "",
    tokenType: typeof payload.token_type === "string" ? payload.token_type : "Bearer"
  };
}

function tokenForm(input: Record<string, string>) {
  return Object.entries(input)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

async function tokenRequest(input: Record<string, string>, previousRefreshToken: string | null = null) {
  const config = requireCalendarConfig();
  const response = await fetchProvider(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenForm({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...input
    })
  });
  if (!response.ok) {
    const body = await errorBody(response);
    const code = safeProviderReason(body).toLowerCase();
    if (response.status === 400 && (code === "invalid_grant" || code === "invalid_token")) {
      throw new CalendarProviderError(
        "Google Calendar authorization must be renewed.",
        "CALENDAR_REAUTH_REQUIRED",
        { reauthRequired: true, statusCode: response.status }
      );
    }
    throw mapStatusError(response.status, body);
  }
  return parseTokens(await response.json(), previousRefreshToken);
}

function eventBody(input: CalendarEventPayload) {
  return {
    id: input.eventId,
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.startsAt, timeZone: input.timeZone },
    end: { dateTime: input.endsAt, timeZone: input.timeZone },
    attendees: input.attendees.map(attendee => ({
      email: attendee.email,
      ...(attendee.displayName ? { displayName: attendee.displayName } : {})
    })),
    extendedProperties: {
      private: {
        ecopanelInterviewId: input.interviewId
      }
    }
  };
}

function toProviderEvent(body: unknown): CalendarProviderEvent {
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (typeof payload.id !== "string") {
    throw new CalendarProviderError("Google returned an invalid calendar event.", "CALENDAR_RESPONSE_INVALID", {
      retryable: true
    });
  }
  return {
    id: payload.id,
    htmlLink: typeof payload.htmlLink === "string" ? payload.htmlLink : null,
    status: typeof payload.status === "string" ? payload.status : null
  };
}

function eventUrl(calendarId: string, eventId?: string, sendUpdates?: "none" | "all") {
  const path = eventId
    ? `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
    : `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
  const url = new URL(path);
  if (sendUpdates) url.searchParams.set("sendUpdates", sendUpdates);
  return url.toString();
}

export class GoogleCalendarProvider implements CalendarEventProvider, CalendarOAuthClient {
  readonly name = "google";
  readonly mode = "live" as const;

  authorizationUrl(input: { state: string; codeChallenge: string; redirectUri: string; scope: string }) {
    const config = requireCalendarConfig();
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", input.scope);
    url.searchParams.set("state", input.state);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    return url.toString();
  }

  async exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string }) {
    const tokens = await tokenRequest({
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri
    });
    if (!tokens.refreshToken) {
      throw new CalendarProviderError(
        "Google did not issue offline access. Reconnect and grant offline access.",
        "CALENDAR_REFRESH_TOKEN_MISSING",
        { reauthRequired: true }
      );
    }
    const account = await this.userInfo(tokens.accessToken);
    return { ...tokens, account };
  }

  async userInfo(accessToken: string): Promise<CalendarProviderUser> {
    const response = await fetchProvider(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    await checked(response);
    const body = await response.json() as Record<string, unknown>;
    const accountId = typeof body.sub === "string" ? body.sub : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!accountId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new CalendarProviderError("Google did not return a usable account identity.", "CALENDAR_ACCOUNT_INVALID");
    }
    return { accountId, email };
  }

  async verifyAccess(accessToken: string, calendarId: string) {
    const url = new URL(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("maxResults", "1");
    url.searchParams.set("showDeleted", "false");
    const response = await fetchProvider(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    await checked(response);
    await response.json();
  }

  async refreshAccessToken(refreshToken: string) {
    return tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    }, refreshToken);
  }

  async createEvent(accessToken: string, input: CalendarEventPayload) {
    const response = await fetchProvider(eventUrl(input.calendarId, undefined, input.sendUpdates), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody(input))
    });
    if (response.status === 409) {
      const existing = await fetchProvider(eventUrl(input.calendarId, input.eventId), {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      return toProviderEvent(await (await checked(existing)).json());
    }
    return toProviderEvent(await (await checked(response)).json());
  }

  async updateEvent(accessToken: string, input: CalendarEventPayload) {
    const response = await fetchProvider(eventUrl(input.calendarId, input.eventId, input.sendUpdates), {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody(input))
    });
    return toProviderEvent(await (await checked(response)).json());
  }

  async cancelEvent(
    accessToken: string,
    input: { calendarId: string; eventId: string; sendUpdates: "none" | "all" }
  ) {
    const response = await fetchProvider(eventUrl(input.calendarId, input.eventId, input.sendUpdates), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (response.status === 404 || response.status === 410) return;
    await checked(response);
  }

  async revokeToken(token: string) {
    const response = await fetchProvider(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    if (response.status === 400) return;
    await checked(response);
  }
}

export function getGoogleCalendarProvider() {
  const config = getCalendarConfig();
  if (!config.configured || config.provider !== "google") return null;
  return new GoogleCalendarProvider();
}
