import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/server/api-handler";
import { isDatabaseMode } from "@/lib/server/config";
import { apiError } from "@/lib/server/http";
import { getPublishedJob } from "@/lib/server/recruitment/jobs";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!isDatabaseMode()) return apiError(503, "Careers data is running in demo mode.", "DATABASE_MODE_REQUIRED");
  try {
    const job = await getPublishedJob(params.id);
    if (!job) return apiError(404, "This role is not available.", "JOB_NOT_FOUND");
    return NextResponse.json({ job }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
