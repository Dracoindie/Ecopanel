import { NextResponse } from "next/server";
import { Agent, AgoraClient, Area, ExpiresIn } from "agora-agents";
import { z } from "zod";
import { agoraConfig, DEFAULT_AGENT_UID } from "@/lib/agora";

const schema = z.object({
  channel: z.string().min(1).max(64),
  requesterId: z.string().regex(/^\d+$/),
  targetRole: z.string().min(1).max(120).default("Software Engineer"),
  jobDescription: z.string().max(4000).optional().default(""),
  experienceLevel: z.string().max(40).optional().default("Mid"),
  candidateName: z.string().max(80).optional().default("Candidate"),
  greeting: z.string().max(600).optional()
});

function buildInstructions(role: string, experienceLevel: string, jobDescription: string) {
  const jd = jobDescription.trim()
    ? `Job description context:\n${jobDescription.trim().slice(0, 1200)}`
    : "No job description provided; keep questions role-appropriate.";

  return [
    `You are EchoPanel's live interview VOICE layer for a ${experienceLevel} ${role} candidate.`,
    "EchoPanel's Moderator is the authoritative orchestrator. You are NOT a generic assistant.",
    "Never say 'How can I help you today?' or offer open-ended chatbot help.",
    "You are conducting an adaptive multi-perspective interview (Technical, Product/Manager, Behavioural).",
    "Speak only the interview content EchoPanel authorizes. Prefer short spoken turns.",
    "Ask one question at a time. Listen fully. Allow the candidate to interrupt.",
    "Do not invent a parallel interview script that overrides EchoPanel routing.",
    "Do not make a hiring decision; human review remains available.",
    jd
  ].join(" ");
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "channel and requesterId are required." }, { status: 400 });
  }

  const config = agoraConfig();
  if (!config.configured || !config.appId || !config.appCertificate || !config.pipelineId) {
    return NextResponse.json(
      { error: "Agora is not configured", missing: ["AGORA_APP_ID", "AGORA_APP_CERTIFICATE", "AGORA_PIPELINE_ID"] },
      { status: 503 }
    );
  }

  const { channel, requesterId, targetRole, jobDescription, experienceLevel, candidateName, greeting } = parsed.data;
  const interviewGreeting =
    greeting ||
    `Welcome to EchoPanel, ${candidateName}. I'll coordinate your adaptive interview for ${targetRole} across technical, product, and behavioural perspectives.`;

  try {
    const area = config.area === "EU" ? Area.EU : config.area === "AP" ? Area.AP : Area.US;
    const client = new AgoraClient({ appId: config.appId, appCertificate: config.appCertificate, area });
    const agent = new Agent({
      client,
      pipelineId: config.pipelineId,
      instructions: buildInstructions(targetRole, experienceLevel, jobDescription),
      greeting: interviewGreeting,
      turnDetection: {
        language: "en-US",
        config: {
          start_of_speech: { mode: "vad", vad_config: { interrupt_duration_ms: 160, prefix_padding_ms: 300 } },
          end_of_speech: { mode: "vad", vad_config: { silence_duration_ms: 480 } }
        }
      },
      advancedFeatures: { enable_rtm: true },
      parameters: { data_channel: "rtm", enable_error_message: true, enable_metrics: true }
    });

    const session = agent.createSession({
      channel,
      agentUid: DEFAULT_AGENT_UID,
      remoteUids: [requesterId],
      idleTimeout: 120,
      expiresIn: ExpiresIn.hours(1),
      debug: false
    });

    const agentId = await session.start();
    return NextResponse.json({
      agentId,
      state: "RUNNING",
      agentUid: DEFAULT_AGENT_UID,
      greeting: interviewGreeting
    });
  } catch (error) {
    console.error("Agora agent start failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Agora agent start failed" },
      { status: 502 }
    );
  }
}
