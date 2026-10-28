import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/server/api-handler";
import { apiError } from "@/lib/server/http";
import { listPublishedJobs } from "@/lib/server/recruitment/jobs";
import { isDatabaseMode } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseMode()) return apiError(503, "Careers data is running in demo mode.", "DATABASE_MODE_REQUIRED");
  try {
    const jobs = await listPublishedJobs();
    return NextResponse.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
