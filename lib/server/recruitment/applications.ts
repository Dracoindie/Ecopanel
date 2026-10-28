import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getPrisma } from "@/lib/server/db";
import { cvStorageStatusLabel } from "@/lib/server/cv/policy";
import { isCvScannerConfigured, type CvScanStatus } from "@/lib/server/cv/scanner";
import { getCvStorage } from "@/lib/server/cv/storage";
import { CvValidationError, validateCvFile, type ValidatedCv } from "@/lib/server/cv/validation";
import { enqueueHiringNotification } from "@/lib/server/email/notifications";

export const CONSENT_VERSION = process.env.CONSENT_VERSION?.trim() || "2026-10-26";

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine(value => !value || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(value), "Use a full URL beginning with http:// or https://.");

const publicApplicationSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  phone: z.string().trim().min(7, "Enter a valid phone number.").max(30).refine(value => value.replace(/\D/g, "").length >= 7, "Enter a valid phone number."),
  linkedinUrl: optionalUrl.default(""),
  githubUrl: optionalUrl.default(""),
  portfolioUrl: optionalUrl.default(""),
  coverLetter: z.string().trim().min(40, "Add at least 40 characters.").max(5000),
  consent: z.union([z.literal("on"), z.literal("true")])
});

export type PublicApplicationInput = z.infer<typeof publicApplicationSchema>;

export interface PublicApplicationSummary {
  publicReference: string;
  jobTitle: string;
  candidateName: string;
  submittedAt: string;
  cvStatus: string;
}

export class PublicApplicationError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "PublicApplicationError";
  }
}

function normalizeEmail(email: string) {
  return email.trim().normalize("NFKC").toLowerCase();
}

function normalizeName(name: string) {
  return name.trim().normalize("NFKC").replace(/\s+/g, " ").toLowerCase();
}

function summaryFromRecord(record: {
  publicReference: string;
  appliedAt: Date;
  candidate: { name: string };
  job: { title: string };
  cvFile: { scanStatus: string } | null;
}): PublicApplicationSummary {
  return {
    publicReference: record.publicReference,
    jobTitle: record.job.title,
    candidateName: record.candidate.name,
    submittedAt: record.appliedAt.toISOString(),
    cvStatus: record.cvFile ? cvStorageStatusLabel(record.cvFile.scanStatus as CvScanStatus) : "No CV attached"
  };
}

export function parsePublicApplicationForm(formData: FormData) {
  const values = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    linkedinUrl: String(formData.get("linkedinUrl") ?? ""),
    githubUrl: String(formData.get("githubUrl") ?? ""),
    portfolioUrl: String(formData.get("portfolioUrl") ?? ""),
    coverLetter: String(formData.get("coverLetter") ?? ""),
    consent: String(formData.get("consent") ?? "")
  };
  const parsed = publicApplicationSchema.safeParse(values);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new PublicApplicationError(first?.message || "Check the application details.", 400, "INVALID_APPLICATION");
  }
  const file = formData.get("cv");
  if (!(file instanceof File)) {
    throw new PublicApplicationError("Attach your CV as a PDF, DOC, or DOCX file.", 400, "CV_REQUIRED");
  }
  const jobId = String(formData.get("jobId") ?? "");
  return { input: parsed.data, file, jobId };
}

function validateIdempotencyKey(value: string | null) {
  if (!value) {
    throw new PublicApplicationError("An Idempotency-Key header is required for application submissions.", 400, "IDEMPOTENCY_KEY_REQUIRED");
  }
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
    throw new PublicApplicationError("The Idempotency-Key is invalid.", 400, "INVALID_IDEMPOTENCY_KEY");
  }
  return value;
}


function isPrismaError(error: unknown, code: string) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function uniqueTarget(error: unknown) {
  if (!isPrismaError(error, "P2002")) return "";
  const meta = (error as Prisma.PrismaClientKnownRequestError).meta;
  if (!meta) return "";
  if (Array.isArray(meta.target)) return meta.target.map(String).join(",");
  return typeof meta.target === "string" ? meta.target : "";
}

