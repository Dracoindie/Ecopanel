import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { HrContext } from "@/lib/server/session";
import type { EmailProvider } from "@/lib/server/email/provider";
import type { ClaimedEmailJob } from "@/lib/server/email/outbox";

const testUrl = process.env.TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;

suite("Phase 2C durable email delivery (TEST_DATABASE_URL)", () => {
  let prisma: PrismaClient;
  let hrService: typeof import("@/lib/server/recruitment/hr");
  let interviewService: typeof import("@/lib/server/recruitment/hr-interviews");
  let notifications: typeof import("@/lib/server/email/notifications");
  let outbox: typeof import("@/lib/server/email/outbox");
  let webhook: typeof import("@/lib/server/email/webhook");
  let orgA: string;
  let userA: string;
  let jobA: string;
  let candidateA: string;
  let candidateEmail: string;
  let applicationA: string;
  const workerId = "phase2c-test-worker";

  const contextA = (): HrContext => ({
    user: { id: userA, name: "Alice", email: "alice@example.com" },
    organization: { id: orgA, name: "Phase 2C Org", slug: "phase2c-org" },
    role: "OWNER",
    sessionId: "session-phase2c"
  });

  function claimedFrom(message: {
    id: string;
    organizationId: string;
    applicationId: string | null;
    attempts: number;
    maxAttempts: number;
    recipientEmail: string;
    subject: string;
    body: string;
    replyTo: string | null;
    idempotencyKey: string | null;
  }, attempts: number): ClaimedEmailJob {
    return {
      id: message.id,
      organizationId: message.organizationId,
      applicationId: message.applicationId,
      attempts,
      maxAttempts: message.maxAttempts,
      recipientEmail: message.recipientEmail,
      subject: message.subject,
      body: message.body,
      replyTo: message.replyTo,
      idempotencyKey: message.idempotencyKey
    };
  }

  async function claimForTest(id: string) {
    const message = await prisma.emailMessage.findUniqueOrThrow({ where: { id } });
    await prisma.emailMessage.update({
      where: { id },
      data: {
        status: "Sending",
        attempts: { increment: 1 },
        lockedBy: workerId,
        lockedUntil: new Date(Date.now() + 120_000),
        lastAttemptAt: new Date()
      }
    });
    return claimedFrom(message, message.attempts + 1);
  }

  function fakeProvider(result: Awaited<ReturnType<EmailProvider["send"]>>): EmailProvider & { send: ReturnType<typeof vi.fn> } {
    return {
      name: "fake-provider",
      mode: "live",
      send: vi.fn(async () => result)
    };
  }

  function signed(secret: string, eventId: string, payload: string, at = new Date()) {
    const timestamp = Math.floor(at.getTime() / 1000).toString();
    const signature = createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64"))
      .update(`${eventId}.${timestamp}.${payload}`)
      .digest("base64");
    return { id: eventId, timestamp, signature: `v1,${signature}` };
  }

  beforeAll(async () => {
    process.env.APP_DATA_MODE = "database";
    process.env.DATABASE_URL = testUrl;
    process.env.AUTH_SECRET = "integration-test-secret-value-1234567890";
    process.env.EMAIL_INTERVIEW_REMINDER_HOURS = "24";

    prisma = (await import("@/lib/server/db")).getPrisma();
    hrService = await import("@/lib/server/recruitment/hr");
    interviewService = await import("@/lib/server/recruitment/hr-interviews");
    notifications = await import("@/lib/server/email/notifications");
    outbox = await import("@/lib/server/email/outbox");
    webhook = await import("@/lib/server/email/webhook");

    const suffix = randomUUID().slice(0, 8);
    const org = await prisma.organization.create({ data: { name: "Phase 2C Org", slug: `phase2c-${suffix}` } });
    orgA = org.id;
    const user = await prisma.user.create({
      data: { name: "Alice", email: `phase2c-alice-${suffix}@example.com`, emailVerified: true }
    });
    userA = user.id;
    await prisma.membership.create({ data: { organizationId: orgA, userId: userA, role: "OWNER" } });
    const job = await prisma.job.create({
      data: {
        id: `phase2c-job-${suffix}`,
        organizationId: orgA,
        title: "Phase 2C Product Engineer",
        department: "Engineering",
        location: "London",
        workplace: "Hybrid",
        employmentType: "Full-time",
        shortDescription: "Build durable delivery workflows.",
        description: "A sufficiently detailed job description for Phase 2C email delivery integration tests.",
        responsibilities: ["Ship reliable delivery workflows"],
        qualifications: ["Strong backend experience"],
        salaryRange: "Competitive",
        status: "Published",
        publicVisible: true
      }
    });
    jobA = job.id;
    candidateEmail = `phase2c-candidate-${suffix}@example.com`;
    const candidate = await prisma.candidate.create({
      data: {
        organizationId: orgA,
        name: "Phase 2C Candidate",
        email: candidateEmail,
        emailNormalized: candidateEmail,
        phone: "+44 7700 900444"
      }
    });
    candidateA = candidate.id;
    const application = await prisma.application.create({
      data: {
        organizationId: orgA,
        jobId: jobA,
        candidateId: candidateA,
        stage: "New",
        coverLetter: "A sufficiently long cover letter for Phase 2C email delivery integration tests.",
        consentVersion: "test",
        consentAt: new Date(),
        idempotencyKey: `phase2c-${suffix}`
      }
    });
    applicationA = application.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.organization.deleteMany({ where: { id: orgA } });
    await prisma.user.deleteMany({ where: { id: userA } });
    await prisma.$disconnect();
  });

  it("enqueues idempotent hiring notifications and records provider acceptance without claiming delivery", async () => {
    const first = await notifications.enqueueHiringNotification(prisma, {
      organizationId: orgA,
      applicationId: applicationA,
      kind: "shortlisted"
    });
    expect(first?.status).toBe("Queued");
    expect(first?.kind).toBe("shortlisted");
    expect(first?.interviewId).toBeNull();

    const duplicate = await notifications.enqueueHiringNotification(prisma, {
      organizationId: orgA,
      applicationId: applicationA,
      kind: "shortlisted"
    });
    expect(duplicate?.id).toBe(first!.id);

    const message = await prisma.emailMessage.findUniqueOrThrow({ where: { id: first!.id } });
    expect(message.body).toContain("Phase 2C Org");
    const job = await claimForTest(first!.id);
    const provider = fakeProvider({ outcome: "accepted", providerMessageId: "provider-accepted-1" });
    const processed = await outbox.processClaimedEmailJob(job, {
      prisma,
      provider,
      workerId,
      now: () => new Date("2026-10-27T10:00:00.000Z")
    });
    expect(processed.outcome).toBe("accepted");
    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({
      messageId: first!.id,
      to: candidateEmail,
      idempotencyKey: message.idempotencyKey
    }));

    const accepted = await prisma.emailMessage.findUniqueOrThrow({ where: { id: first!.id } });
    expect(accepted.status).toBe("Sent");
    expect(accepted.providerMessageId).toBe("provider-accepted-1");
    expect(accepted.acceptedAt).not.toBeNull();
    expect(accepted.deliveredAt).toBeNull();
    expect(accepted.attempts).toBe(1);

    const events = await prisma.applicationEvent.findMany({ where: { applicationId: applicationA, type: "email" } });
    expect(events.some(event => event.label.includes("accepted"))).toBe(true);
  });

  it("verifies signed webhooks, ignores duplicates, and never regresses delivery state", async () => {
    const message = await prisma.emailMessage.findFirstOrThrow({
      where: { organizationId: orgA, providerMessageId: "provider-accepted-1" }
    });
    const secret = `whsec_${Buffer.from("phase2c-webhook-secret").toString("base64")}`;
    const deliveredPayload = JSON.stringify({
      type: "email.delivered",
      created_at: "2026-10-27T10:01:00.000Z",
      data: { email_id: "provider-accepted-1" }
    });
    const headers = signed(secret, "evt-delivered-1", deliveredPayload, new Date("2026-10-27T10:01:00.000Z"));
    expect(() => webhook.verifySvixSignature({ secret, ...headers, payload: deliveredPayload, now: new Date("2026-10-27T10:01:05.000Z") })).not.toThrow();

    const delivered = await webhook.processResendWebhook(prisma, {
      eventId: headers.id,
      payload: JSON.parse(deliveredPayload)
    });
    expect(delivered).toEqual({ outcome: "recorded", statusChanged: true });
    let current = await prisma.emailMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(current.status).toBe("Delivered");
    expect(current.deliveredAt).not.toBeNull();

    const duplicate = await webhook.processResendWebhook(prisma, {
      eventId: headers.id,
      payload: JSON.parse(deliveredPayload)
    });
    expect(duplicate).toEqual({ outcome: "duplicate" });

    const olderBounce = await webhook.processResendWebhook(prisma, {
      eventId: "evt-bounce-older",
      payload: {
        type: "email.bounced",
        created_at: "2026-10-27T09:59:00.000Z",
        data: { email_id: "provider-accepted-1" }
      }
    });
    expect(olderBounce).toEqual({ outcome: "recorded", statusChanged: false });
    current = await prisma.emailMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(current.status).toBe("Delivered");
    expect(current.bouncedAt).toBeNull();

    const ambiguous = await prisma.emailMessage.create({
      data: {
        organizationId: orgA,
        recipientName: "Phase 2C Candidate",
        recipientEmail: candidateEmail,
        subject: "Ambiguous then delivered",
        body: "A sufficiently long body for verified ambiguity recovery.",
        preview: "A sufficiently long body for verified ambiguity recovery.",
        status: "Failed",
        failureCode: "AMBIGUOUS_SEND",
        providerMessageId: "provider-ambiguous-delivered",
        kind: "manual",
        isDemo: false
      }
    });
    const verifiedDelivery = await webhook.processResendWebhook(prisma, {
      eventId: "evt-ambiguous-delivered",
      payload: {
        type: "email.delivered",
        created_at: "2026-10-27T10:02:00.000Z",
        data: { email_id: "provider-ambiguous-delivered" }
      }
    });
    expect(verifiedDelivery).toEqual({ outcome: "recorded", statusChanged: true });
    const recoveredAmbiguity = await prisma.emailMessage.findUniqueOrThrow({ where: { id: ambiguous.id } });
    expect(recoveredAmbiguity.status).toBe("Delivered");
    expect(recoveredAmbiguity.failureCode).toBeNull();

    let signatureError: unknown;
    try {
      webhook.verifySvixSignature({
        secret,
        ...headers,
        signature: "v1,invalid",
        payload: deliveredPayload,
        now: new Date("2026-10-27T10:01:05.000Z")
      });
    } catch (error) {
      signatureError = error;
    }
    expect(signatureError).toMatchObject({ code: "WEBHOOK_SIGNATURE_INVALID" });
    let timestampError: unknown;
    try {
      webhook.verifySvixSignature({
        secret,
        ...headers,
        payload: deliveredPayload,
        now: new Date("2026-10-27T11:00:00.000Z")
      });
    } catch (error) {
      timestampError = error;
    }
    expect(timestampError).toMatchObject({ code: "WEBHOOK_TIMESTAMP_INVALID" });
  });

  it("retries definite failures, stops permanent or ambiguous outcomes, and recovers expired leases", async () => {
    const message = await prisma.emailMessage.create({
      data: {
        organizationId: orgA,
        applicationId: applicationA,
        candidateId: candidateA,
        jobId: jobA,
        recipientName: "Phase 2C Candidate",
        recipientEmail: `retry-${randomUUID()}@example.com`,
        subject: "Retryable delivery",
        body: "A sufficiently long body for retryable delivery tests.",
        preview: "A sufficiently long body for retryable delivery tests.",
        status: "Queued",
        kind: "manual",
        isDemo: false,
        idempotencyKey: `phase2c-retry-${randomUUID()}`
      }
    });
    const retryJob = await claimForTest(message.id);
    const retry = await outbox.processClaimedEmailJob(retryJob, {
      prisma,
      provider: fakeProvider({ outcome: "retryable", code: "PROVIDER_HTTP_503", message: "Temporary outage" }),
      workerId,
      now: () => new Date("2026-10-27T10:10:00.000Z"),
      random: () => 0
    });
    expect(retry.outcome).toBe("retry");
    expect(retry.delayMs).toBeGreaterThan(0);
    let current = await prisma.emailMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(current.status).toBe("Queued");
    expect(current.attempts).toBe(1);
    expect(current.failureCode).toBe("PROVIDER_HTTP_503");
    expect(current.availableAt.getTime()).toBeGreaterThan(new Date("2026-10-27T10:10:00.000Z").getTime());

    await prisma.emailMessage.update({ where: { id: message.id }, data: { availableAt: new Date() } });
    const failedJob = await claimForTest(message.id);
    const failed = await outbox.processClaimedEmailJob(failedJob, {
      prisma,
      provider: fakeProvider({ outcome: "permanent", code: "PROVIDER_VALIDATION", message: "Rejected" }),
      workerId,
      now: () => new Date("2026-10-27T10:20:00.000Z")
    });
    expect(failed.outcome).toBe("failed");
    current = await prisma.emailMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(current.status).toBe("Failed");
    expect(current.failureCode).toBe("PROVIDER_VALIDATION");
    expect(current.failedAt).not.toBeNull();

    const requeued = await outbox.requeueFailedEmail(prisma, {
      organizationId: orgA,
      messageId: message.id,
      actorUserId: userA,
      actorLabel: "Alice"
    });
    expect(requeued.outcome).toBe("queued");
    current = await prisma.emailMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(current.status).toBe("Queued");
    expect(current.attempts).toBe(0);
    expect(current.failureCode).toBeNull();

    const ambiguousMessage = await prisma.emailMessage.create({
      data: {
        organizationId: orgA,
        applicationId: applicationA,
        candidateId: candidateA,
        jobId: jobA,
        recipientName: "Phase 2C Candidate",
        recipientEmail: `ambiguous-${randomUUID()}@example.com`,
        subject: "Ambiguous delivery",
        body: "A sufficiently long body for ambiguous delivery tests.",
        preview: "A sufficiently long body for ambiguous delivery tests.",
        status: "Queued",
        kind: "manual",
        isDemo: false,
        idempotencyKey: `phase2c-ambiguous-${randomUUID()}`
      }
    });
    const ambiguousJob = await claimForTest(ambiguousMessage.id);
    const ambiguous = await outbox.processClaimedEmailJob(ambiguousJob, {
      prisma,
      provider: fakeProvider({ outcome: "ambiguous", code: "NETWORK_LOST", message: "Connection lost" }),
      workerId,
      now: () => new Date("2026-10-27T10:30:00.000Z")
    });
    expect(ambiguous.outcome).toBe("failed");
    expect(ambiguous.failureCode).toBe("AMBIGUOUS_SEND");
    current = await prisma.emailMessage.findUniqueOrThrow({ where: { id: ambiguousMessage.id } });
    expect(current.status).toBe("Failed");
    expect(current.failureCode).toBe("AMBIGUOUS_SEND");
    expect(await outbox.requeueFailedEmail(prisma, {
      organizationId: orgA,
      messageId: ambiguousMessage.id,
      actorUserId: userA,
      actorLabel: "Alice"
    })).toEqual({ outcome: "ambiguous" });

    const expired = await prisma.emailMessage.create({
      data: {
        organizationId: orgA,
        recipientName: "Phase 2C Candidate",
        recipientEmail: "expired@example.com",
        subject: "Expired lease",
        body: "A sufficiently long body for expired lease recovery tests.",
        preview: "A sufficiently long body for expired lease recovery tests.",
        status: "Sending",
        kind: "manual",
        isDemo: false,
        attempts: 1,
        lockedBy: "dead-worker",
        lockedUntil: new Date("2026-10-27T10:00:00.000Z")
      }
    });
    const recovered = await outbox.recoverExpiredEmailSending(prisma, new Date("2026-10-27T10:40:00.000Z"));
    expect(recovered.recovered).toBeGreaterThanOrEqual(1);
    current = await prisma.emailMessage.findUniqueOrThrow({ where: { id: expired.id } });
    expect(current.status).toBe("Failed");
    expect(current.failureCode).toBe("AMBIGUOUS_SEND");
  });

  it("queues stage and interview emails only when explicitly requested", async () => {
    const stageCandidateEmail = `phase2c-stage-${randomUUID()}@example.com`;
    const stageCandidate = await prisma.candidate.create({
      data: {
        organizationId: orgA,
        name: "Phase 2C Stage Candidate",
        email: stageCandidateEmail,
        emailNormalized: stageCandidateEmail,
        phone: "+44 7700 900555"
      }
    });
    const application = await prisma.application.create({
      data: {
        organizationId: orgA,
        jobId: jobA,
        candidateId: stageCandidate.id,
        stage: "New",
        coverLetter: "A sufficiently long cover letter for explicit notification tests.",
        consentVersion: "test",
        consentAt: new Date(),
        idempotencyKey: `phase2c-stage-${randomUUID()}`
      }
    });

    const silent = await hrService.updateApplicationStage(contextA(), application.id, "In Review", { notify: false });
    expect(silent.notificationQueued).toBe(false);
    expect(await prisma.emailMessage.count({
      where: { applicationId: application.id, kind: "status-update" }
    })).toBe(0);

    // Shortlisting sends no email; the next candidate email is the interview invitation.
    await expect(hrService.updateApplicationStage(contextA(), application.id, "Shortlisted", { notify: true })).rejects.toMatchObject({
      code: "STAGE_NOTIFICATION_UNAVAILABLE"
    });
    const shortlisted = await hrService.updateApplicationStage(contextA(), application.id, "Shortlisted", { notify: false });
    expect(shortlisted.notificationQueued).toBe(false);
    expect(await prisma.emailMessage.count({ where: { applicationId: application.id, kind: "shortlisted" } })).toBe(0);
    await expect(hrService.updateApplicationStage(contextA(), application.id, "New", { notify: true })).rejects.toMatchObject({
      code: "STAGE_NOTIFICATION_UNAVAILABLE"
    });

    const scheduledAt = "2030-01-10T10:00:00.000Z";
    const interview = await interviewService.createHrInterview(contextA(), {
      applicationId: application.id,
      scheduledAt,
      durationMinutes: 45,
      timezone: "Europe/London",
      round: "Technical follow-up",
      notes: "Email integration test.",
      notify: true
    });
    // Scheduling queues nothing: the single invitation is the one-time-link email.
    expect(await prisma.emailMessage.count({ where: { interviewId: interview.id } })).toBe(0);

    await interviewService.updateHrInterview(contextA(), interview.id, {
      scheduledAt,
      durationMinutes: 60,
      timezone: "Europe/London",
      round: "Technical follow-up",
      notes: "Rescheduled to the same time with a longer duration.",
      notify: true
    });
    const afterReschedule = await prisma.emailMessage.findMany({ where: { interviewId: interview.id } });
    expect(afterReschedule.some(item => item.kind === "interview-reschedule" && item.status === "Queued")).toBe(true);
    expect(afterReschedule.filter(item => item.kind === "interview-reminder" && item.status === "Queued")).toHaveLength(1);

    await interviewService.cancelHrInterview(contextA(), interview.id, { notify: true });
    const afterCancel = await prisma.emailMessage.findMany({ where: { interviewId: interview.id } });
    expect(afterCancel.some(item => item.kind === "interview-cancel" && item.status === "Queued")).toBe(true);
    expect(afterCancel.filter(item => item.status === "Queued" && item.kind !== "interview-cancel")).toHaveLength(0);
  });
});
