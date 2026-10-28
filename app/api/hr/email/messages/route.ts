import { NextResponse } from "next/server";
import { apiErrorResponse, getHrApiContext } from "@/lib/server/api-handler";
import { apiError, enforceRateLimit } from "@/lib/server/http";
import { createEmailMessage, listEmailMessages } from "@/lib/server/recruitment/hr-email";
import { canManageApplications } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  const rate = await enforceRateLimit(request, "hrRead", { userId: auth.context.user.id });
  if ("response" in rate) return rate.response;

  try {
    const messages = await listEmailMessages(auth.context.organization.id);
    return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}

export async function POST(request: Request) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  if (!canManageApplications(auth.context.role)) {
    return apiError(403, "Your role cannot create messages.", "FORBIDDEN");
  }
  const rate = await enforceRateLimit(request, "emailSend", { userId: auth.context.user.id });
  if ("response" in rate) return rate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Send a JSON body.", "INVALID_JSON");
  }

  try {
    const message = await createEmailMessage(auth.context, body);
    return NextResponse.json({ message }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
