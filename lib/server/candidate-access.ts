import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { configuredAppUrl, getAuthSecret } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";

/** Interview statuses a candidate can still join. */
const JOINABLE_STATUSES = new Set(["Scheduled"]);
export const CANDIDATE_SESSION_COOKIE = "ep_candidate_session";
export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
export const CANDIDATE_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
/** Stored in outbox bodies instead of the link; the email worker substitutes it at send time. */
export const INVITATION_LINK_PLACEHOLDER = "{{candidate_interview_link}}";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class CandidateAccessError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "CandidateAccessError";
  }
}

export interface CandidateSessionContext {
  sessionId: string;
  organizationId: string;
  interviewId: string;
  applicationId: string;
  expiresAt: Date;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function invitationKey() {
  return createHmac("sha256", getAuthSecret()).update("echopanel-candidate-invitation-v1").digest();
}

/**
 * The invitation token is a keyed MAC of a random nonce. Only its hash is
 * stored, but the server can re-derive it to render the link at send time.
 */
export function deriveInvitationToken(invitationId: string, nonce: string) {
  return createHmac("sha256", invitationKey()).update(`${invitationId}.${nonce}`).digest("base64url");
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

/**
 * Base URL a candidate's own device can open. getAppUrl() falls back to
 * localhost, which would email links that only work on the sender's machine,
 * so links require an explicit public HTTPS APP_PUBLIC_URL (or NEXT_PUBLIC_APP_URL).
 * ALLOW_LOCAL_INVITATION_LINKS=true permits local links for development only.
 */
export function publicInvitationBaseUrl(): string | null {
  const raw = configuredAppUrl();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const base = `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  if (process.env.ALLOW_LOCAL_INVITATION_LINKS === "true" && process.env.NODE_ENV !== "production") return base;
  if (url.protocol !== "https:" || LOCAL_HOSTS.has(url.hostname) || url.hostname.endsWith(".local")) return null;
  return base;
}

export function assertPublicInvitationBaseUrl() {
  const base = publicInvitationBaseUrl();
  if (!base) {
    throw new CandidateAccessError(
      "Set NEXT_PUBLIC_APP_URL to the public HTTPS address candidates can reach before issuing interview links.",
      409,
      "INVITATION_URL_NOT_PUBLIC"
    );
  }
  return base;
}

export function invitationJoinUrl(token: string) {
  // The token travels in the fragment, so it never reaches server or proxy logs.
  return `${assertPublicInvitationBaseUrl()}/interview/join#token=${token}`;
}

/** Revokes earlier unredeemed invitations and creates a fresh one for the interview. */
export async function createCandidateInvitation(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; interviewId: string; applicationId: string; createdByUserId: string | null; now?: Date }
) {
  const now = input.now ?? new Date();
  await tx.candidateInvitation.updateMany({
    where: { interviewId: input.interviewId, organizationId: input.organizationId, revokedAt: null, redeemedAt: null },
    data: { revokedAt: now }
  });
  const id = `inv_${randomBytes(16).toString("hex")}`;
  const nonce = randomBytes(32).toString("base64url");
  const token = deriveInvitationToken(id, nonce);
  const invitation = await tx.candidateInvitation.create({
    data: {
      id,
      organizationId: input.organizationId,
      interviewId: input.interviewId,
      applicationId: input.applicationId,
      createdByUserId: input.createdByUserId,
      nonce,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS)
    }
  });
  return { invitation, token };
}

