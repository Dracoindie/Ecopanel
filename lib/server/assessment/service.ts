import type { Prisma } from "@prisma/client";
import { enqueueAssessmentForInterview } from "@/lib/server/assessment/queue";
import { enqueueHiringNotification } from "@/lib/server/email/notifications";
import { normalizeCapturedTurns, transcriptChecksum } from "@/lib/server/assessment/transcript";
import { AssessmentServiceError } from "@/lib/server/assessment/types";
import { getPrisma } from "@/lib/server/db";
import type { HrContext } from "@/lib/server/session";

/** Who stored a transcript: a recruiter (userId) or an invited candidate (no user). */
export interface TranscriptActor {
  organizationId: string;
  userId: string | null;
  label: string;
}

export function hrTranscriptActor(context: HrContext): TranscriptActor {
  return { organizationId: context.organization.id, userId: context.user.id, label: context.user.name };
}

export async function storeInterviewTranscript(
  actor: TranscriptActor,
  interviewId: string,
  rawTurns: unknown
) {
  const turns = normalizeCapturedTurns(rawTurns);
  const checksum = transcriptChecksum(turns);
  const prisma = getPrisma();

  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, organizationId: actor.organizationId },
    include: { transcripts: { orderBy: { version: "desc" }, take: 1 } }
  });
  if (!interview) throw new AssessmentServiceError("Interview not found.", 404, "INTERVIEW_NOT_FOUND");
  if (interview.status === "Cancelled") {
    throw new AssessmentServiceError("Cancelled interviews cannot store a transcript.", 409, "INTERVIEW_CANCELLED");
  }

  const latest = interview.transcripts[0];
  if (latest?.checksum === checksum) {
    const job = interview.status === "Completed"
      ? await prisma.$transaction(async tx => {
        const queued = await enqueueAssessmentForInterview(tx, {
          organizationId: actor.organizationId,
          interviewId,
          requestedByUserId: actor.userId
        });
        return queued?.job ?? null;
      })
      : null;
    return {
      transcript: {
        id: latest.id,
        version: latest.version,
        turnCount: latest.turnCount,
        checksum: latest.checksum,
        capturedAt: latest.capturedAt.toISOString()
      },
      created: false,
      assessmentJobId: job?.id ?? null
    };
  }

  const result = await prisma.$transaction(async tx => {
    const version = (latest?.version ?? 0) + 1;
    const transcript = await tx.interviewTranscript.create({
      data: {
        organizationId: actor.organizationId,
        interviewId,
        version,
        source: "AGORA_CLIENT_FINAL",
        checksum,
        turnCount: turns.length,
        turns: turns as unknown as Prisma.InputJsonValue,
        createdByUserId: actor.userId
      }
    });
    await tx.applicationEvent.create({
      data: {
        organizationId: actor.organizationId,
        applicationId: interview.applicationId,
        type: "interview",
        label: `Transcript version ${version} stored`,
        detail: `A finalized transcript with ${turns.length} turns was stored. Turn text is not written to application events.`,
        actorUserId: actor.userId,
        actorLabel: actor.label
      }
    });
    const queued = interview.status === "Completed"
      ? await enqueueAssessmentForInterview(tx, {
        organizationId: actor.organizationId,
        interviewId,
        requestedByUserId: actor.userId
      })
      : null;
    return { transcript, job: queued?.job ?? null };
  });

  return {
    transcript: {
      id: result.transcript.id,
      version: result.transcript.version,
      turnCount: result.transcript.turnCount,
      checksum: result.transcript.checksum,
      capturedAt: result.transcript.capturedAt.toISOString()
    },
    created: true,
    assessmentJobId: result.job?.id ?? null
  };
}

const REVIEW_STATUSES = new Set(["Pending", "Reviewed", "Needs Discussion"]);

