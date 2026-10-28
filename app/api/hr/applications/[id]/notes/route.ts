import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, getHrApiContext } from "@/lib/server/api-handler";
import { apiError, enforceRateLimit } from "@/lib/server/http";
import { addApplicationNote } from "@/lib/server/recruitment/hr";
import { canManageApplications } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ body: z.string().min(2).max(4000) });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;
  if (!canManageApplications(auth.context.role)) return apiError(403, "Your role cannot add notes.", "FORBIDDEN");
  const rate = await enforceRateLimit(request, "hrMutation", { userId: auth.context.user.id });
  if ("response" in rate) return rate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Send a JSON body.", "INVALID_JSON");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(400, "Notes must be between 2 and 4,000 characters.", "INVALID_NOTE");

  try {
    const note = await addApplicationNote(auth.context, params.id, parsed.data.body);
    return NextResponse.json({ note }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
