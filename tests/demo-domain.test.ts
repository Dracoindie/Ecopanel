import { describe, expect, it } from "vitest";
import {
  createDemoStore,
  DEMO_COMPANY,
  DEMO_TODAY,
  seedApplications,
  seedAssessments,
  seedCandidates,
  seedEmails,
  seedInterviews,
  seedJobs,
  seedMailSettings,
  seedTemplates
} from "@/lib/demo-data";
import {
  buildApplicationRecords,
  countByStage,
  emailStats,
  filterApplicationRecords,
  filterEmails,
  jobApplicantCount,
  renderTemplate,
  templateVariables,
  upcomingInterviews
} from "@/lib/demo-service";
import { TEMPLATE_PLACEHOLDERS } from "@/lib/domain";

describe("demo recruitment data", () => {
  it("provides the expected fictional dataset and company context", () => {
    expect(DEMO_COMPANY).toBe("Nexora Labs");
    expect(DEMO_TODAY).toBe("2026-10-25");
    expect(seedJobs).toHaveLength(9);
    expect(seedCandidates).toHaveLength(12);
    expect(seedApplications).toHaveLength(12);
    expect(seedAssessments.length).toBeGreaterThan(0);
    expect(seedInterviews.length).toBeGreaterThan(0);
    expect(seedTemplates).toHaveLength(9);
    expect(seedEmails.length).toBeGreaterThan(0);
    expect(seedMailSettings.provider).toBe("Not connected");
    expect(seedMailSettings.deliveryStatus).toBe("Demo mode");
  });

  it("keeps identifiers unique across each entity collection", () => {
    for (const collection of [seedJobs, seedCandidates, seedApplications, seedInterviews, seedAssessments, seedTemplates, seedEmails]) {
      const ids = collection.map(item => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("maintains relational integrity across applications and related records", () => {
    const candidateIds = new Set(seedCandidates.map(item => item.id));
    const jobIds = new Set(seedJobs.map(item => item.id));
    const applicationIds = new Set(seedApplications.map(item => item.id));

    for (const application of seedApplications) {
      expect(candidateIds.has(application.candidateId)).toBe(true);
      expect(jobIds.has(application.jobId)).toBe(true);
    }

    for (const interview of seedInterviews) {
      expect(applicationIds.has(interview.applicationId)).toBe(true);
      const application = seedApplications.find(item => item.id === interview.applicationId);
      expect(interview.candidateId).toBe(application?.candidateId);
      expect(interview.jobId).toBe(application?.jobId);
    }

    for (const assessment of seedAssessments) {
      expect(applicationIds.has(assessment.applicationId)).toBe(true);
    }

    for (const email of seedEmails) {
      expect(applicationIds.has(email.applicationId)).toBe(true);
      expect(candidateIds.has(email.candidateId)).toBe(true);
    }
  });

  it("creates isolated stores so mutations do not leak into seed data", () => {
    const first = createDemoStore();
    const second = createDemoStore();
    first.emails.pop();
    first.jobs[0].title = "Changed";
    expect(second.emails).toHaveLength(seedEmails.length);
    expect(second.jobs[0].title).toBe(seedJobs[0].title);
  });
});

describe("application queries", () => {
  const store = createDemoStore();
  const records = buildApplicationRecords(store);

  it("joins every valid application and sorts newest first", () => {
    expect(records).toHaveLength(seedApplications.length);
    expect(records.every(record => record.candidate && record.job)).toBe(true);
    for (let index = 1; index < records.length; index += 1) {
      expect(records[index - 1].application.appliedAt >= records[index].application.appliedAt).toBe(true);
    }
  });

  it("searches by candidate, role, department, and source", () => {
    const sample = records[0];
    expect(filterApplicationRecords(records, { q: sample.candidate.name }).some(record => record.application.id === sample.application.id)).toBe(true);
    expect(filterApplicationRecords(records, { q: sample.job.title }).every(record => `${record.job.title}`.toLowerCase().includes(sample.job.title.toLowerCase()))).toBe(true);
    expect(filterApplicationRecords(records, { department: sample.job.department }).every(record => record.job.department === sample.job.department)).toBe(true);
  });

  it("filters by stage and job without mutating the source list", () => {
    const sample = records[0];
    const byStage = filterApplicationRecords(records, { stage: sample.application.stage });
    const byJob = filterApplicationRecords(records, { job: sample.job.id });
    expect(byStage.length).toBeGreaterThan(0);
    expect(byStage.every(record => record.application.stage === sample.application.stage)).toBe(true);
    expect(byJob.every(record => record.job.id === sample.job.id)).toBe(true);
    expect(records).toHaveLength(seedApplications.length);
  });

  it("counts every pipeline stage and upcoming interviews deterministically", () => {
    const counts = countByStage(records);
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(records.length);
    expect(Object.keys(counts)).toEqual(["New", "In Review", "Shortlisted", "Interview", "Selected", "Rejected"]);
    expect(jobApplicantCount(store, seedJobs[0].id)).toBe(seedApplications.filter(item => item.jobId === seedJobs[0].id).length);
    expect(upcomingInterviews(store).every(item => item.status === "Scheduled" && item.scheduledAt.slice(0, 10) >= DEMO_TODAY)).toBe(true);
  });
});

describe("template rendering", () => {
  const store = createDemoStore();
  const record = buildApplicationRecords(store)[0];
  const variables = templateVariables(record, store.mailSettings.senderName);

  it("resolves supported placeholders for a selected candidate", () => {
    const text = renderTemplate("Hi {{candidate_first_name}} — {{job_title}} at {{company_name}}, from {{sender_name}}.", variables);
    expect(text).toContain(record.candidate.name.split(/\s+/)[0]);
    expect(text).toContain(record.job.title);
    expect(text).toContain(DEMO_COMPANY);
    expect(text).toContain(store.mailSettings.senderName);
    expect(text).not.toContain("{{");
  });

  it("keeps unknown placeholders visible and formats interview context when available", () => {
    expect(renderTemplate("Unknown {{not_a_field}}", variables)).toBe("Unknown {{not_a_field}}");
    const interview = store.interviews.find(item => item.applicationId === record.application.id);
    if (interview) {
      const withInterview = templateVariables(record, store.mailSettings.senderName, interview);
      expect(withInterview.interview_date).not.toBe("{{interview_date}}");
      expect(withInterview.interview_time).not.toBe("{{interview_time}}");
    }
  });

  it("uses only supported placeholders in seeded templates", () => {
    const supported = new Set<string>(TEMPLATE_PLACEHOLDERS);
    for (const template of seedTemplates) {
      const found = `${template.subject} ${template.body}`.match(/\{\{\w+\}\}/g) ?? [];
      for (const placeholder of found) expect(supported.has(placeholder)).toBe(true);
    }
  });
});

describe("email activity helpers", () => {
  const store = createDemoStore();

  it("summarizes statuses without inventing additional messages", () => {
    const stats = emailStats(store.emails);
    expect(stats.total).toBe(store.emails.length);
    expect(stats.sent + stats.pending + stats.failed + stats.drafts).toBe(stats.total);
  });

  it("filters by search, status, and template", () => {
    const sample = store.emails[0];
    expect(filterEmails(store.emails, { q: sample.recipientName }).some(item => item.id === sample.id)).toBe(true);
    expect(filterEmails(store.emails, { status: sample.status }).every(item => item.status === sample.status)).toBe(true);
    const withTemplate = filterEmails(store.emails, { template: sample.templateId ?? "All" });
    expect(withTemplate.length).toBeGreaterThan(0);
    expect(withTemplate.every(item => item.templateId === sample.templateId)).toBe(true);
  });
});
