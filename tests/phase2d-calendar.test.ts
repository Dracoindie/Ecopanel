import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { HrContext } from "@/lib/server/session";
import type {
  CalendarEventPayload,
  CalendarEventProvider
} from "@/lib/server/calendar/types";
import { CalendarProviderError } from "@/lib/server/calendar/types";

const testUrl = process.env.TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;

suite("Phase 2D Google Calendar sync (TEST_DATABASE_URL)", () => {
  let prisma: PrismaClient;
  let interviewService: typeof import("@/lib/server/recruitment/hr-interviews");
  let sync: typeof import("@/lib/server/calendar/sync");
  let oauth: typeof import("@/lib/server/calendar/oauth");
  let crypto: typeof import("@/lib/server/calendar/crypto");
  let orgA: string;
  let userA: string;
  let applicationA: string;
  let candidateEmail: string;
  let orgB: string;
  let userB: string;
  let applicationB: string;
  let candidateEmailB: string;
  const workerId = "phase2d-test-worker";
  const savedEnv = {
    provider: process.env.CALENDAR_PROVIDER,
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI,
    key: process.env.CALENDAR_TOKEN_ENCRYPTION_KEY,
    appUrl: process.env.NEXT_PUBLIC_APP_URL
  };

  const contextA = (): HrContext => ({
    user: { id: userA, name: "Alice", email: "alice-phase2d@example.com" },
    organization: { id: orgA, name: "Phase 2D Org A", slug: "phase2d-org-a" },
    role: "OWNER",
    sessionId: "session-phase2d-a"
  });

  const contextB = (): HrContext => ({
    user: { id: userB, name: "Bob", email: "bob-phase2d@example.com" },
    organization: { id: orgB, name: "Phase 2D Org B", slug: "phase2d-org-b" },
    role: "OWNER",
    sessionId: "session-phase2d-b"
  });

  async function createTenant(label: string, suffix: string) {
    const org = await prisma.organization.create({
      data: { name: `Phase 2D ${label}`, slug: `phase2d-${label}-${suffix}` }
    });
    const user = await prisma.user.create({
      data: {
        name: `${label} Owner`,
        email: `phase2d-${label}-${suffix}@example.com`,
        emailVerified: true
      }
    });
    await prisma.membership.create({
      data: { organizationId: org.id, userId: user.id, role: "OWNER" }
    });
    const job = await prisma.job.create({
      data: {
        id: `phase2d-job-${label}-${suffix}`,
        organizationId: org.id,
        title: "Calendar Integration Engineer",
        department: "Engineering",
        location: "London",
        workplace: "Hybrid",
        employmentType: "Full-time",
        shortDescription: "Build reliable scheduling integrations.",
        description: "A sufficiently detailed job description for Phase 2D calendar integration tests.",
        responsibilities: ["Build reliable scheduling integrations"],
        qualifications: ["Strong backend experience"],
        salaryRange: "Competitive",
        status: "Published",
        publicVisible: true
      }
    });
    const email = `phase2d-candidate-${label}-${suffix}@example.com`;
    const candidate = await prisma.candidate.create({
      data: {
        organizationId: org.id,
        name: `Phase 2D ${label} Candidate`,
        email,
        emailNormalized: email,
        phone: "+44 7700 900555"
      }
    });
    const application = await prisma.application.create({
      data: {
        organizationId: org.id,
        jobId: job.id,
        candidateId: candidate.id,
        stage: "New",
        coverLetter: "A sufficiently long cover letter for Phase 2D calendar integration tests.",
        consentVersion: "test",
        consentAt: new Date(),
        idempotencyKey: `phase2d-${label}-${suffix}`
      }
    });
    return { orgId: org.id, userId: user.id, applicationId: application.id, candidateEmail: email };
  }

  function fakeProvider(options: { failUpdateOnce?: boolean } = {}) {
    let updateFailed = false;
    const provider = {
      name: "fake-calendar",
      mode: "test" as const,
      createEvent: vi.fn(async (_accessToken: string, input: CalendarEventPayload) => ({
        id: input.eventId,
        htmlLink: `https://calendar.example/events/${input.eventId}`,
        status: "confirmed"
      })),
      updateEvent: vi.fn(async (_accessToken: string, input: CalendarEventPayload) => {
        if (options.failUpdateOnce && !updateFailed) {
          updateFailed = true;
          throw new CalendarProviderError(
            "Google Calendar is temporarily unavailable.",
            "CALENDAR_UNAVAILABLE",
            { retryable: true }
          );
        }
        return {
          id: input.eventId,
          htmlLink: `https://calendar.example/events/${input.eventId}`,
          status: "confirmed"
        };
      }),
      cancelEvent: vi.fn(async (
        _accessToken: string,
        _input: { calendarId: string; eventId: string; sendUpdates: "none" | "all" }
      ) => undefined),
      verifyAccess: vi.fn(async () => undefined),
      refreshAccessToken: vi.fn(async () => ({
        accessToken: "refreshed-access",
        refreshToken: "refreshed-refresh",
        expiresAt: new Date(Date.now() + 3_600_000),
        scope: "https://www.googleapis.com/auth/calendar.events",
        tokenType: "Bearer"
      })),
      revokeToken: vi.fn(async () => undefined)
    } satisfies CalendarEventProvider;
    return provider;
  }

  async function encryptConnection() {
    return {
      accessTokenEncrypted: crypto.encryptCalendarSecret(
        "fake-access-token",
        crypto.tokenAad(orgA, "google", "access")
      ),
      refreshTokenEncrypted: crypto.encryptCalendarSecret(
        "fake-refresh-token",
        crypto.tokenAad(orgA, "google", "refresh")
      )
    };
  }

  async function connectOrgA() {
    const encrypted = await encryptConnection();
    return prisma.calendarConnection.create({
      data: {
        organizationId: orgA,
        provider: "google",
        providerAccountId: "google-account-a",
        accountEmail: "calendar-owner@example.com",
        calendarId: "primary",
        status: "Connected",
        accessTokenEncrypted: encrypted.accessTokenEncrypted,
        refreshTokenEncrypted: encrypted.refreshTokenEncrypted,
        accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
        scope: "openid email https://www.googleapis.com/auth/calendar.events",
        tokenType: "Bearer",
        connectedByUserId: userA,
        lastVerifiedAt: new Date()
      }
    });
  }

  beforeAll(async () => {
    process.env.APP_DATA_MODE = "database";
    process.env.DATABASE_URL = testUrl;
    process.env.AUTH_SECRET = "integration-test-secret-value-1234567890";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3210";
    process.env.CALENDAR_PROVIDER = "disabled";
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.CALENDAR_SYNC_MAX_ATTEMPTS = "3";

    prisma = (await import("@/lib/server/db")).getPrisma();
    interviewService = await import("@/lib/server/recruitment/hr-interviews");
    sync = await import("@/lib/server/calendar/sync");
    oauth = await import("@/lib/server/calendar/oauth");
    crypto = await import("@/lib/server/calendar/crypto");

    const suffix = randomUUID().slice(0, 8);
    const tenantA = await createTenant("a", suffix);
    orgA = tenantA.orgId;
    userA = tenantA.userId;
    applicationA = tenantA.applicationId;
    candidateEmail = tenantA.candidateEmail;
    const tenantB = await createTenant("b", suffix);
    orgB = tenantB.orgId;
    userB = tenantB.userId;
    applicationB = tenantB.applicationId;
    candidateEmailB = tenantB.candidateEmail;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.$disconnect();
    vi.unstubAllGlobals();
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore("CALENDAR_PROVIDER", savedEnv.provider);
    restore("GOOGLE_CALENDAR_CLIENT_ID", savedEnv.clientId);
    restore("GOOGLE_CALENDAR_CLIENT_SECRET", savedEnv.clientSecret);
    restore("GOOGLE_CALENDAR_REDIRECT_URI", savedEnv.redirectUri);
    restore("CALENDAR_TOKEN_ENCRYPTION_KEY", savedEnv.key);
    restore("NEXT_PUBLIC_APP_URL", savedEnv.appUrl);
  });

  it("queues a skipped calendar event when no calendar is connected", async () => {
    const interview = await interviewService.createHrInterview(contextA(), {
      applicationId: applicationA,
      scheduledAt: "2027-07-13T09:00:00.000Z",
      durationMinutes: 45,
      timezone: "Europe/London",
      round: "Technical panel",
      notes: "Calendar integration test.",
      notify: false,
      calendarNotify: true
    });
    const event = await prisma.calendarEvent.findUniqueOrThrow({
      where: { interviewId_provider: { interviewId: interview.id, provider: "google" } }
    });
    expect(event.status).toBe("Skipped");
    expect(event.failureCode).toBe("CALENDAR_NOT_CONNECTED");
    expect(event.notificationPolicy).toBe("All");
    expect(event.notificationRequestedAt).not.toBeNull();

    const detail = await interviewService.getHrInterview(orgA, interview.id);
    expect(detail?.interview.calendarSync).toMatchObject({
      status: "Skipped",
      failureCode: "CALENDAR_NOT_CONNECTED"
    });
  });

  it("creates and then updates a deterministic calendar event with explicit notification policy", async () => {
    const interview = await prisma.interview.findFirstOrThrow({
      where: { organizationId: orgA },
      orderBy: { createdAt: "asc" }
    });
    await connectOrgA();
    await interviewService.updateHrInterview(contextA(), interview.id, {
      scheduledAt: "2027-07-14T09:00:00.000Z",
      durationMinutes: 45,
      timezone: "Europe/London",
      round: "Technical panel",
      notes: "Calendar integration test.",
      notify: false,
      calendarNotify: true
    });

    const pending = await prisma.calendarEvent.findUniqueOrThrow({
      where: { interviewId_provider: { interviewId: interview.id, provider: "google" } }
    });
    expect(pending.status).toBe("Pending");
    expect(pending.notificationPolicy).toBe("All");
    expect(pending.operation).toBe("Upsert");

    const provider = fakeProvider();
    const result = await sync.processNextCalendarEvent(workerId, provider);
    expect(result.eventId).toBe(pending.id);

    const created = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: pending.id } });
    expect(created.status).toBe("Succeeded");
    expect(created.externalId).toMatch(/^ecopanel[a-f0-9]{32}$/);
    expect(created.externalHtmlLink).toContain(created.externalId);
    expect(provider.createEvent).toHaveBeenCalledTimes(1);
    const payload = provider.createEvent.mock.calls[0][1];
    expect(payload.startsAt).toBe("2027-07-14T09:00:00.000Z");
    expect(payload.endsAt).toBe("2027-07-14T09:45:00.000Z");
    expect(payload.timeZone).toBe("Europe/London");
    expect(payload.sendUpdates).toBe("all");
    expect(payload.attendees).toEqual([{ email: candidateEmail, displayName: "Phase 2D a Candidate" }]);

    await interviewService.updateHrInterview(contextA(), interview.id, {
      scheduledAt: "2027-07-15T09:00:00.000Z",
      durationMinutes: 45,
      timezone: "Europe/London",
      round: "Technical panel",
      notes: "Calendar integration test.",
      notify: false,
      calendarNotify: false
    });
    const updatePending = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: pending.id } });
    expect(updatePending.status).toBe("Pending");
    expect(updatePending.notificationPolicy).toBe("None");

    const second = await sync.processNextCalendarEvent(workerId, provider);
    expect(second.eventId).toBe(pending.id);
    expect(provider.createEvent).toHaveBeenCalledTimes(1);
    expect(provider.updateEvent).toHaveBeenCalledTimes(1);
    expect(provider.updateEvent.mock.calls[0][1].sendUpdates).toBe("none");
    expect(provider.updateEvent.mock.calls[0][1].startsAt).toBe("2027-07-15T09:00:00.000Z");
  });

  it("retries a transient provider failure and records the attempt", async () => {
    const interview = await prisma.interview.findFirstOrThrow({
      where: { organizationId: orgA },
      orderBy: { createdAt: "asc" }
    });
    const existing = await prisma.calendarEvent.findUniqueOrThrow({
      where: { interviewId_provider: { interviewId: interview.id, provider: "google" } }
    });
    await interviewService.updateHrInterview(contextA(), interview.id, {
      scheduledAt: "2027-07-16T09:00:00.000Z",
      durationMinutes: 45,
      timezone: "Europe/London",
      round: "Technical panel",
      notes: "Calendar retry test.",
      notify: false,
      calendarNotify: false
    });

    const provider = fakeProvider({ failUpdateOnce: true });
    const first = await sync.processNextCalendarEvent(workerId, provider);
    expect(first.eventId).toBe(existing.id);
    const retrying = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: existing.id } });
    expect(retrying.status).toBe("Retrying");
    expect(retrying.attempts).toBe(1);
    expect(retrying.failureCode).toBe("CALENDAR_UNAVAILABLE");
    expect(retrying.availableAt.getTime()).toBeGreaterThan(Date.now());

    await prisma.calendarEvent.update({
      where: { id: existing.id },
      data: { availableAt: new Date(Date.now() - 1_000) }
    });
    const second = await sync.processNextCalendarEvent(workerId, provider);
    expect(second.eventId).toBe(existing.id);
    const succeeded = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: existing.id } });
    expect(succeeded.status).toBe("Succeeded");
    expect(succeeded.attempts).toBe(2);
    expect(provider.updateEvent).toHaveBeenCalledTimes(2);
  });

  it("cancels the external event and records the confirmed provider state", async () => {
    const interview = await prisma.interview.findFirstOrThrow({
      where: { organizationId: orgA },
      orderBy: { createdAt: "asc" }
    });
    const existing = await prisma.calendarEvent.findUniqueOrThrow({
      where: { interviewId_provider: { interviewId: interview.id, provider: "google" } }
    });
    await interviewService.cancelHrInterview(contextA(), interview.id, {
      notify: false,
      calendarNotify: true
    });
    const pending = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: existing.id } });
    expect(pending.operation).toBe("Cancel");
    expect(pending.status).toBe("Pending");
    expect(pending.notificationPolicy).toBe("All");

    const provider = fakeProvider();
    const result = await sync.processNextCalendarEvent(workerId, provider);
    expect(result.eventId).toBe(existing.id);
    expect(provider.cancelEvent).toHaveBeenCalledTimes(1);
    expect(provider.cancelEvent.mock.calls[0][1]).toMatchObject({
      eventId: existing.externalId,
      sendUpdates: "all"
    });
    const cancelled = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: existing.id } });
    expect(cancelled.status).toBe("Succeeded");
    expect(cancelled.externalStatus).toBe("cancelled");
    expect(cancelled.lastSyncedAt).not.toBeNull();
  });

  it("completes OAuth with encrypted tokens, one-time state, and an upcoming-interview backfill", async () => {
    process.env.CALENDAR_PROVIDER = "google";
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "test-client-secret";
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = "http://localhost:3210/api/hr/calendar/google/callback";

    const interview = await interviewService.createHrInterview(contextB(), {
      applicationId: applicationB,
      scheduledAt: "2027-08-10T09:00:00.000Z",
      durationMinutes: 30,
      timezone: "Europe/London",
      round: "Intro call",
      notes: "OAuth backfill test.",
      notify: false,
      calendarNotify: true
    });

    const authorizationUrl = new URL(await oauth.createGoogleAuthorizationUrl(contextB()));
    const state = authorizationUrl.searchParams.get("state");
    expect(state).toBeTruthy();
    expect(authorizationUrl.searchParams.get("scope"))
      .toBe("openid email https://www.googleapis.com/auth/calendar.events");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("access_type")).toBe("offline");

    const storedState = await prisma.calendarOAuthState.findFirstOrThrow({
      where: { organizationId: orgB }
    });
    expect(storedState.stateHash).not.toBe(state);
    expect(storedState.stateHash).toHaveLength(64);
    expect(storedState.codeVerifierEncrypted.startsWith("v1.")).toBe(true);
    expect(storedState.codeVerifierEncrypted).not.toMatch(/^[A-Za-z0-9_-]{40,128}$/);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://oauth2.googleapis.com/token") {
        return Response.json({
          access_token: "oauth-access-token",
          refresh_token: "oauth-refresh-token",
          expires_in: 3600,
          scope: "openid email https://www.googleapis.com/auth/calendar.events",
          token_type: "Bearer"
        });
      }
      if (url === "https://openidconnect.googleapis.com/v1/userinfo") {
        return Response.json({ sub: "google-sub-b", email: "owner-b@example.com" });
      }
      if (url.includes("/calendar/v3/calendars/primary/events")) {
        return Response.json({ items: [] });
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(oauth.completeGoogleOAuth({
      context: contextA(),
      state,
      code: "authorization-code",
      oauthError: null
    })).rejects.toThrow(oauth.CalendarOAuthError);

    expect(fetchMock).not.toHaveBeenCalled();
    await expect(oauth.completeGoogleOAuth({
      context: contextB(),
      state,
      code: "authorization-code",
      oauthError: null
    })).resolves.toMatchObject({ accountEmail: "owner-b@example.com" });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const connection = await prisma.calendarConnection.findUniqueOrThrow({
      where: { organizationId: orgB }
    });
    expect(connection.status).toBe("Connected");
    expect(connection.providerAccountId).toBe("google-sub-b");
    expect(connection.accessTokenEncrypted).not.toContain("oauth-access-token");
    expect(connection.refreshTokenEncrypted).not.toContain("oauth-refresh-token");
    expect(crypto.decryptCalendarSecret(
      connection.accessTokenEncrypted!,
      crypto.tokenAad(orgB, "google", "access")
    ).value).toBe("oauth-access-token");
    expect(crypto.decryptCalendarSecret(
      connection.refreshTokenEncrypted!,
      crypto.tokenAad(orgB, "google", "refresh")
    ).value).toBe("oauth-refresh-token");

    const consumed = await prisma.calendarOAuthState.findFirstOrThrow({
      where: { organizationId: orgB }
    });
    expect(consumed.consumedAt).not.toBeNull();
    await expect(oauth.completeGoogleOAuth({
      context: contextB(),
      state,
      code: "authorization-code",
      oauthError: null
    })).rejects.toThrow(oauth.CalendarOAuthError);

    const backfilled = await prisma.calendarEvent.findUniqueOrThrow({
      where: { interviewId_provider: { interviewId: interview.id, provider: "google" } }
    });
    expect(backfilled.status).toBe("Pending");
    expect(backfilled.notificationPolicy).toBe("All");
    expect(candidateEmailB).toContain("phase2d-candidate-b-");
  });
});
