import { NextResponse } from "next/server";
import { apiErrorResponse, getHrApiContext } from "@/lib/server/api-handler";
import { hrTranscriptActor, storeInterviewTranscript } from "@/lib/server/assessment/service";
import { apiError, enforceRateLimit } from "@/lib/server/http";
import { canManageApplications } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  if (!canManageApplications(auth.context.role)) {
    return apiError(403, "Your role cannot store interview transcripts.", "FORBIDDEN");
  }
  const rate = await enforceRateLimit(request, "hrMutation", { userId: auth.context.user.id });
  if ("response" in rate) return rate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Send a JSON body.", "INVALID_JSON");
  }
  const turns = body && typeof body === "object" && !Array.isArray(body)
    ? (body as { turns?: unknown }).turns
    : undefined;

  try {
    const result = await storeInterviewTranscript(hrTranscriptActor(auth.context), params.id, turns);
    return NextResponse.json(result, {
      status: result.created ? 201 : 200,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
