import { NextResponse } from "next/server";
import { apiErrorResponse, getHrApiContext } from "@/lib/server/api-handler";
import { apiError, enforceRateLimit } from "@/lib/server/http";
import { retryEmailMessage } from "@/lib/server/recruitment/hr-email";
import { canManageApplications } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  if (!canManageApplications(auth.context.role)) {
    return apiError(403, "Your role cannot requeue email.", "FORBIDDEN");
  }
  const rate = await enforceRateLimit(request, "emailSend", { userId: auth.context.user.id });
  if ("response" in rate) return rate.response;

  try {
    const message = await retryEmailMessage(auth.context, params.id);
    return NextResponse.json({ message }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
