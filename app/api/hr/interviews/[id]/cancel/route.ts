import { NextResponse } from "next/server";
import { apiErrorResponse, getHrApiContext } from "@/lib/server/api-handler";
import { apiError, enforceRateLimit } from "@/lib/server/http";
import { cancelHrInterview } from "@/lib/server/recruitment/hr-interviews";
import { canManageApplications } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  if (!canManageApplications(auth.context.role)) {
    return apiError(403, "Your role cannot cancel interviews.", "FORBIDDEN");
  }
  const rate = await enforceRateLimit(request, "hrMutation", { userId: auth.context.user.id });
  if ("response" in rate) return rate.response;

  let notify = false;
  let calendarNotify = false;
  try {
    const body = await request.json() as { notify?: unknown; calendarNotify?: unknown } | null;
    notify = body?.notify === true;
    calendarNotify = body?.calendarNotify === true;
  } catch {
    notify = false;
  }

  try {
    const interview = await cancelHrInterview(auth.context, params.id, { notify, calendarNotify });
    return NextResponse.json({ interview }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