/** Link for the newest usable invitation of an interview, or null when none is active. */
export async function activeInvitationLink(
  db: Prisma.TransactionClient | ReturnType<typeof getPrisma>,
  input: { organizationId: string; interviewId: string; now?: Date }
) {
  const invitation = await db.candidateInvitation.findFirst({
    where: {
      organizationId: input.organizationId,
      interviewId: input.interviewId,
      revokedAt: null,
      redeemedAt: null,
      expiresAt: { gt: input.now ?? new Date() }
    },
    orderBy: { createdAt: "desc" }
  });
  if (!invitation) return null;
  const token = deriveInvitationToken(invitation.id, invitation.nonce);
  // Guard against a rotated key: never send a link that would not redeem.
  const expected = Buffer.from(invitation.tokenHash, "hex");
  const actual = Buffer.from(hashToken(token), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return invitationJoinUrl(token);
}

/**
 * Redeems an invitation exactly once and creates a short-lived candidate
 * session. Every failure returns the same generic error so callers cannot
 * probe which invitations exist.
 */
export async function redeemCandidateInvitation(rawToken: unknown, now = new Date()) {
  const invalid = new CandidateAccessError("This interview link is invalid or has expired.", 404, "INVITATION_INVALID");
  if (typeof rawToken !== "string" || !TOKEN_PATTERN.test(rawToken)) throw invalid;
  const prisma = getPrisma();

  return prisma.$transaction(async tx => {
    const invitation = await tx.candidateInvitation.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: {
        interview: { select: { id: true, organizationId: true, applicationId: true, status: true } },
        application: { include: { candidate: { select: { name: true } }, job: { select: { title: true, description: true, employmentType: true } } } }
      }
    });
    if (
      !invitation ||
      invitation.revokedAt ||
      invitation.redeemedAt ||
      invitation.expiresAt <= now ||
      invitation.interview.organizationId !== invitation.organizationId ||
      invitation.interview.applicationId !== invitation.applicationId ||
      invitation.application.organizationId !== invitation.organizationId ||
      !JOINABLE_STATUSES.has(invitation.interview.status)
    ) {
      throw invalid;
    }

    // Conditional update makes concurrent redemptions race safely: one wins.
    const claimed = await tx.candidateInvitation.updateMany({
      where: { id: invitation.id, redeemedAt: null, revokedAt: null },
      data: { redeemedAt: now }
    });
    if (claimed.count !== 1) throw invalid;

    const sessionToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Math.min(now.getTime() + CANDIDATE_SESSION_TTL_MS, invitation.expiresAt.getTime()));
    await tx.candidateSession.create({
      data: {
        organizationId: invitation.organizationId,
        interviewId: invitation.interviewId,
        applicationId: invitation.applicationId,
        invitationId: invitation.id,
        tokenHash: hashToken(sessionToken),
        expiresAt
      }
    });
    await tx.applicationEvent.create({
      data: {
        organizationId: invitation.organizationId,
        applicationId: invitation.applicationId,
        type: "interview",
        label: "Candidate joined via invitation",
        detail: "The candidate redeemed their interview invitation. The link can no longer be used.",
        actorLabel: "Candidate"
      }
    });

    return {
      sessionToken,
      expiresAt,
      interview: {
        id: invitation.interviewId,
        candidateName: invitation.application.candidate.name,
        jobTitle: invitation.application.job.title,
        jobDescription: invitation.application.job.description,
        experienceLevel: experienceLevelForJob(invitation.application.job)
      }
    };
  });
}

/**
 * Experience level for the live interview. Jobs have no explicit level field,
 * so it is read from the title and employment type, defaulting to "Mid".
 */
export function experienceLevelForJob(job: { title: string; employmentType?: string | null }) {
  const text = `${job.title} ${job.employmentType ?? ""}`.toLowerCase();
  if (/\b(intern|internship|graduate|junior|jr|entry[- ]level|trainee|apprentice)\b/.test(text)) return "Junior";
  if (/\b(staff|principal|distinguished)\b/.test(text)) return "Staff";
  if (/\b(senior|sr|lead)\b/.test(text)) return "Senior";
  return "Mid";
}

export function readCandidateSessionToken(headers: Headers) {
  const cookie = headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === CANDIDATE_SESSION_COOKIE) {
      const value = rest.join("=");
      return TOKEN_PATTERN.test(value) ? value : null;
    }
  }
  return null;
}

/** Resolves a live, unrevoked candidate session for a joinable interview, or null. */
export async function getCandidateSession(headers: Headers, now = new Date()): Promise<CandidateSessionContext | null> {
  const token = readCandidateSessionToken(headers);
  if (!token) return null;
  const session = await getPrisma().candidateSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { interview: { select: { organizationId: true, applicationId: true, status: true } } }
  });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    session.interview.organizationId !== session.organizationId ||
    session.interview.applicationId !== session.applicationId ||
    !JOINABLE_STATUSES.has(session.interview.status)
  ) {
    return null;
  }
  return {
    sessionId: session.id,
    organizationId: session.organizationId,
    interviewId: session.interviewId,
    applicationId: session.applicationId,
    expiresAt: session.expiresAt
  };
}

export function candidateSessionCookie(token: string, expiresAt: Date) {
  return {
    name: CANDIDATE_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    expires: expiresAt
  };
}
