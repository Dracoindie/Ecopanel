import { NextResponse } from "next/server";
import { generateFinalAssessment } from "@/lib/orchestrator";
import { SharedInterviewState } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const state: SharedInterviewState = await request.json();
    const assessment = generateFinalAssessment(state);
    return NextResponse.json({ assessment });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate assessment" },
      { status: 500 }
    );
  }
}
