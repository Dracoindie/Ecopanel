export type CalendarOperation = "Upsert" | "Cancel";
export type CalendarNotificationPolicy = "None" | "All";

export interface CalendarAttendee {
  email: string;
  displayName?: string;
}

export interface CalendarEventPayload {
  interviewId: string;
  eventId: string;
  calendarId: string;
  summary: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  attendees: CalendarAttendee[];
  sendUpdates: "none" | "all";
}

export interface CalendarProviderEvent {
  id: string;
  htmlLink: string | null;
  status: string | null;
}

export interface CalendarTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string;
  tokenType: string;
}

export interface CalendarProviderUser {
  accountId: string;
  email: string;
}

export interface CalendarEventProvider {
  readonly name: string;
  readonly mode: "live" | "test";
  createEvent(accessToken: string, input: CalendarEventPayload): Promise<CalendarProviderEvent>;
  updateEvent(accessToken: string, input: CalendarEventPayload): Promise<CalendarProviderEvent>;
  cancelEvent(
    accessToken: string,
    input: { calendarId: string; eventId: string; sendUpdates: "none" | "all" }
  ): Promise<void>;
  verifyAccess(accessToken: string, calendarId: string): Promise<void>;
  refreshAccessToken(refreshToken: string): Promise<CalendarTokens>;
  revokeToken(token: string): Promise<void>;
}

export interface CalendarOAuthClient {
  authorizationUrl(input: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
    scope: string;
  }): string;
  exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<CalendarTokens & { account: CalendarProviderUser }>;
}

export class CalendarProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly options: {
      retryable?: boolean;
      reauthRequired?: boolean;
      notFound?: boolean;
      statusCode?: number;
    } = {}
  ) {
    super(message);
    this.name = "CalendarProviderError";
  }

  get retryable() {
    return this.options.retryable === true;
  }

  get reauthRequired() {
    return this.options.reauthRequired === true;
  }

  get notFound() {
    return this.options.notFound === true;
  }
}