export async function submitPublicApplication(input: {
  jobId: string;
  formData: FormData;
  idempotencyKey: string | null;
}): Promise<{ summary: PublicApplicationSummary; duplicate: boolean }> {
  const key = validateIdempotencyKey(input.idempotencyKey);
  const prisma = getPrisma();

  const existingByKey = await prisma.application.findUnique({
    where: { idempotencyKey: key },
    include: { candidate: true, job: true, cvFile: true }
  });
  if (existingByKey) {
    if (existingByKey.jobId !== input.jobId) {
      throw new PublicApplicationError("This Idempotency-Key was already used for a different role.", 409, "IDEMPOTENCY_CONFLICT");
    }
    return { summary: summaryFromRecord(existingByKey), duplicate: true };
  }

  const job = await prisma.job.findFirst({
    where: { id: input.jobId, status: "Published", publicVisible: true }
  });
  if (!job) {
    throw new PublicApplicationError("This role is not accepting applications.", 404, "JOB_NOT_OPEN");
  }

  const { input: values, file, jobId } = parsePublicApplicationForm(input.formData);
  if (jobId && jobId !== input.jobId) {
    throw new PublicApplicationError("The application does not match this role.", 400, "JOB_MISMATCH");
  }

  let cv: ValidatedCv;
  try {
    cv = await validateCvFile(file);
  } catch (error) {
    if (error instanceof CvValidationError) {
      throw new PublicApplicationError(error.message, error.code === "CV_TOO_LARGE" ? 413 : 400, error.code);
    }
    throw error;
  }

  const emailNormalized = normalizeEmail(values.email);
  const nameNormalized = normalizeName(values.name);
  const existingCandidate = await prisma.candidate.findUnique({
    where: { organizationId_emailNormalized: { organizationId: job.organizationId, emailNormalized } }
  });
  if (existingCandidate && normalizeName(existingCandidate.name) !== nameNormalized) {
    throw new PublicApplicationError(
      "An application already exists for this email with a different name. Please use the same name or contact the hiring team.",
      409,
      "CANDIDATE_NAME_CONFLICT"
    );
  }

  const storage = getCvStorage();
  const stored = await storage.put({ organizationId: job.organizationId, kind: cv.kind, buffer: cv.buffer });
  const initialScanStatus: CvScanStatus = isCvScannerConfigured() ? "PENDING" : "UNSCANNED";
  let keepStoredFile = false;

  try {
    let reusableCandidate = existingCandidate;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const candidateAtAttempt = reusableCandidate ?? await prisma.candidate.findUnique({
          where: { organizationId_emailNormalized: { organizationId: job.organizationId, emailNormalized } }
        });
        if (candidateAtAttempt && normalizeName(candidateAtAttempt.name) !== nameNormalized) {
          throw new PublicApplicationError(
            "An application already exists for this email with a different name. Please use the same name or contact the hiring team.",
            409,
            "CANDIDATE_NAME_CONFLICT"
          );
        }

        const application = await prisma.$transaction(async tx => {
          const candidate = candidateAtAttempt ?? await tx.candidate.create({
            data: {
              organizationId: job.organizationId,
              name: values.name.trim().replace(/\s+/g, " "),
              email: values.email.trim(),
              emailNormalized,
              phone: values.phone.trim(),
              linkedinUrl: values.linkedinUrl,
              githubUrl: values.githubUrl,
              portfolioUrl: values.portfolioUrl
            }
          });

          const created = await tx.application.create({
            data: {
              organizationId: job.organizationId,
              jobId: job.id,
              candidateId: candidate.id,
              stage: "New",
              source: "Careers site",
              coverLetter: values.coverLetter,
              consentVersion: CONSENT_VERSION,
              consentAt: new Date(),
              idempotencyKey: key,
              cvFile: {
                create: {
                  organizationId: job.organizationId,
                  storageKey: stored.key,
                  originalFilename: cv.originalFilename,
                  mimeType: cv.mimeType,
                  sizeBytes: stored.sizeBytes,
                  checksum: cv.checksum,
                  scanStatus: initialScanStatus
                }
              },
              events: {
                create: {
                  organizationId: job.organizationId,
                  type: "application",
                  label: "Application received",
                  detail: `Applied for ${job.title} through the careers site.`,
                  actorLabel: "Candidate"
                }
              }
            },
            include: { candidate: true, job: true, cvFile: true }
          });

          // Durable work is recorded in the same transaction as the CV record.
          // The worker, not this request, performs the scan.
          if (initialScanStatus === "PENDING" && created.cvFile) {
            await tx.cvScanJob.create({
              data: {
                cvFileId: created.cvFile.id,
                organizationId: job.organizationId,
                status: "PENDING"
              }
            });
          }

          // The receipt is part of the same committed outbox transaction. It is
          // never sent inline, so a provider outage cannot lose the notification.
          await enqueueHiringNotification(tx, {
            organizationId: job.organizationId,
            applicationId: created.id,
            kind: "application_received",
            actorLabel: "Careers site"
          });
          return created;
        });

        keepStoredFile = true;
        return { summary: summaryFromRecord(application), duplicate: false };
      } catch (error) {
        const target = uniqueTarget(error);
        if (target.includes("idempotencyKey")) {
          const duplicate = await prisma.application.findUnique({
            where: { idempotencyKey: key },
            include: { candidate: true, job: true, cvFile: true }
          });
          if (duplicate) {
            return { summary: summaryFromRecord(duplicate), duplicate: true };
          }
        }
        if (target.includes("jobId") || target.includes("candidateId")) {
          throw new PublicApplicationError("You have already applied for this role with this email address.", 409, "APPLICATION_EXISTS");
        }
        if (target.includes("emailNormalized") && attempt === 0) {
          reusableCandidate = await prisma.candidate.findUnique({
            where: { organizationId_emailNormalized: { organizationId: job.organizationId, emailNormalized } }
          });
          if (!reusableCandidate) throw error;
          if (normalizeName(reusableCandidate.name) !== nameNormalized) {
            throw new PublicApplicationError(
              "An application already exists for this email with a different name. Please use the same name or contact the hiring team.",
              409,
              "CANDIDATE_NAME_CONFLICT"
            );
          }
          continue;
        }
        throw error;
      }
    }

    throw new PublicApplicationError("Could not complete the application. Please try again.", 409, "APPLICATION_RACE");
  } finally {
    if (!keepStoredFile) {
      await storage.delete(stored.key).catch(() => undefined);
    }
  }
}

export async function getPublicApplicationStatus(reference: string): Promise<PublicApplicationSummary | null> {
  const record = await getPrisma().application.findUnique({
    where: { publicReference: reference },
    include: { candidate: true, job: true, cvFile: true }
  });
  return record ? summaryFromRecord(record) : null;
}
