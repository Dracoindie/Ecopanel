import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/server/api-handler";
import { isDatabaseMode } from "@/lib/server/config";
import { enforceRateLimit } from "@/lib/server/http";
import { submitPublicApplication } from "@/lib/server/recruitment/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 6 * 1024 * 1024;

export async function POST(request: Request) {
  if (!isDatabaseMode()) {
    return NextResponse.json(
      { error: "This deployment is running the local demo. No application was transmitted.", code: "DEMO_MODE" },
      { status: 503 }
    );
  }

  // A chunked body has no Content-Length and would be buffered in full by
  // formData() before the CV size check runs, so require the header.
  const rawContentLength = request.headers.get("content-length");
  if (rawContentLength === null) {
    return NextResponse.json({ error: "Upload size could not be determined.", code: "LENGTH_REQUIRED" }, { status: 411 });
  }
  const contentLength = Number(rawContentLength);
  if (!Number.isFinite(contentLength) || contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "The CV must be 5 MB or smaller.", code: "CV_TOO_LARGE" }, { status: 413 });
  }

  const rate = await enforceRateLimit(request, "publicApply");
  if ("response" in rate) return rate.response;

  try {
    const formData = await request.formData();
    const jobId = String(formData.get("jobId") ?? "");
    if (!jobId) return NextResponse.json({ error: "Choose a role before applying.", code: "JOB_REQUIRED" }, { status: 400 });

    const result = await submitPublicApplication({
      jobId,
      formData,
      idempotencyKey: request.headers.get("idempotency-key")
    });

    return NextResponse.json(
      { application: result.summary, duplicate: result.duplicate },
      { status: result.duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return apiErrorResponse(error, request);
  }
}
