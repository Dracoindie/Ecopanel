import type { FinalAssessment } from "@/lib/types";

export type JobStatus = "Draft" | "Published" | "Closed";
export type ApplicationStage = "New" | "In Review" | "Shortlisted" | "Interview" | "Selected" | "Rejected";
export type InterviewStatus = "Scheduled" | "Completed" | "Cancelled";
export type EmploymentType = "Full-time" | "Contract" | "Part-time" | "Internship";
export type Workplace = "Remote" | "Hybrid" | "On-site";
export type EmailStatus = "Draft" | "Queued" | "Sending" | "Sent" | "Delivered" | "Bounced" | "Complained" | "Failed" | "Cancelled" | "Pending";

export interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  workplace: Workplace;
  employmentType: EmploymentType;
  shortDescription: string;
  description: string;
  responsibilities: string[];
  qualifications: string[];
  salaryRange: string;
  status: JobStatus;
  publicVisible: boolean;
  publishedAt: string | null;
  createdAt: string;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
}

export interface CvMetadata {
  fileName: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  storageStatus: "Not uploaded — demo only" | "Private storage" | "Pending scan" | "Blocked";
  cvId?: string;
  scanStatus?: "UNSCANNED" | "PENDING" | "CLEAN" | "INFECTED" | "SCAN_FAILED";
  downloadUrl?: string;
  downloadable?: boolean;
}

export interface HrNote {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export type ApplicationEventType = "application" | "status" | "note" | "email" | "interview" | "assessment";

export interface ApplicationEvent {
  id: string;
  type: ApplicationEventType;
  label: string;
  detail: string;
  createdAt: string;
  actor: string;
}

export interface DemoAssessment extends FinalAssessment {
  id: string;
  applicationId: string;
  interviewId: string;
  status: "Available";
  generatedAt: string;
  isDemo: true;
}

export interface Application {
  id: string;
  candidateId: string;
  jobId: string;
  appliedAt: string;
  stage: ApplicationStage;
  source: string;
  coverLetter: string;
  cv: CvMetadata;
  notes: HrNote[];
  history: ApplicationEvent[];
}

export interface InterviewCalendarSync {
  id: string;
  operation: string;
  status: string;
  htmlLink: string | null;
  externalStatus: string | null;
  notificationPolicy: string;
  notificationRequestedAt: string | null;
  lastSyncedAt: string | null;
  attempts: number;
  maxAttempts: number;
  failureCode: string | null;
  lastError: string | null;
  canRetry: boolean;
  version: number;
}

export interface Interview {
  id: string;
  applicationId: string;
  candidateId: string;
  jobId: string;
  scheduledAt: string;
  durationMinutes: number;
  timezone: string;
  round: string;
  status: InterviewStatus;
  assessmentId?: string;
  notes: string;
  calendarSync?: InterviewCalendarSync | null;
}

export interface EmailTemplate {
  id: string;
  name: string;
  category: "Application" | "Shortlist" | "Interview" | "Outcome";
  description: string;
  subject: string;
  body: string;
  updatedAt: string;
}

export interface EmailMessage {
  id: string;
  candidateId: string;
  applicationId: string;
  jobId: string;
  templateId: string | null;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  body: string;
  preview: string;
  status: EmailStatus;
  createdAt: string;
  isDemo: true;
  attachments: string[];
}

export interface MailSettings {
  senderName: string;
  senderAddress: string;
  replyTo: string;
  provider: "Not connected";
  deliveryStatus: "Demo mode";
  signature: string;
}

export interface DemoStore {
  jobs: Job[];
  candidates: Candidate[];
  applications: Application[];
  interviews: Interview[];
  assessments: DemoAssessment[];
  templates: EmailTemplate[];
  emails: EmailMessage[];
  mailSettings: MailSettings;
}

export interface NewApplicationInput {
  jobId: string;
  name: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  coverLetter: string;
  cv: Omit<CvMetadata, "uploadedAt" | "storageStatus">;
}

export interface NewJobInput {
  title: string;
  department: string;
  location: string;
  workplace: Workplace;
  employmentType: EmploymentType;
  shortDescription: string;
  description: string;
  responsibilities: string[];
  qualifications: string[];
  salaryRange: string;
  status: JobStatus;
  publicVisible: boolean;
}

export interface ScheduleInterviewInput {
  applicationId: string;
  scheduledAt: string;
  durationMinutes: number;
  timezone: string;
  round: string;
  notes?: string;
  calendarNotify?: boolean;
}

export interface EmailSendInput {
  candidateIds: string[];
  templateId: string | null;
  subject: string;
  body: string;
  attachments: string[];
  asDraft?: boolean;
}

export const APPLICATION_STAGES: ApplicationStage[] = [
  "New",
  "In Review",
  "Shortlisted",
  "Interview",
  "Selected",
  "Rejected"
];

export const JOB_STATUSES: JobStatus[] = ["Draft", "Published", "Closed"];

export const TEMPLATE_PLACEHOLDERS = [
  "{{candidate_name}}",
  "{{candidate_first_name}}",
  "{{job_title}}",
  "{{company_name}}",
  "{{interview_date}}",
  "{{interview_time}}",
  "{{sender_name}}"
] as const;