export async function reviewHrAssessment(
  context: HrContext,
  interviewId: string,
  raw: unknown
) {
  if (!raw || typeof raw !== "object") {
    throw new AssessmentServiceError("Send a review payload.", 400, "INVALID_REVIEW");
  }
  const body = raw as Record<string, unknown>;
  const status = typeof body.reviewStatus === "string" ? body.reviewStatus : "";
  if (!REVIEW_STATUSES.has(status)) {
    throw new AssessmentServiceError("Choose a valid review status.", 400, "INVALID_REVIEW");
  }
  const note = typeof body.reviewNote === "string" ? body.reviewNote.trim() : "";
  if (note.length > 2_000) {
    throw new AssessmentServiceError("Review notes are too long.", 400, "INVALID_REVIEW");
  }

  const prisma = getPrisma();
  const assessment = await prisma.assessment.findFirst({
    where: {
      organizationId: context.organization.id,
      interviewId,
      source: "AI"
    },
    orderBy: { generatedAt: "desc" }
  });
  if (!assessment) {
    throw new AssessmentServiceError("No AI-assisted assessment is available to review.", 404, "ASSESSMENT_NOT_FOUND");
  }

  return prisma.$transaction(async tx => {
    const saved = await tx.assessment.update({
      where: { id: assessment.id },
      data: {
        reviewStatus: status,
        reviewNote: note || null,
        reviewedAt: new Date(),
        reviewedByUserId: context.user.id
      }
    });
    await tx.applicationEvent.create({
      data: {
        organizationId: context.organization.id,
        applicationId: assessment.applicationId,
        type: "assessment",
        label: "Assessment review updated",
        detail: `Human review status changed to ${status}.`,
        actorUserId: context.user.id,
        actorLabel: context.user.name
      }
    });
    return {
      id: saved.id,
      reviewStatus: saved.reviewStatus,
      reviewNote: saved.reviewNote,
      reviewedAt: saved.reviewedAt?.toISOString() ?? null
    };
  });
}

/**
 * Ends an invited candidate's interview: consumes their session (so it cannot
 * be replayed), completes the interview, stores the finalized transcript and
 * queues the recruiter assessment, all in one transaction. The interview and
 * application come from the server-side session, never from the request.
 */
export async function finishCandidateInterview(
  candidate: { sessionId: string; organizationId: string; interviewId: string; applicationId: string },
  rawTurns: unknown
) {
  const turns = normalizeCapturedTurns(rawTurns);
  const checksum = transcriptChecksum(turns);
  const actor: TranscriptActor = { organizationId: candidate.organizationId, userId: null, label: "Candidate" };

  return getPrisma().$transaction(async tx => {
    const consumed = await tx.candidateSession.updateMany({
      where: { id: candidate.sessionId, interviewId: candidate.interviewId, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() }
    });
    if (consumed.count !== 1) {
      throw new AssessmentServiceError("This interview session has ended.", 401, "CANDIDATE_SESSION_INVALID");
    }

    const interview = await tx.interview.findFirst({
      where: { id: candidate.interviewId, organizationId: candidate.organizationId, applicationId: candidate.applicationId },
      include: { transcripts: { orderBy: { version: "desc" }, take: 1 } }
    });
    if (!interview) throw new AssessmentServiceError("Interview not found.", 404, "INTERVIEW_NOT_FOUND");
    if (interview.status !== "Scheduled") {
      throw new AssessmentServiceError("This interview is no longer open.", 409, "INTERVIEW_NOT_OPEN");
    }

    await tx.interview.update({ where: { id: interview.id }, data: { status: "Completed" } });
    await tx.applicationEvent.create({
      data: {
        organizationId: actor.organizationId,
        applicationId: interview.applicationId,
        type: "interview",
        label: "Interview completed by candidate",
        detail: "The invited candidate finished the live interview. Assessment generation uses the stored transcript.",
        actorLabel: actor.label
      }
    });

    const latest = interview.transcripts[0];
    let transcript = latest;
    if (latest?.checksum !== checksum) {
      const version = (latest?.version ?? 0) + 1;
      transcript = await tx.interviewTranscript.create({
        data: {
          organizationId: actor.organizationId,
          interviewId: interview.id,
          version,
          source: "AGORA_CLIENT_FINAL",
          checksum,
          turnCount: turns.length,
          turns: turns as unknown as Prisma.InputJsonValue,
          createdByUserId: null
        }
      });
      await tx.applicationEvent.create({
        data: {
          organizationId: actor.organizationId,
          applicationId: interview.applicationId,
          type: "interview",
          label: `Transcript version ${version} stored`,
          detail: `A finalized transcript with ${turns.length} turns was stored. Turn text is not written to application events.`,
          actorLabel: actor.label
        }
      });
    }

    const queued = await enqueueAssessmentForInterview(tx, {
      organizationId: actor.organizationId,
      interviewId: interview.id,
      requestedByUserId: null
    });
    await enqueueHiringNotification(tx, {
      organizationId: actor.organizationId,
      applicationId: interview.applicationId,
      interviewId: interview.id,
      kind: "interview_completed",
      actorLabel: actor.label
    });
    return {
      transcript: { id: transcript!.id, version: transcript!.version, turnCount: transcript!.turnCount, checksum: transcript!.checksum },
      assessmentJobId: queued?.job?.id ?? null
    };
  });
}
