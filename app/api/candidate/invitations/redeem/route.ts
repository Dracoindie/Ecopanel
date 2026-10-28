import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/server/api-handler";
import { candidateSessionCookie, redeemCandidateInvitation } from "@/lib/server/candidate-access";
import { isDatabaseMode } from "@/lib/server/config";
import { apiError, enforceRateLimit } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Exchanges a one-time invitation token (sent in the body, never the URL) for
 * an httpOnly candidate session cookie scoped to one interview.
 */
export async function POST(request: Request) {
  if (!isDatabaseMode()) return apiError(503, "Candidate invitations require APP_DATA_MODE=database.", "DATABASE_MODE_REQUIRED");
  const rate = await enforceRateLimit(request, "candidateRedeem");
  if ("response" in rate) return rate.response;

  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  try {
    const redeemed = await redeemCandidateInvitation(body?.token);
    const response = NextResponse.json(
      { interview: redeemed.interview, expiresAt: redeemed.expiresAt.toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
    response.cookies.set(candidateSessionCookie(redeemed.sessionToken, redeemed.expiresAt));
    return response;
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
