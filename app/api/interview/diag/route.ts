import { NextResponse } from "next/server";
import { z } from "zod";
import { requireInterviewAccess } from "@/lib/server/interview-access";
import { logInfo } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

// Timing diagnostics only: event names, numbers, booleans and short labels.
// Free text is rejected, so transcript content can never reach the log.
const value = z.union([z.number().finite(), z.boolean(), z.string().regex(/^[A-Za-z0-9_-]{1,24}$/)]);
const schema = z.object({
  events: z.array(
    z.object({ event: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/), at: z.number().int().positive() })
      .catchall(value)
      .refine(item => Object.keys(item).length <= 12, "Too many fields")
  ).min(1).max(100)
});

/** Browser-side live-interview timing events, written to the server log for comparison with Agora. */
export async function POST(request: Request) {
  const access = await requireInterviewAccess(request, "interview-api", 60);
  if ("response" in access) return access.response;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid diagnostics payload." }, { status: 400 });
  const interviewId = access.context?.interviewId ?? null;
  for (const item of body.data.events) {
    const { event, at, ...fields } = item;
    logInfo("Live interview timing", { interviewId, event, at, ...fields });
  }
  return NextResponse.json({ accepted: body.data.events.length });
}
