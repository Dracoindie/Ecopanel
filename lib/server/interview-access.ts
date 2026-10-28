import { NextResponse } from "next/server";
import { getCandidateSession } from "@/lib/server/candidate-access";
import { isDatabaseMode, isDemoInterviewAccessExplicitlyAllowed } from "@/lib/server/config";
import { enforceRateLimit, forbidden, unauthorized } from "@/lib/server/http";
import type { RateLimitPolicyName } from "@/lib/server/rate-limit";
import { getHrContext } from "@/lib/server/session";

/**
 * Who is driving a live interview. Recruiters may act on any interview in
 * their organization; an invited candidate only on their own interviewId.
 */
export type InterviewAccessContext =
  | { kind: "hr"; organizationId: string; userId: string; interviewId: null; candidateSessionId: null }
  | { kind: "candidate"; organizationId: string; userId: null; interviewId: string; candidateSessionId: string };

/** Scopes candidates may never use (AI scoring stays recruiter-only). */
const RECRUITER_ONLY_SCOPES = new Set(["assess"]);

function policyForScope(scope: string): RateLimitPolicyName {
  if (scope === "session") return "interviewSession";
  if (scope === "token") return "interviewToken";
  if (scope === "start") return "interviewStart";
  if (scope === "stop") return "interviewStop";
  return "interviewMutation";
}

export async function requireInterviewAccess(
  request: Request,
  scope: string,
  _legacyLimit = 30
): Promise<{ context: InterviewAccessContext | null } | { response: NextResponse }> {
  if (isDemoInterviewAccessExplicitlyAllowed()) {
    return { context: null };
  }

  if (!isDatabaseMode()) return { response: unauthorized() };

  try {
    const hr = await getHrContext(request.headers);
    if (hr) {
      const rate = await enforceRateLimit(request, policyForScope(scope), { userId: hr.user.id });
      if ("response" in rate) return { response: rate.response };
      return {
        context: { kind: "hr", organizationId: hr.organization.id, userId: hr.user.id, interviewId: null, candidateSessionId: null }
      };
    }

    const candidate = await getCandidateSession(request.headers);
    if (!candidate) return { response: unauthorized() };
    if (RECRUITER_ONLY_SCOPES.has(scope)) return { response: forbidden() };

    const rate = await enforceRateLimit(request, policyForScope(scope), { userId: `candidate:${candidate.sessionId}` });
    if ("response" in rate) return { response: rate.response };
    return {
      context: {
        kind: "candidate",
        organizationId: candidate.organizationId,
        userId: null,
        interviewId: candidate.interviewId,
        candidateSessionId: candidate.sessionId
      }
    };
  } catch {
    return {
      response: NextResponse.json(
        { error: "Interview access could not be verified.", code: "AUTH_UNAVAILABLE" },
        { status: 503 }
      )
    };
  }
}

/** Extra Prisma filter that pins a candidate to their own interview. */
export function interviewScope(context: InterviewAccessContext) {
  return context.interviewId ? { interviewId: context.interviewId } : {};
}
