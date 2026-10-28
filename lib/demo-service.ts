import {
  DEMO_COMPANY,
  DEMO_TODAY
} from "@/lib/demo-data";
import type {
  Application,
  ApplicationStage,
  Candidate,
  DemoStore,
  EmailMessage,
  EmailStatus,
  Interview,
  Job
} from "@/lib/domain";
import { formatDate, formatTime } from "@/lib/format";

export interface ApplicationRecord {
  application: Application;
  candidate: Candidate;
  job: Job;
  interview?: Interview;
  score?: number;
}

export function buildApplicationRecords(store: DemoStore): ApplicationRecord[] {
  const records: ApplicationRecord[] = [];
  for (const application of store.applications) {
    const candidate = store.candidates.find(item => item.id === application.candidateId);
    const job = store.jobs.find(item => item.id === application.jobId);
    if (!candidate || !job) continue;
    const interview = store.interviews.find(item => item.applicationId === application.id);
    const assessment = store.assessments.find(item => item.applicationId === application.id);
    records.push({ application, candidate, job, interview, score: assessment?.overallScore });
  }
  return records.sort((a, b) => b.application.appliedAt.localeCompare(a.application.appliedAt));
}

export function getApplicationRecord(store: DemoStore, id: string) {
  return buildApplicationRecords(store).find(item => item.application.id === id);
}

export function countByStage(records: ApplicationRecord[]): Record<ApplicationStage, number> {
  return {
    New: records.filter(item => item.application.stage === "New").length,
    "In Review": records.filter(item => item.application.stage === "In Review").length,
    Shortlisted: records.filter(item => item.application.stage === "Shortlisted").length,
    Interview: records.filter(item => item.application.stage === "Interview").length,
    Selected: records.filter(item => item.application.stage === "Selected").length,
    Rejected: records.filter(item => item.application.stage === "Rejected").length
  };
}

export function upcomingInterviews(store: DemoStore) {
  return store.interviews
    .filter(item => item.status === "Scheduled" && item.scheduledAt.slice(0, 10) >= DEMO_TODAY)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export function isUpcoming(interview: Interview) {
  return interview.status === "Scheduled" && interview.scheduledAt.slice(0, 10) >= DEMO_TODAY;
}

export function interviewRecord(store: DemoStore, interview: Interview) {
  return {
    interview,
    application: store.applications.find(item => item.id === interview.applicationId),
    candidate: store.candidates.find(item => item.id === interview.candidateId),
    job: store.jobs.find(item => item.id === interview.jobId),
    assessment: store.assessments.find(item => item.id === interview.assessmentId)
  };
}

export function jobApplicantCount(store: DemoStore, jobId: string) {
  return store.applications.filter(item => item.jobId === jobId).length;
}

export function emailStats(emails: EmailMessage[]) {
  const count = (status: EmailStatus) => emails.filter(item => item.status === status).length;
  return {
    total: emails.length,
    sent: count("Sent"),
    pending: count("Pending"),
    failed: count("Failed"),
    drafts: count("Draft")
  };
}

export function applicationSearchText(record: ApplicationRecord) {
  return [
    record.candidate.name,
    record.candidate.email,
    record.job.title,
    record.job.department,
    record.application.stage,
    record.application.source
  ]
    .join(" ")
    .toLowerCase();
}

export interface ApplicationFilters {
  q?: string;
  stage?: string;
  job?: string;
  department?: string;
  date?: string;
}

export function filterApplicationRecords(records: ApplicationRecord[], filters: ApplicationFilters) {
  const q = filters.q?.trim().toLowerCase() ?? "";
  return records.filter(record => {
    if (q && !applicationSearchText(record).includes(q)) return false;
    if (filters.stage && filters.stage !== "All" && record.application.stage !== filters.stage) return false;
    if (filters.job && filters.job !== "All" && record.application.jobId !== filters.job) return false;
    if (filters.department && filters.department !== "All" && record.job.department !== filters.department) return false;
    if (filters.date && filters.date !== "All") {
      const days = filters.date === "7 days" ? 7 : filters.date === "30 days" ? 30 : 0;
      if (days) {
        const applied = new Date(`${record.application.appliedAt.slice(0, 10)}T00:00:00Z`).getTime();
        const today = new Date(`${DEMO_TODAY}T00:00:00Z`).getTime();
        if (today - applied > days * 86_400_000) return false;
      }
    }
    return true;
  });
}

export interface TemplateVariables {
  candidate_name: string;
  candidate_first_name: string;
  job_title: string;
  company_name: string;
  interview_date: string;
  interview_time: string;
  sender_name: string;
}

export function templateVariables(
  record: ApplicationRecord | undefined,
  senderName: string,
  interview?: Interview
): TemplateVariables {
  return {
    candidate_name: record?.candidate.name ?? "Candidate",
    candidate_first_name: record?.candidate.name.split(/\s+/)[0] ?? "there",
    job_title: record?.job.title ?? "the role",
    company_name: DEMO_COMPANY,
    interview_date: interview ? formatDate(interview.scheduledAt) : "{{interview_date}}",
    interview_time: interview ? formatTime(interview.scheduledAt) : "{{interview_time}}",
    sender_name: senderName || "Nexora Talent"
  };
}

export function renderTemplate(text: string, variables: TemplateVariables) {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = variables[key as keyof TemplateVariables];
    return value ?? match;
  });
}

export function emailSearchText(email: EmailMessage) {
  return [email.recipientName, email.recipientEmail, email.subject, email.templateId ?? "", email.status]
    .join(" ")
    .toLowerCase();
}

export function filterEmails(
  emails: EmailMessage[],
  filters: { q?: string; status?: string; template?: string }
) {
  const q = filters.q?.trim().toLowerCase() ?? "";
  return emails
    .filter(email => {
      if (q && !emailSearchText(email).includes(q)) return false;
      if (filters.status && filters.status !== "All" && email.status !== filters.status) return false;
      if (filters.template && filters.template !== "All" && email.templateId !== filters.template) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function stageTone(stage: ApplicationStage) {
  switch (stage) {
    case "Selected":
      return "mint";
    case "Rejected":
      return "rose";
    case "Interview":
      return "violet";
    case "Shortlisted":
      return "sky";
    case "In Review":
      return "amber";
    default:
      return "slate";
  }
}

export function emailTone(status: EmailStatus) {
  switch (status) {
    case "Sent":
      return "mint";
    case "Failed":
      return "rose";
    case "Pending":
      return "amber";
    default:
      return "slate";
  }
}
