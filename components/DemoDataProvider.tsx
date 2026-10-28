"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { createDemoStore, seedTemplates } from "@/lib/demo-data";
import type {
  Application,
  ApplicationStage,
  DemoStore,
  EmailMessage,
  EmailSendInput,
  EmailTemplate,
  Interview,
  Job,
  MailSettings,
  NewApplicationInput,
  NewJobInput,
  ScheduleInterviewInput
} from "@/lib/domain";

interface DemoDataContextValue extends DemoStore {
  createApplication: (input: NewApplicationInput) => Application;
  updateApplicationStage: (applicationId: string, stage: ApplicationStage) => void;
  bulkUpdateApplicationStage: (applicationIds: string[], stage: ApplicationStage) => void;
  addApplicationNote: (applicationId: string, body: string) => void;
  createJob: (input: NewJobInput) => Job;
  updateJob: (jobId: string, input: NewJobInput) => Job | undefined;
  setJobStatus: (jobId: string, status: Job["status"]) => void;
  scheduleInterview: (input: ScheduleInterviewInput) => Interview | undefined;
  rescheduleInterview: (interviewId: string, input: Omit<ScheduleInterviewInput, "applicationId">) => void;
  cancelInterview: (interviewId: string) => void;
  sendEmail: (input: EmailSendInput) => EmailMessage[];
  updateTemplate: (templateId: string, updates: Pick<EmailTemplate, "name" | "subject" | "body">) => void;
  resetTemplate: (templateId: string) => void;
  updateMailSettings: (settings: MailSettings) => void;
}

const DemoDataContext = createContext<DemoDataContextValue | null>(null);

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const nowIso = () => new Date().toISOString();
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "role";

