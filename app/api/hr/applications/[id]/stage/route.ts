import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, getHrApiContext } from "@/lib/server/api-handler";
import { apiError, enforceRateLimit } from "@/lib/server/http";
import { updateApplicationStage } from "@/lib/server/recruitment/hr";
import { canManageApplications } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  stage: z.string().min(1).max(40),
  notify: z.boolean().optional()
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  if (!canManageApplications(auth.context.role)) return apiError(403, "Your role cannot change application stages.", "FORBIDDEN");
  const rate = await enforceRateLimit(request, "hrMutation", { userId: auth.context.user.id });
  if ("response" in rate) return rate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Send a JSON body.", "INVALID_JSON");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(400, "Choose a valid stage.", "INVALID_STAGE");

  try {
    const result = await updateApplicationStage(auth.context, params.id, parsed.data.stage, {
      notify: parsed.data.notify
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
