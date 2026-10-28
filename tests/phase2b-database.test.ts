import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { HrContext } from "@/lib/server/session";

const testUrl = process.env.TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;

suite("Phase 2B HR persistence (TEST_DATABASE_URL)", () => {
  let prisma: PrismaClient;
  let jobsService: typeof import("@/lib/server/recruitment/hr-jobs");
  let interviewService: typeof import("@/lib/server/recruitment/hr-interviews");
  let emailService: typeof import("@/lib/server/recruitment/hr-email");
  let publicJobs: typeof import("@/lib/server/recruitment/jobs");
  let orgA: string;
  let orgB: string;
  let userA: string;
  let userB: string;
  let applicationA: string;
  let jobA: string;
  let candidateA: string;

  const contextA = (): HrContext => ({
    user: { id: userA, name: "Alice", email: "alice@example.com" },
    organization: { id: orgA, name: "Org A", slug: "org-a" },
    role: "OWNER",
    sessionId: "session-a"
  });
  const contextB = (): HrContext => ({
    user: { id: userB, name: "Bob", email: "bob@example.com" },
    organization: { id: orgB, name: "Org B", slug: "org-b" },
    role: "OWNER",
    sessionId: "session-b"
  });

  beforeAll(async () => {
    process.env.APP_DATA_MODE = "database";
    process.env.DATABASE_URL = testUrl;
    process.env.AUTH_SECRET = "integration-test-secret-value-1234567890";

    prisma = (await import("@/lib/server/db")).getPrisma();
    jobsService = await import("@/lib/server/recruitment/hr-jobs");
    interviewService = await import("@/lib/server/recruitment/hr-interviews");
    emailService = await import("@/lib/server/recruitment/hr-email");
    publicJobs = await import("@/lib/server/recruitment/jobs");

    const suffix = randomUUID().slice(0, 8);
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { name: "Phase 2B A", slug: `phase2b-a-${suffix}` } }),
      prisma.organization.create({ data: { name: "Phase 2B B", slug: `phase2b-b-${suffix}` } })
    ]);
    orgA = a.id;
    orgB = b.id;
    const [alice, bob] = await Promise.all([
      prisma.user.create({ data: { name: "Alice", email: `phase2b-alice-${suffix}@example.com`, emailVerified: true } }),
      prisma.user.create({ data: { name: "Bob", email: `phase2b-bob-${suffix}@example.com`, emailVerified: true } })
    ]);
    userA = alice.id;
    userB = bob.id;
    await prisma.membership.createMany({
      data: [
        { organizationId: orgA, userId: userA, role: "OWNER" },
        { organizationId: orgB, userId: userB, role: "OWNER" }
      ]
    });

    const job = await jobsService.createHrJob(contextA(), {
      title: "Persisted Product Engineer",
      department: "Engineering",
      location: "London",
      workplace: "Hybrid",
      employmentType: "Full-time",
      shortDescription: "Build and ship a persisted recruitment workflow.",
      description: "This description is long enough to satisfy validation for the persisted job service integration test.",
      responsibilities: ["Ship product features"],
      qualifications: ["Strong product engineering experience"],
      salaryRange: "Competitive",
      status: "Published",
      publicVisible: true
    });
    jobA = job.id;

    const candidate = await prisma.candidate.create({
      data: {
        organizationId: orgA,
        name: "Phase 2B Candidate",
        email: `phase2b-candidate-${suffix}@example.com`,
        emailNormalized: `phase2b-candidate-${suffix}@example.com`,
        phone: "+44 7700 900333"
      }
    });
    candidateA = candidate.id;
    const application = await prisma.application.create({
      data: {
        organizationId: orgA,
        jobId: jobA,
        candidateId: candidateA,
        stage: "New",
        coverLetter: "A sufficiently long cover letter for Phase 2B integration tests.",
        consentVersion: "test",
        consentAt: new Date(),
        idempotencyKey: `phase2b-${suffix}`
      }
    });
    applicationA = application.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB].filter(Boolean) } } });
    await prisma.$disconnect();
  });

  it("persists jobs with publication state and organization isolation", async () => {
    const created = await jobsService.createHrJob(contextA(), {
      title: "Draft Data Engineer",
      department: "Data",
      location: "Remote",
      workplace: "Remote",
      employmentType: "Contract",
      shortDescription: "A draft role for testing persistence and publishing.",
      description: "This draft job description is intentionally long enough for the Phase 2B validation rules to accept it.",
      responsibilities: ["Build pipelines"],
      qualifications: ["SQL experience"],
      salaryRange: "Negotiable",
      status: "Draft",
      publicVisible: false
    });
    expect(created.status).toBe("Draft");
    expect(created.publicVisible).toBe(false);

    const list = await jobsService.listHrJobs(orgA, { status: "Draft" });
    expect(list.jobs.map(item => item.id)).toContain(created.id);

    const published = await jobsService.setHrJobStatus(contextA(), created.id, "Published");
    expect(published.status).toBe("Published");
    expect(published.publicVisible).toBe(true);
    expect((await publicJobs.getPublishedJob(created.id))?.title).toBe("Draft Data Engineer");

    const closed = await jobsService.setHrJobStatus(contextA(), created.id, "Closed");
    expect(closed.publicVisible).toBe(false);
    expect(await publicJobs.getPublishedJob(created.id)).toBeNull();
    expect(await jobsService.getHrJob(orgB, created.id)).toBeNull();
  });

  it("persists scheduling, status transitions, and a real assessment only after completion", async () => {
    const interview = await interviewService.createHrInterview(contextA(), {
      applicationId: applicationA,
      scheduledAt: "2026-11-03T10:00:00.000Z",
      durationMinutes: 45,
      timezone: "Europe/London",
      round: "Technical follow-up",
      notes: "Focus on system design."
    });
    expect(interview.status).toBe("Scheduled");
    const application = await prisma.application.findUniqueOrThrow({ where: { id: applicationA } });
    expect(application.stage).toBe("Interview");

    const moved = await interviewService.updateHrInterview(contextA(), interview.id, {
      scheduledAt: "2026-11-04T11:30:00.000Z",
      durationMinutes: 60,
      timezone: "Europe/London",
      round: "Technical follow-up",
      notes: "Rescheduled for the panel."
    });
    expect(moved.scheduledAt).toBe("2026-11-04T11:30:00.000Z");

    await expect(interviewService.saveHrAssessment(contextA(), interview.id, {
      overallScore: 7.5,
      recommendation: "Hire",
      summary: "A sufficiently detailed assessment summary for validation.",
      dimensions: {}
    })).rejects.toMatchObject({ code: "INTERVIEW_NOT_COMPLETED" });

    const completed = await interviewService.completeHrInterview(contextA(), interview.id);
    expect(completed.status).toBe("Completed");

    const assessment = await interviewService.saveHrAssessment(contextA(), interview.id, {
      overallScore: 8.4,
      recommendation: "Hire",
      summary: "The candidate demonstrated thoughtful product and technical judgement across the panel.",
      dimensions: {
        technical: { score: 8.5, evidence: ["Explained a sensible API design."], sourceTurns: ["turn-1"], confidence: 0.86 },
        product: { score: 8.1, evidence: ["Prioritised customer impact."], sourceTurns: ["turn-2"], confidence: 0.8 },
        communication: { score: 8.7, evidence: ["Structured answers clearly."], sourceTurns: ["turn-3"], confidence: 0.9 },
        problemSolving: { score: 8.2, evidence: ["Worked through trade-offs."], sourceTurns: ["turn-4"], confidence: 0.82 },
        adaptability: { score: 7.9, evidence: ["Adjusted to a changed constraint."], sourceTurns: ["turn-5"], confidence: 0.78 }
      },
      strengths: ["Clear communication"],
      risks: ["Limited enterprise scale experience"],
      unresolvedConcerns: ["Confirm availability"],
      source: "LIVE"
    });
    expect(assessment.isDemo).toBe(false);
    expect(assessment.source).toBe("LIVE");

    const detail = await interviewService.getHrInterview(orgA, interview.id);
    expect(detail?.assessment?.overallScore).toBe(8.4);
    expect(detail?.assessment?.dimensions.technical.score).toBe(8.5);
    expect(await interviewService.getHrInterview(orgB, interview.id)).toBeNull();

    const events = await prisma.applicationEvent.findMany({ where: { applicationId: applicationA } });
    expect(events.map(event => event.type)).toEqual(expect.arrayContaining(["interview", "assessment"]));
  });

  it("persists email templates, drafts, queued messages, and sender settings without sending", async () => {
    const template = await emailService.createEmailTemplate(contextA(), {
      name: "Phase 2B Interview Invite",
      category: "Interview",
      description: "Integration test template",
      subject: "Interview for {{job_title}}",
      body: "Hi {{candidate_name}}, this is a persisted template body for the Phase 2B test."
    });
    expect((await emailService.listEmailTemplates(orgA)).map(item => item.id)).toContain(template.id);
    expect(await emailService.getEmailTemplate(orgB, template.id)).toBeNull();

    const updated = await emailService.updateEmailTemplate(contextA(), template.id, {
      name: "Phase 2B Interview Invite",
      category: "Interview",
      description: "Updated integration test template",
      subject: "Updated interview for {{job_title}}",
      body: "Hi {{candidate_name}}, this is an updated persisted template body for Phase 2B."
    });
    expect(updated.subject).toContain("Updated interview");

    const draft = await emailService.createEmailMessage(contextA(), {
      applicationId: applicationA,
      templateId: template.id,
      subject: "Draft interview message",
      body: "This is a persisted draft body that is long enough for validation.",
      attachments: ["notes.pdf"],
      mode: "draft"
    });
    expect(draft.status).toBe("Draft");
    expect(draft.isDemo).toBe(false);

    const queued = await emailService.createEmailMessage(contextA(), {
      applicationId: applicationA,
      templateId: template.id,
      subject: "Queued interview message",
      body: "This is a persisted queued body that is long enough for validation.",
      mode: "queue"
    });
    expect(queued.status).toBe("Queued");
    expect(queued.attempts).toBe(0);
    expect(queued.maxAttempts).toBeGreaterThan(0);
    expect(await emailService.getEmailMessage(orgB, queued.id)).toBeNull();

    const messages = await emailService.listEmailMessages(orgA);
    expect(messages.find(item => item.id === queued.id)?.status).toBe("Queued");
    expect(messages.some(item => item.status === "Sent")).toBe(false);

    const settings = await emailService.updateMailSettings(contextA(), {
      senderName: "Phase 2B Talent",
      senderAddress: "talent@example.com",
      replyTo: "reply@example.com",
      signature: "Regards,\nPhase 2B Talent"
    });
    expect(settings.provider).toBe("Not connected");
    expect((await emailService.getMailSettings(orgA)).senderName).toBe("Phase 2B Talent");
  });
});
