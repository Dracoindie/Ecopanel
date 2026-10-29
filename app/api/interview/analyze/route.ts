import { NextResponse } from "next/server";
import { requireInterviewAccess } from "@/lib/server/interview-access";
import { z } from "zod";
import { AnswerAnalysisSchema } from "@/lib/types";
import { analyzeAnswerLocally, runModeratorStep } from "@/lib/orchestrator";
import { getEmailConfig } from "@/lib/server/email/config";
import { logError } from "@/lib/server/logger";

const RequestSchema = z.object({
  turn: z.object({
    id: z.string(),
    speaker: z.literal("candidate"),
    text: z.string(),
    timestamp: z.number(),
    isFinal: z.boolean()
  }),
  state: z.any()
});

export async function POST(request: Request) {
  const access = await requireInterviewAccess(request, "interview-api", 60);
  if ("response" in access) return access.response;
  try {
    const json = await request.json();
    const parsed = RequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsed.error }, { status: 400 });
    }

    const { turn, state } = parsed.data;

    // Use deterministic local analysis first for sub-second, guaranteed response
    let analysis = analyzeAnswerLocally(turn.text, state.transcript || [], state.claims || []);

    // If LLM_API_KEY is available, we could enrich analysis, but we strictly validate with AnswerAnalysisSchema
    const validatedAnalysis = AnswerAnalysisSchema.parse(analysis);

    // Invited candidates get a completion email when a provider is configured; say so only then.
    const confirmationEmail = access.context?.kind === "candidate" && getEmailConfig().configured;
    const { updatedState, decision } = runModeratorStep(state, turn, validatedAnalysis, { confirmationEmail });

    return NextResponse.json({
      analysis: validatedAnalysis,
      decision,
      updatedState
    });
  } catch (err) {
    logError("Answer analysis failed", {
      requestId: request.headers.get("x-request-id") ?? undefined,
      error: err
    });
    return NextResponse.json(
      { error: "The answer could not be analysed.", code: "ANALYSIS_FAILED" },
      { status: 500 }
    );
  }
}
