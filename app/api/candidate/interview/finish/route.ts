import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/server/api-handler";
import { finishCandidateInterview } from "@/lib/server/assessment/service";
import { CANDIDATE_SESSION_COOKIE, getCandidateSession } from "@/lib/server/candidate-access";
import { isDatabaseMode } from "@/lib/server/config";
import { apiError, enforceRateLimit, unauthorized } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Called by the invited candidate's browser when the interview ends. The
 * interview is taken from the candidate session; the session is consumed.
 */
export async function POST(request: Request) {
  if (!isDatabaseMode()) return apiError(503, "Candidate interviews require APP_DATA_MODE=database.", "DATABASE_MODE_REQUIRED");
  try {
    const candidate = await getCandidateSession(request.headers);
    if (!candidate) return unauthorized();
    const rate = await enforceRateLimit(request, "interviewMutation", { userId: `candidate:${candidate.sessionId}` });
    if ("response" in rate) return rate.response;

    const body = await request.json().catch(() => null) as { turns?: unknown } | null;
    const result = await finishCandidateInterview(candidate, body?.turns);
    const response = NextResponse.json(
      { transcript: result.transcript, assessmentQueued: Boolean(result.assessmentJobId) },
      { headers: { "Cache-Control": "no-store" } }
    );
    response.cookies.set({ name: CANDIDATE_SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
