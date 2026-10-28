import { NextResponse } from "next/server";
import { apiErrorResponse, getHrApiContext } from "@/lib/server/api-handler";
import { reviewHrAssessment } from "@/lib/server/assessment/service";
import { apiError, enforceRateLimit } from "@/lib/server/http";
import { canManageApplications } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  if (!canManageApplications(auth.context.role)) {
    return apiError(403, "Your role cannot review assessments.", "FORBIDDEN");
  }
  const rate = await enforceRateLimit(request, "hrMutation", { userId: auth.context.user.id });
  if ("response" in rate) return rate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Send a JSON body.", "INVALID_JSON");
  }

  try {
    const review = await reviewHrAssessment(auth.context, params.id, body);
    return NextResponse.json({ review }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
