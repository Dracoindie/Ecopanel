import { NextResponse } from "next/server";
import { apiErrorResponse, getHrApiContext } from "@/lib/server/api-handler";
import { apiError, enforceRateLimit } from "@/lib/server/http";
import { createGoogleAuthorizationUrl } from "@/lib/server/calendar/oauth";
import { canManageOrganization } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  if (!canManageOrganization(auth.context.role)) {
    return apiError(403, "Your role cannot connect a calendar.", "FORBIDDEN");
  }
  const rate = await enforceRateLimit(request, "hrMutation", { userId: auth.context.user.id });
  if ("response" in rate) return rate.response;

  try {
    const url = await createGoogleAuthorizationUrl(auth.context);
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
