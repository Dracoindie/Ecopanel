import { NextResponse } from "next/server";
import { apiErrorResponse, getHrApiContext } from "@/lib/server/api-handler";
import { apiError, enforceRateLimit } from "@/lib/server/http";
import { getEmailTemplate, updateEmailTemplate } from "@/lib/server/recruitment/hr-email";
import { canManageApplications } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  const rate = await enforceRateLimit(request, "hrRead", { userId: auth.context.user.id });
  if ("response" in rate) return rate.response;

  try {
    const template = await getEmailTemplate(auth.context.organization.id, params.id);
    if (!template) return apiError(404, "Template not found.", "TEMPLATE_NOT_FOUND");
    return NextResponse.json({ template }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  if (!canManageApplications(auth.context.role)) {
    return apiError(403, "Your role cannot edit email templates.", "FORBIDDEN");
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
    const template = await updateEmailTemplate(auth.context, params.id, body);
    return NextResponse.json({ template }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
