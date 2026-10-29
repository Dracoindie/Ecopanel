import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { seedTemplates } from "@/lib/demo-data";
import { closingMessage, createInitialState } from "@/lib/orchestrator";
import { deriveInvitationToken, INVITATION_LINK_PLACEHOLDER } from "@/lib/server/candidate-access";
import { isEmailNotificationKind, stageNotificationKind } from "@/lib/server/email/notifications";
import { claimNextEmailJob, processClaimedEmailJob, type ClaimedEmailJob } from "@/lib/server/email/outbox";
import { fetchResendEmailStatus, type EmailProvider, type EmailSendRequest } from "@/lib/server/email/provider";

const state = () => createInitialState("journey", "Live Test Engineer", "Test Candidate", "Live Test Engineer", "Mid");

describe("candidate email journey: exactly three emails", () => {
  it("sends no shortlisting email", () => {
    expect(stageNotificationKind("Shortlisted")).toBeNull();
  });

  it("has an interview-completed notification with a stored template", () => {
    expect(isEmailNotificationKind("interview_completed")).toBe(true);
    const template = seedTemplates.find(item => item.id === "tpl-interview-completed");
    expect(template?.subject).toContain("{{job_title}}");
    expect(template?.body).toMatch(/received it/);
    expect(template?.body).not.toContain(INVITATION_LINK_PLACEHOLDER);
  });
});

describe("closing line", () => {
  it("mentions the confirmation email when a provider is configured", () => {
    const line = closingMessage(state(), true);
    expect(line).toMatch(/You will receive a confirmation email shortly/);
    expect(line).toMatch(/You can end the interview now\.$/);
  });

  it("stays neutral when no email will be sent", () => {
    const line = closingMessage(state(), false);
    expect(line).toBe(
      "Thank you for your time today, Test Candidate. That completes your interview for the Live Test Engineer role. The hiring team will review your answers and be in touch about next steps. You can end the interview now."
    );
    expect(closingMessage(state())).toBe(line);
  });
});

describe("email worker: one specific message", () => {
  it("claims only the requested message id", async () => {
    const queryRaw = vi.fn(async () => []);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;
    await claimNextEmailJob(prisma, { workerId: "w", leaseMs: 60_000, messageId: "msg_one" });
    await claimNextEmailJob(prisma, { workerId: "w", leaseMs: 60_000 });
    const [targeted] = queryRaw.mock.calls[0] as unknown as [{ values: unknown[]; sql: string }];
    const [any] = queryRaw.mock.calls[1] as unknown as [{ values: unknown[]; sql: string }];
    expect(targeted.values).toContain("msg_one");
    expect(targeted.sql).toContain('AND "id" = ?');
    expect(any.sql).not.toMatch(/AND "id" =/);
  });
});

describe("invitation link rendered at send time", () => {
  const invitation = { id: "inv_test", nonce: "nonce-value" };
  let sent: EmailSendRequest[];
  const provider: EmailProvider = {
    name: "mock",
    mode: "test",
    send: async input => {
      sent.push(input);
      return { outcome: "accepted", providerMessageId: "re_mock_1" };
    }
  };
  const job: ClaimedEmailJob = {
    id: "msg_invite",
    organizationId: "org_1",
    applicationId: "app_1",
    interviewId: "int_1",
    attempts: 1,
    maxAttempts: 5,
    recipientEmail: "candidate@example.com",
    subject: "Interview invitation: Live Test Engineer",
    body: `Join with your personal link:\n\n${INVITATION_LINK_PLACEHOLDER}\n`,
    replyTo: null,
    idempotencyKey: "interview-link:inv_test"
  };
  const prismaMock = () => {
    const token = deriveInvitationToken(invitation.id, invitation.nonce);
    const row = { ...invitation, tokenHash: createHash("sha256").update(token).digest("hex") };
    const tx = { emailMessage: { updateMany: vi.fn(async () => ({ count: 1 })) }, applicationEvent: { create: vi.fn() } };
    return {
      token,
      prisma: {
        candidateInvitation: { findFirst: vi.fn(async () => row) },
        $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx)
      } as unknown as PrismaClient
    };
  };

  beforeEach(() => {
    sent = [];
    vi.stubEnv("AUTH_SECRET", "x".repeat(40));
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses APP_PUBLIC_URL as it is when sending, and keeps the token out of the stored body", async () => {
    vi.stubEnv("APP_PUBLIC_URL", "https://tunnel-today.trycloudflare.com");
    const { prisma, token } = prismaMock();
    const result = await processClaimedEmailJob(job, { prisma, provider, workerId: "w" });
    expect(result.outcome).toBe("accepted");
    expect(sent[0].text).toContain(`https://tunnel-today.trycloudflare.com/interview/join#token=${token}`);
    expect(job.body).not.toContain(token);
    expect(job.body).toContain(INVITATION_LINK_PLACEHOLDER);
  });

  it("refuses to send a localhost link", async () => {
    vi.stubEnv("APP_PUBLIC_URL", "http://localhost:3401");
    const { prisma } = prismaMock();
    const result = await processClaimedEmailJob(job, { prisma, provider, workerId: "w" });
    expect(sent).toHaveLength(0);
    expect(result.failureCode).toBe("INVITATION_URL_NOT_PUBLIC");
  });
});

describe("Resend delivery status lookup", () => {
  beforeEach(() => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("EMAIL_MODE", "test");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns Resend's last event for a message id", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "abc", last_event: "delivered", created_at: "2026-10-29T10:00:00Z" })));
    const result = await fetchResendEmailStatus("4ef9a417-02e9-4d39-ad75-9611e0fcc33c", fetcher as unknown as typeof fetch);
    expect(result).toEqual({ ok: true, lastEvent: "delivered", createdAt: "2026-10-29T10:00:00Z" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails/4ef9a417-02e9-4d39-ad75-9611e0fcc33c");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
  });

  it("rejects an invalid id without calling Resend", async () => {
    const fetcher = vi.fn();
    const result = await fetchResendEmailStatus("../../domains", fetcher as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: false, code: "INVALID_ID" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports a provider error", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ name: "not_found", message: "Email not found" }), { status: 404 }));
    const result = await fetchResendEmailStatus("4ef9a417-02e9-4d39-ad75-9611e0fcc33c", fetcher as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});
