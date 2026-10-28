import { NextResponse } from "next/server";
import { apiErrorResponse, getHrApiContext } from "@/lib/server/api-handler";
import { apiError, enforceRateLimit } from "@/lib/server/http";
import { disconnectGoogleCalendar } from "@/lib/server/calendar/oauth";
import { getCalendarConnectionStatus } from "@/lib/server/calendar/service";
import { canManageOrganization } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  const rate = await enforceRateLimit(request, "hrRead", { userId: auth.context.user.id });
  if ("response" in rate) return rate.response;

  try {
    const calendar = {
      ...await getCalendarConnectionStatus(auth.context.organization.id),
      canManage: canManageOrganization(auth.context.role)
    };
    return NextResponse.json({ calendar }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}

export async function DELETE(request: Request) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  if (!canManageOrganization(auth.context.role)) {
    return apiError(403, "Your role cannot change calendar settings.", "FORBIDDEN");
  }
  const rate = await enforceRateLimit(request, "hrMutation", { userId: auth.context.user.id });
  if ("response" in rate) return rate.response;

  try {
    await disconnectGoogleCalendar(auth.context);
    return NextResponse.json({ status: "disconnected" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
