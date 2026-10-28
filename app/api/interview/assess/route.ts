import { NextResponse } from "next/server";
import { requireInterviewAccess } from "@/lib/server/interview-access";
import { generateFinalAssessment } from "@/lib/orchestrator";
import { SharedInterviewState } from "@/lib/types";
import { logError } from "@/lib/server/logger";

export async function POST(request: Request) {
  const access = await requireInterviewAccess(request, "assess", 60);
  if ("response" in access) return access.response;
  try {
    const state: SharedInterviewState = await request.json();
    const assessment = generateFinalAssessment(state);
    return NextResponse.json({ assessment });
  } catch (err) {
    logError("Assessment generation failed", {
      requestId: request.headers.get("x-request-id") ?? undefined,
      error: err
    });
    return NextResponse.json(
      { error: "The assessment could not be generated.", code: "ASSESSMENT_FAILED" },
      { status: 500 }
    );
  }
}
