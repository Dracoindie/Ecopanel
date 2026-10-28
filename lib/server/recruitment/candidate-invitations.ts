import {
  assertPublicInvitationBaseUrl,
  createCandidateInvitation,
  INVITATION_LINK_PLACEHOLDER,
  invitationJoinUrl
} from "@/lib/server/candidate-access";
import { getPrisma } from "@/lib/server/db";
import { getEmailConfig } from "@/lib/server/email/config";
import { appendSignature, formatInterviewDate, formatInterviewTime, previewText } from "@/lib/server/email/render";
import { HrInterviewError } from "@/lib/server/recruitment/hr-interviews";
import type { HrContext } from "@/lib/server/session";

/**
 * Issues a fresh one-time join link for a scheduled interview (revoking any
 * earlier unused one) and queues it through the existing email outbox. The
 * stored email body holds a placeholder; the worker renders the link at send
 * time, so the token is never persisted. The link is returned once so the
 * recruiter can share it directly when email delivery is not configured.
 */
export async function inviteCandidateToInterview(context: HrContext, interviewId: string) {
  // Refuse before writing anything if candidates could not open the link.
  assertPublicInvitationBaseUrl();
  const prisma = getPrisma();
  return prisma.$transaction(async tx => {
    const interview = await tx.interview.findFirst({
      where: { id: interviewId, organizationId: context.organization.id },
      include: { application: { include: { candidate: true, job: true } } }
    });
    if (!interview) throw new HrInterviewError("Interview not found.", 404, "INTERVIEW_NOT_FOUND");
    if (interview.status !== "Scheduled") {
      throw new HrInterviewError("Only scheduled interviews can receive a join link.", 409, "INTERVIEW_NOT_SCHEDULED");
    }

    const { invitation, token } = await createCandidateInvitation(tx, {
      organizationId: context.organization.id,
      interviewId: interview.id,
      applicationId: interview.applicationId,
      createdByUserId: context.user.id
    });

    const { candidate, job } = interview.application;
    const [organization, settings] = await Promise.all([
      tx.organization.findUnique({ where: { id: context.organization.id }, select: { name: true } }),
      tx.mailSettings.findUnique({ where: { organizationId: context.organization.id } })
    ]);
    const companyName = organization?.name ?? context.organization.name;
    const firstName = candidate.name.split(/\s+/)[0] || candidate.name;
    const subject = `Your interview link: ${job.title}`.slice(0, 240);
    const body = appendSignature(
      [
        `Hi ${firstName},`,
        "",
        `Here is your personal link to join your ${job.title} interview with ${companyName} on ${formatInterviewDate(interview.scheduledAt, interview.timezone)} at ${formatInterviewTime(interview.scheduledAt, interview.timezone)}:`,
        "",
        INVITATION_LINK_PLACEHOLDER,
        "",
        "The link works once and expires in 72 hours. Open it on the device you will use for the interview, somewhere quiet, with a working microphone.",
        "",
        "If the link does not work, reply to this message and we will send a new one.",
        "",
        "Best,",
        settings?.senderName?.trim() || companyName
      ].join("\n"),
      settings?.signature
    );
    const config = getEmailConfig();
    const message = await tx.emailMessage.create({
      data: {
        organizationId: context.organization.id,
        applicationId: interview.applicationId,
        candidateId: candidate.id,
        jobId: job.id,
        interviewId: interview.id,
        kind: "interview-link",
        recipientName: candidate.name,
        recipientEmail: candidate.email,
        subject,
        body,
        preview: previewText(body.replace(INVITATION_LINK_PLACEHOLDER, "[personal interview link]")),
        status: "Queued",
        availableAt: new Date(),
        maxAttempts: config.maxAttempts,
        fromAddress: config.fromEmail,
        replyTo: settings?.replyTo?.trim() || config.replyTo,
        idempotencyKey: `interview-link:${invitation.id}`,
        isDemo: false
      }
    });
    await tx.applicationEvent.create({
      data: {
        organizationId: context.organization.id,
        applicationId: interview.applicationId,
        type: "email",
        label: "Interview link queued",
        detail: "A one-time interview link was issued and queued in the email outbox. Any earlier unused link was revoked.",
        actorUserId: context.user.id,
        actorLabel: context.user.name
      }
    });

    return {
      joinUrl: invitationJoinUrl(token),
      expiresAt: invitation.expiresAt.toISOString(),
      emailMessageId: message.id,
      emailConfigured: config.configured
    };
  });
}