export function DemoDataProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<DemoStore>(createDemoStore);

  const value = useMemo<DemoDataContextValue>(() => {
    const createApplication = (input: NewApplicationInput) => {
      const applicationId = newId("app");
      const candidateId = store.candidates.find(
        candidate => candidate.email.toLowerCase() === input.email.trim().toLowerCase()
      )?.id ?? newId("cand");
      const appliedAt = nowIso();
      setStore(current => {
        const existing = current.candidates.find(
          candidate => candidate.email.toLowerCase() === input.email.trim().toLowerCase()
        );
        const candidate = {
          id: existing?.id ?? candidateId,
          name: input.name.trim(),
          email: input.email.trim(),
          phone: input.phone.trim(),
          location: "Not provided",
          headline: `Candidate for ${current.jobs.find(job => job.id === input.jobId)?.title ?? "an open role"}`,
          linkedinUrl: input.linkedinUrl.trim(),
          githubUrl: input.githubUrl.trim(),
          portfolioUrl: input.portfolioUrl.trim()
        };
        const application: Application = {
          id: applicationId,
          candidateId: candidate.id,
          jobId: input.jobId,
          appliedAt,
          stage: "New",
          source: "Careers site",
          coverLetter: input.coverLetter.trim(),
          cv: {
            ...input.cv,
            uploadedAt: appliedAt,
            storageStatus: "Not uploaded — demo only"
          },
          notes: [],
          history: [
            {
              id: newId("evt"),
              type: "application",
              label: "Application received",
              detail: "Submitted through the public careers site",
              createdAt: appliedAt,
              actor: "Candidate"
            }
          ]
        };
        return {
          ...current,
          candidates: existing ? current.candidates : [...current.candidates, candidate],
          applications: [application, ...current.applications]
        };
      });
      const created: Application = {
        id: applicationId,
        candidateId,
        jobId: input.jobId,
        appliedAt,
        stage: "New",
        source: "Careers site",
        coverLetter: input.coverLetter,
        cv: { ...input.cv, uploadedAt: appliedAt, storageStatus: "Not uploaded — demo only" },
        notes: [],
        history: []
      };
      return created;
    };

    const updateApplicationStage = (applicationId: string, stage: ApplicationStage) => {
      const createdAt = nowIso();
      setStore(current => ({
        ...current,
        applications: current.applications.map(application => {
          if (application.id !== applicationId || application.stage === stage) return application;
          return {
            ...application,
            stage,
            history: [
              ...application.history,
              {
                id: newId("evt"),
                type: "status",
                label: `Moved to ${stage}`,
                detail: "Demo pipeline status updated by recruiter",
                createdAt,
                actor: "Maya Chen"
              }
            ]
          };
        })
      }));
    };

    const bulkUpdateApplicationStage = (applicationIds: string[], stage: ApplicationStage) => {
      const ids = new Set(applicationIds);
      const createdAt = nowIso();
      setStore(current => ({
        ...current,
        applications: current.applications.map(application => {
          if (!ids.has(application.id) || application.stage === stage) return application;
          return {
            ...application,
            stage,
            history: [
              ...application.history,
              {
                id: newId("evt"),
                type: "status",
                label: `Moved to ${stage}`,
                detail: "Demo pipeline bulk update",
                createdAt,
                actor: "Maya Chen"
              }
            ]
          };
        })
      }));
    };

    const addApplicationNote = (applicationId: string, body: string) => {
      const note = { id: newId("note"), author: "Maya Chen", body: body.trim(), createdAt: nowIso() };
      if (!note.body) return;
      setStore(current => ({
        ...current,
        applications: current.applications.map(application =>
          application.id === applicationId
            ? {
                ...application,
                notes: [note, ...application.notes],
                history: [
                  ...application.history,
                  {
                    id: newId("evt"),
                    type: "note",
                    label: "Private note added",
                    detail: "Recruiter note saved in demo workspace",
                    createdAt: note.createdAt,
                    actor: "Maya Chen"
                  }
                ]
              }
            : application
        )
      }));
    };

    const createJob = (input: NewJobInput) => {
      const createdAt = nowIso();
      const job: Job = {
        ...input,
        id: `${slug(input.title)}-${Date.now().toString(36).slice(-4)}`,
        publishedAt: input.status === "Published" ? createdAt : null,
        createdAt
      };
      setStore(current => ({ ...current, jobs: [job, ...current.jobs] }));
      return job;
    };

    const updateJob = (jobId: string, input: NewJobInput) => {
      let updated: Job | undefined;
      setStore(current => ({
        ...current,
        jobs: current.jobs.map(job => {
          if (job.id !== jobId) return job;
          updated = {
            ...job,
            ...input,
            publishedAt:
              input.status === "Published" ? job.publishedAt ?? nowIso() : input.status === "Draft" ? null : job.publishedAt
          };
          return updated;
        })
      }));
      return updated;
    };

    const setJobStatus = (jobId: string, status: Job["status"]) => {
      setStore(current => ({
        ...current,
        jobs: current.jobs.map(job =>
          job.id === jobId
              ? {
                ...job,
                status,
                publicVisible: status === "Published",
                publishedAt: status === "Published" ? job.publishedAt ?? nowIso() : job.publishedAt
              }
            : job
        )
      }));
    };

    const scheduleInterview = (input: ScheduleInterviewInput) => {
      const application = store.applications.find(item => item.id === input.applicationId);
      if (!application) return undefined;
      const interview: Interview = {
        id: newId("int"),
        applicationId: application.id,
        candidateId: application.candidateId,
        jobId: application.jobId,
        scheduledAt: input.scheduledAt,
        durationMinutes: input.durationMinutes,
        timezone: input.timezone,
        round: input.round,
        status: "Scheduled",
        notes: input.notes ?? ""
      };
      const createdAt = nowIso();
      setStore(current => ({
        ...current,
        interviews: [interview, ...current.interviews],
        applications: current.applications.map(item =>
          item.id === application.id
            ? {
                ...item,
                stage: ["Selected", "Rejected", "Interview"].includes(item.stage) ? item.stage : "Interview",
                history: [
                  ...item.history,
                  {
                    id: newId("evt"),
                    type: "interview",
                    label: "Interview scheduled",
                    detail: `${input.round} · ${input.scheduledAt.slice(0, 16).replace("T", " ")}`,
                    createdAt,
                    actor: "Maya Chen"
                  }
                ]
              }
            : item
        )
      }));
      return interview;
    };

    const rescheduleInterview = (interviewId: string, input: Omit<ScheduleInterviewInput, "applicationId">) => {
      const createdAt = nowIso();
      setStore(current => {
        const interview = current.interviews.find(item => item.id === interviewId);
        if (!interview) return current;
        return {
          ...current,
          interviews: current.interviews.map(item =>
            item.id === interviewId
              ? {
                  ...item,
                  scheduledAt: input.scheduledAt,
                  durationMinutes: input.durationMinutes,
                  timezone: input.timezone,
                  round: input.round,
                  notes: input.notes ?? item.notes,
                  status: "Scheduled"
                }
              : item
          ),
          applications: current.applications.map(application =>
            application.id === interview.applicationId
              ? {
                  ...application,
                  history: [
                    ...application.history,
                    {
                      id: newId("evt"),
                      type: "interview",
                      label: "Interview rescheduled",
                      detail: `${input.round} · ${input.scheduledAt.slice(0, 16).replace("T", " ")}`,
                      createdAt,
                      actor: "Maya Chen"
                    }
                  ]
                }
              : application
          )
        };
      });
    };

    const cancelInterview = (interviewId: string) => {
      const createdAt = nowIso();
      setStore(current => {
        const interview = current.interviews.find(item => item.id === interviewId);
        if (!interview) return current;
        return {
          ...current,
          interviews: current.interviews.map(item =>
            item.id === interviewId ? { ...item, status: "Cancelled" } : item
          ),
          applications: current.applications.map(application =>
            application.id === interview.applicationId
              ? {
                  ...application,
                  history: [
                    ...application.history,
                    {
                      id: newId("evt"),
                      type: "interview",
                      label: "Interview cancelled",
                      detail: "Demo interview cancelled; no calendar notice was delivered",
                      createdAt,
                      actor: "Maya Chen"
                    }
                  ]
                }
              : application
          )
        };
      });
    };

    const sendEmail = (input: EmailSendInput) => {
      const createdAt = nowIso();
      const messages: EmailMessage[] = input.candidateIds.flatMap(candidateId => {
        const application = store.applications.find(item => item.candidateId === candidateId);
        const candidate = store.candidates.find(item => item.id === candidateId);
        if (!application || !candidate) return [];
        return [
          {
            id: newId("email"),
            candidateId,
            applicationId: application.id,
            jobId: application.jobId,
            templateId: input.templateId,
            recipientName: candidate.name,
            recipientEmail: candidate.email,
            subject: input.subject,
            body: input.body,
            preview: input.body.replace(/\s+/g, " ").trim().slice(0, 180),
            status: input.asDraft ? "Draft" : "Sent",
            createdAt,
            isDemo: true as const,
            attachments: [...input.attachments]
          }
        ];
      });
      if (!messages.length) return [];
      setStore(current => ({
        ...current,
        emails: [...messages, ...current.emails],
        applications: current.applications.map(application => {
          const message = messages.find(item => item.applicationId === application.id);
          if (!message) return application;
          return {
            ...application,
            history: [
              ...application.history,
              {
                id: newId("evt"),
                type: "email",
                label: input.asDraft ? "Email draft saved" : "Email simulated",
                detail: `${message.subject} · demo only`,
                createdAt,
                actor: "Maya Chen"
              }
            ]
          };
        })
      }));
      return messages;
    };

    const updateTemplate = (
      templateId: string,
      updates: Pick<EmailTemplate, "name" | "subject" | "body">
    ) => {
      setStore(current => ({
        ...current,
        templates: current.templates.map(template =>
          template.id === templateId ? { ...template, ...updates, updatedAt: nowIso() } : template
        )
      }));
    };

    const resetTemplate = (templateId: string) => {
      const seed = seedTemplates.find(template => template.id === templateId);
      if (!seed) return;
      setStore(current => ({
        ...current,
        templates: current.templates.map(template =>
          template.id === templateId ? { ...seed } : template
        )
      }));
    };

    const updateMailSettings = (settings: MailSettings) => {
      setStore(current => ({ ...current, mailSettings: { ...settings } }));
    };

    return {
      ...store,
      createApplication,
      updateApplicationStage,
      bulkUpdateApplicationStage,
      addApplicationNote,
      createJob,
      updateJob,
      setJobStatus,
      scheduleInterview,
      rescheduleInterview,
      cancelInterview,
      sendEmail,
      updateTemplate,
      resetTemplate,
      updateMailSettings
    };
  }, [store]);

  return <DemoDataContext.Provider value={value}>{children}</DemoDataContext.Provider>;
}

export function useDemoData() {
  const value = useContext(DemoDataContext);
  if (!value) throw new Error("useDemoData must be used inside DemoDataProvider");
  return value;
}
