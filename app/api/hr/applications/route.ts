import { NextResponse } from "next/server";
import { apiErrorResponse, getHrApiContext } from "@/lib/server/api-handler";
import { enforceRateLimit } from "@/lib/server/http";
import { listHrApplications } from "@/lib/server/recruitment/hr";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await getHrApiContext(request);
  if ("response" in auth) return auth.response;

  const rate = await enforceRateLimit(request, "hrRead", { userId: auth.context.user.id });
  if ("response" in rate) return rate.response;

  const url = new URL(request.url);
  try {
    const result = await listHrApplications({
      organizationId: auth.context.organization.id,
      search: url.searchParams.get("q") ?? "",
      stage: url.searchParams.get("stage") ?? "",
      jobId: url.searchParams.get("jobId") ?? "",
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 50)
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
