import { NextResponse } from "next/server";
import { Agent, AgoraClient, Area, ExpiresIn } from "agora-agents";
import { z } from "zod";
import { agoraConfig, DEFAULT_AGENT_UID } from "@/lib/agora";
const schema = z.object({ channel: z.string().min(1).max(64), requesterId: z.string().regex(/^\d+$/), targetRole: z.string().min(1).max(120).default("Software Engineer") });
const instructions = (role: string) => `You are EchoPanel's live interview moderator for a ${role} candidate. Conduct a concise, fair, AI-assisted interview. Ask one question at a time, listen fully, and allow the candidate to interrupt. Focus first on technical evidence, then ask about customer or business impact when it is missing, and then behaviour and ownership. Do not make a hiring decision; explain that human review remains available. Keep spoken turns short.`;
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "channel and requesterId are required." }, { status: 400 });
  const config = agoraConfig(); if (!config.configured || !config.appId || !config.appCertificate || !config.pipelineId) return NextResponse.json({ error: "Agora is not configured", missing: ["AGORA_APP_ID", "AGORA_APP_CERTIFICATE", "AGORA_PIPELINE_ID"] }, { status: 503 });
  try {
    const area = config.area === "EU" ? Area.EU : config.area === "AP" ? Area.AP : Area.US;
    const client = new AgoraClient({ appId: config.appId, appCertificate: config.appCertificate, area });
    const agent = new Agent({ client, pipelineId: config.pipelineId, instructions: instructions(parsed.data.targetRole), turnDetection: { language: "en-US", config: { start_of_speech: { mode: "vad", vad_config: { interrupt_duration_ms: 160, prefix_padding_ms: 300 } }, end_of_speech: { mode: "vad", vad_config: { silence_duration_ms: 480 } } } }, advancedFeatures: { enable_rtm: true }, parameters: { data_channel: "rtm", enable_error_message: true, enable_metrics: true } });
    const session = agent.createSession({ channel: parsed.data.channel, agentUid: DEFAULT_AGENT_UID, remoteUids: [parsed.data.requesterId], idleTimeout: 120, expiresIn: ExpiresIn.hours(1), debug: false });
    const agentId = await session.start(); return NextResponse.json({ agentId, state: "RUNNING", agentUid: DEFAULT_AGENT_UID });
  } catch (error) { console.error("Agora agent start failed", error); return NextResponse.json({ error: error instanceof Error ? error.message : "Agora agent start failed" }, { status: 502 }); }
}
