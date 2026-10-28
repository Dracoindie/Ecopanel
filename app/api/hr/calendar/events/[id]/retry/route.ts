import { NextResponse } from "next/server";
import { apiErrorResponse, getHrApiContext } from "@/lib/server/api-handler";
import { apiError, enforceRateLimit } from "@/lib/server/http";
import {
  calendarEventSummary,
  retryCalendarEvent
} from "@/lib/server/calendar/service";
import { canManageApplications } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  if (!canManageApplications(auth.context.role)) {
    return apiError(403, "Your role cannot retry calendar sync.", "FORBIDDEN");
  }
  const rate = await enforceRateLimit(request, "hrMutation", { userId: auth.context.user.id });
  if ("response" in rate) return rate.response;

  try {
    const event = await retryCalendarEvent({
      organizationId: auth.context.organization.id,
      eventId: params.id
    });
    if (!event) {
      return apiError(404, "Calendar event not found.", "CALENDAR_EVENT_NOT_FOUND");
    }
    return NextResponse.json(
      { event: calendarEventSummary(event) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
