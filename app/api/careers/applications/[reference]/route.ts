import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/server/api-handler";
import { isDatabaseMode } from "@/lib/server/config";
import { enforceRateLimit } from "@/lib/server/http";
import { getPublicApplicationStatus } from "@/lib/server/recruitment/applications";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { reference: string } }) {
  if (!isDatabaseMode()) return NextResponse.json({ error: "Demo mode", code: "DEMO_MODE" }, { status: 503 });
  const rate = await enforceRateLimit(request, "applicationStatus");
  if ("response" in rate) return rate.response;

  if (!/^[0-9a-f-]{36}$/i.test(params.reference)) {
    return NextResponse.json({ error: "Application not found.", code: "APPLICATION_NOT_FOUND" }, { status: 404 });
  }

  try {
    const application = await getPublicApplicationStatus(params.reference);
    if (!application) {
      return NextResponse.json({ error: "Application not found.", code: "APPLICATION_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ application }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
