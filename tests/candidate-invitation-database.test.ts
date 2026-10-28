import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { HrContext } from "@/lib/server/session";
import type { AssessmentProvider } from "@/lib/server/assessment/types";
import type { EmailProvider, EmailSendRequest } from "@/lib/server/email/provider";

const testUrl = process.env.TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;

// Agora is a paid external service: start/stop are controlled mocks here.
const mockStartAgent = vi.fn();
const mockStopAgent = vi.fn();
vi.mock("agora-agents", () => ({
  Area: { US: "us", EU: "eu", AP: "ap" },
  ExpiresIn: { hours: (h: number) => h * 3600 },
  AgoraClient: vi.fn().mockImplementation(() => ({ stopAgent: mockStopAgent, agents: { update: vi.fn().mockResolvedValue({}) } })),
  Agent: vi.fn().mockImplementation(() => ({ createSession: () => ({ start: mockStartAgent }) }))
}));

suite("Candidate interview invitations (TEST_DATABASE_URL)", () => {
  let prisma: PrismaClient;
  let invitations: typeof import("@/lib/server/recruitment/candidate-invitations");
  let candidateAccess: typeof import("@/lib/server/candidate-access");
  let interviewService: typeof import("@/lib/server/recruitment/hr-interviews");
  let outbox: typeof import("@/lib/server/email/outbox");
  let assessmentWorker: typeof import("@/lib/server/assessment/worker");
  let hrInterviewRoute: typeof import("@/app/api/hr/interviews/[id]/route");
  let tokenRoute: typeof import("@/app/api/agora/token/route");
  let startRoute: typeof import("@/app/api/agora/start/route");
  let stopRoute: typeof import("@/app/api/agora/stop/route");
  let finishRoute: typeof import("@/app/api/candidate/interview/finish/route");
  let orgA = "";
  let orgB = "";
  let userA = "";
  let userB = "";
  let applicationA = "";
  let interviewA = "";
  let interviewB = "";
  let joinToken = "";
  let sessionCookie = "";
  let channel = "";

  const contextA = (): HrContext => ({
    user: { id: userA, name: "Alice", email: "alice@example.com" },
    organization: { id: orgA, name: "Invite Org A", slug: "invite-a" },
    role: "OWNER",
    sessionId: "session-a"
  });
  const contextB = (): HrContext => ({
    user: { id: userB, name: "Bob", email: "bob@example.com" },
    organization: { id: orgB, name: "Invite Org B", slug: "invite-b" },
    role: "OWNER",
    sessionId: "session-b"
  });
  const post = (path: string, body: unknown, cookie = sessionCookie) => new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body)
  });

  beforeAll(async () => {
    process.env.APP_DATA_MODE = "database";
    process.env.DATABASE_URL = testUrl;
    process.env.AUTH_SECRET = "integration-test-secret-value-1234567890";
    process.env.NEXT_PUBLIC_APP_URL = "https://hire.example.test";
    process.env.AGORA_APP_ID = "0123456789abcdef0123456789abcdef";
    process.env.AGORA_APP_CERTIFICATE = "fedcba9876543210fedcba9876543210";
    process.env.AGORA_PIPELINE_ID = "test-pipeline";

    prisma = (await import("@/lib/server/db")).getPrisma();
    invitations = await import("@/lib/server/recruitment/candidate-invitations");
    candidateAccess = await import("@/lib/server/candidate-access");
    interviewService = await import("@/lib/server/recruitment/hr-interviews");
    outbox = await import("@/lib/server/email/outbox");
    assessmentWorker = await import("@/lib/server/assessment/worker");
    hrInterviewRoute = await import("@/app/api/hr/interviews/[id]/route");
    tokenRoute = await import("@/app/api/agora/token/route");
    startRoute = await import("@/app/api/agora/start/route");
    stopRoute = await import("@/app/api/agora/stop/route");
    finishRoute = await import("@/app/api/candidate/interview/finish/route");

    const suffix = randomUUID().slice(0, 8);
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { name: "Invite Org A", slug: `invite-a-${suffix}` } }),
      prisma.organization.create({ data: { name: "Invite Org B", slug: `invite-b-${suffix}` } })
    ]);
    orgA = a.id;
    orgB = b.id;
    const [alice, bob] = await Promise.all([
      prisma.user.create({ data: { name: "Alice", email: `invite-alice-${suffix}@example.com`, emailVerified: true } }),
      prisma.user.create({ data: { name: "Bob", email: `invite-bob-${suffix}@example.com`, emailVerified: true } })
    ]);
    userA = alice.id;
    userB = bob.id;
    await prisma.membership.createMany({
      data: [
        { organizationId: orgA, userId: userA, role: "OWNER" },
        { organizationId: orgB, userId: userB, role: "OWNER" }
      ]
    });

    const applicationFor = async (organizationId: string, label: string) => {
      const job = await prisma.job.create({
        data: {
          id: `invite-job-${label}-${suffix}`,
          organizationId,
          title: `Invite ${label} Engineer`,
          department: "Engineering",
          location: "London",
          workplace: "Hybrid",
          employmentType: "Full-time",
          shortDescription: "A role used by candidate invitation tests.",
          description: "Build and verify the candidate invitation workflow end to end.",
          responsibilities: ["Ship"],
          qualifications: ["Care"],
          salaryRange: "Competitive",
          status: "Published",
          publicVisible: true,
          publishedAt: new Date()
        }
      });
      const email = `invite-${label}-${suffix}@example.com`;
      const candidate = await prisma.candidate.create({
        data: { organizationId, name: `Invite ${label} Candidate`, email, emailNormalized: email, phone: "+44 7700 900111" }
      });
      return prisma.application.create({
        data: {
          organizationId,
          jobId: job.id,
          candidateId: candidate.id,
          stage: "Interview",
          coverLetter: "A sufficiently long cover letter for invitation integration tests.",
          consentVersion: "test",
          consentAt: new Date(),
          idempotencyKey: `invite-${label}-${suffix}`
        }
      });
    };
    const [appA, appB] = await Promise.all([applicationFor(orgA, "a"), applicationFor(orgB, "b")]);
    applicationA = appA.id;
    const schedule = { scheduledAt: "2027-11-05T10:00:00.000Z", durationMinutes: 45, timezone: "Europe/London", round: "Live panel", notes: "" };
    interviewA = (await interviewService.createHrInterview(contextA(), { applicationId: appA.id, ...schedule })).id;
    interviewB = (await interviewService.createHrInterview(contextB(), { applicationId: appB.id, ...schedule })).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB].filter(Boolean) } } });
    await prisma.$disconnect();
  });

  it("queues the link through the outbox without persisting the token, and renders it only at send time", async () => {
    const issued = await invitations.inviteCandidateToInterview(contextA(), interviewA);
    joinToken = issued.joinUrl.split("#token=")[1];
    expect(joinToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const stored = await prisma.candidateInvitation.findMany({ where: { interviewId: interviewA } });
    const message = await prisma.emailMessage.findUniqueOrThrow({ where: { id: issued.emailMessageId } });
    expect(JSON.stringify(stored)).not.toContain(joinToken);
    expect(message.body).toContain(candidateAccess.INVITATION_LINK_PLACEHOLDER);
    expect(message.body).not.toContain(joinToken);
    expect(message.interviewId).toBe(interviewA);

    const sent: EmailSendRequest[] = [];
    const provider: EmailProvider = {
      name: "test-capture",
      mode: "test",
      send: async input => {
        sent.push(input);
        return { outcome: "accepted", providerMessageId: `test-${input.messageId}` };
      }
    };
    for (let i = 0; i < 25 && !sent.some(item => item.messageId === message.id); i++) {
      if (!(await outbox.runEmailWorkerOnce({ prisma, provider, workerId: "invite-test" }))) break;
    }
    const delivered = sent.find(item => item.messageId === message.id);
    expect(delivered?.text).toContain(issued.joinUrl);
    const after = await prisma.emailMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(after.status).toBe("Sent");
    expect(after.body).not.toContain(joinToken);
  });

  it("redeems once into a session pinned to the interview", async () => {
    const redeemed = await candidateAccess.redeemCandidateInvitation(joinToken);
    sessionCookie = `${candidateAccess.CANDIDATE_SESSION_COOKIE}=${redeemed.sessionToken}`;
    expect(redeemed.interview.id).toBe(interviewA);

    const session = await candidateAccess.getCandidateSession(new Headers({ cookie: sessionCookie }));
    expect(session).toMatchObject({ organizationId: orgA, interviewId: interviewA, applicationId: applicationA });
    await expect(candidateAccess.redeemCandidateInvitation(joinToken)).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  });

  it("does not let the candidate session reach HR APIs", async () => {
    const response = await hrInterviewRoute.GET(
      new Request(`http://localhost/api/hr/interviews/${interviewA}`, { headers: { cookie: sessionCookie } }),
      { params: { id: interviewA } }
    );
    expect(response.status).toBe(401);
  });

  it("issues Agora tokens only for the candidate's own interview", async () => {
    const other = await tokenRoute.POST(post("/api/agora/token", { interviewId: interviewB }));
    expect(other.status).toBe(404);

    const own = await tokenRoute.POST(post("/api/agora/token", { interviewId: interviewA }));
    expect(own.status).toBe(200);
    channel = (await own.json()).channel;
    const live = await prisma.liveInterviewSession.findUniqueOrThrow({ where: { channel } });
    expect(live).toMatchObject({ organizationId: orgA, interviewId: interviewA, createdByUserId: null });
    expect(live.candidateSessionId).toBeTruthy();
  });

  it("runs the agent session lifecycle with controlled Agora mocks", async () => {
    mockStartAgent.mockResolvedValueOnce("agent-invite-1");
    mockStopAgent.mockResolvedValue(undefined);

    expect((await startRoute.POST(post("/api/agora/start", { channel, requesterId: "1234567" }))).status).toBe(200);
    expect((await stopRoute.POST(post("/api/agora/stop", { agentId: "agent-invite-1" }))).status).toBe(200);
    expect(await prisma.liveInterviewSession.findUniqueOrThrow({ where: { channel } })).toMatchObject({ agentId: "agent-invite-1", status: "STOPPED" });

    mockStopAgent.mockClear();
    expect((await stopRoute.POST(post("/api/agora/stop", { agentId: "agent-invite-1" }, ""))).status).toBe(401);
    expect(mockStopAgent).not.toHaveBeenCalled();
  });

  it("finishes the interview once, storing the transcript and queuing the assessment", async () => {
    const turns = [
      { id: "turn-1", speaker: "technical", text: "How would you keep a payment API reliable under load?", timestamp: 1000, isFinal: true },
      { id: "turn-2", speaker: "candidate", text: "I would use idempotency keys with a queue-backed workflow and retries.", timestamp: 2000, isFinal: true },
      { id: "turn-2", speaker: "candidate", text: "I would use idempotency keys with a queue-backed workflow and retries.", timestamp: 2000, isFinal: true }
    ];
    const response = await finishRoute.POST(post("/api/candidate/interview/finish", { turns }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ transcript: { version: 1, turnCount: 2 }, assessmentQueued: true });

    const interview = await prisma.interview.findUniqueOrThrow({ where: { id: interviewA }, include: { transcripts: true, assessmentJobs: true } });
    expect(interview.status).toBe("Completed");
    expect(interview.transcripts).toHaveLength(1);
    expect(interview.transcripts[0]).toMatchObject({ organizationId: orgA, createdByUserId: null, turnCount: 2 });
    expect(interview.assessmentJobs).toHaveLength(1);

    expect((await finishRoute.POST(post("/api/candidate/interview/finish", { turns }))).status).toBe(401);
    expect(await candidateAccess.getCandidateSession(new Headers({ cookie: sessionCookie }))).toBeNull();
  });

  it("processes the assessment with a test provider and shows it only to the owning organization", async () => {
    const provider: AssessmentProvider = {
      name: "test-provider",
      mode: "live",
      model: "test-model",
      generate: async input => {
        const quoted = input.turns.find(turn => turn.speaker === "candidate")!;
        const dimension = { score: 8, confidence: 0.8, insufficientEvidence: false, rationale: "Grounded.", evidence: [{ turnId: quoted.id, quote: quoted.text.slice(0, 200) }] };
        return {
          outcome: "completed",
          provider: "test-provider",
          model: "test-model",
          output: {
            summary: "The candidate described a concrete reliability approach.",
            dimensions: { technical: dimension, product: dimension, communication: dimension, problemSolving: dimension, adaptability: dimension },
            strengths: ["Concrete approach"],
            risks: [],
            unresolvedConcerns: []
          }
        };
      }
    };
    for (let i = 0; i < 25; i++) {
      const done = await prisma.assessment.findFirst({ where: { interviewId: interviewA } });
      if (done) break;
      if (!(await assessmentWorker.processNextAssessmentJob(prisma, { workerId: "invite-test", provider }))) break;
    }

    const transcript = await prisma.interviewTranscript.findFirstOrThrow({ where: { interviewId: interviewA } });
    const assessment = await prisma.assessment.findFirstOrThrow({ where: { interviewId: interviewA } });
    expect(assessment).toMatchObject({ organizationId: orgA, applicationId: applicationA, transcriptId: transcript.id, transcriptVersion: 1, provider: "test-provider" });

    const recruiterView = await interviewService.getHrInterview(orgA, interviewA);
    expect(recruiterView?.assessment?.overallScore).toBe(8);
    expect(await interviewService.getHrInterview(orgB, interviewA)).toBeNull();
  });
});
