import { NextResponse } from "next/server";
import { checkReadiness } from "@/lib/server/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const readiness = await checkReadiness();
  return NextResponse.json(
    {
      status: readiness.status,
      checks: readiness.checks,
      requestId: request.headers.get("x-request-id") ?? null,
      time: new Date().toISOString()
    },
    { status: readiness.httpStatus, headers: { "Cache-Control": "no-store" } }
  );
}
