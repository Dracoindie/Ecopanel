import { NextResponse } from "next/server";
import { z } from "zod";
import { AnswerAnalysisSchema } from "@/lib/types";
import { analyzeAnswerLocally, runModeratorStep } from "@/lib/orchestrator";

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

    // Run deterministic Moderator step
    const { updatedState, decision } = runModeratorStep(state, turn, validatedAnalysis);

    return NextResponse.json({
      analysis: validatedAnalysis,
      decision,
      updatedState
    });
  } catch (err) {
    console.error("Answer analysis error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to analyze answer" },
      { status: 500 }
    );
  }
}
