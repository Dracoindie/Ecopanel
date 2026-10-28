import { NextResponse } from "next/server";
import { apiErrorResponse, getHrApiContext } from "@/lib/server/api-handler";
import { apiError, enforceRateLimit } from "@/lib/server/http";
import { createEmailTemplate, listEmailTemplates } from "@/lib/server/recruitment/hr-email";
import { canManageApplications } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  const rate = await enforceRateLimit(request, "hrRead", { userId: auth.context.user.id });
  if ("response" in rate) return rate.response;

  try {
    const templates = await listEmailTemplates(auth.context.organization.id);
    return NextResponse.json({ templates }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}

export async function POST(request: Request) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  if (!canManageApplications(auth.context.role)) {
    return apiError(403, "Your role cannot create email templates.", "FORBIDDEN");
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
    const template = await createEmailTemplate(auth.context, body);
    return NextResponse.json({ template }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
