import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, getHrApiContext } from "@/lib/server/api-handler";
import { apiError, enforceRateLimit } from "@/lib/server/http";
import { setHrJobStatus } from "@/lib/server/recruitment/hr-jobs";
import { canManageApplications } from "@/lib/server/session";
import type { JobStatus } from "@/lib/domain";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ status: z.enum(["Draft", "Published", "Closed"]) });

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  if (!canManageApplications(auth.context.role)) {
    return apiError(403, "Your role cannot change job status.", "FORBIDDEN");
  }
  const rate = await enforceRateLimit(request, "hrMutation", { userId: auth.context.user.id });
  if ("response" in rate) return rate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Send a JSON body.", "INVALID_JSON");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(400, "Choose a valid job status.", "INVALID_JOB_STATUS");

  try {
    const job = await setHrJobStatus(auth.context, params.id, parsed.data.status as JobStatus);
    return NextResponse.json({ job }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
