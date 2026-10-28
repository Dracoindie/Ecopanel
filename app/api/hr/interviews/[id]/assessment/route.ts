import { NextResponse } from "next/server";
import { apiErrorResponse, getHrApiContext } from "@/lib/server/api-handler";
import { apiError, enforceRateLimit } from "@/lib/server/http";
import { getHrInterview, saveHrAssessment } from "@/lib/server/recruitment/hr-interviews";
import { canManageApplications } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  const rate = await enforceRateLimit(request, "hrRead", { userId: auth.context.user.id });
  if ("response" in rate) return rate.response;

  try {
    const record = await getHrInterview(auth.context.organization.id, params.id);
    if (!record) return apiError(404, "Interview not found.", "INTERVIEW_NOT_FOUND");
    if (!record.assessment) return apiError(404, "No assessment is linked to this interview.", "ASSESSMENT_NOT_FOUND");
    return NextResponse.json({ assessment: record.assessment }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  if (!canManageApplications(auth.context.role)) {
    return apiError(403, "Your role cannot link assessments.", "FORBIDDEN");
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
    const assessment = await saveHrAssessment(auth.context, params.id, body);
    return NextResponse.json({ assessment }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
