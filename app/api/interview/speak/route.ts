import { NextResponse } from "next/server";
import { requireInterviewAccess } from "@/lib/server/interview-access";
import { z } from "zod";
import { AgoraClient, Area, generateConvoAIToken } from "agora-agents";
import { agoraConfig } from "@/lib/agora";
import { resolveAgentTarget } from "@/lib/server/live-session";
import { logError } from "@/lib/server/logger";

const schema = z.object({
  agentId: z.string().min(1),
  channel: z.string().min(1),
  agentUid: z.union([z.number(), z.string().regex(/^\d+$/)]),
  text: z.string().min(1),
  priority: z.enum(["INTERRUPT", "APPEND", "IGNORE"]).default("INTERRUPT"),
  interruptable: z.boolean().default(true)
});

/**
 * Commands the running Agora Conversational AI agent to broadcast a customized question or comment via TTS.
 */
export async function POST(request: Request) {
  const access = await requireInterviewAccess(request, "interview-api", 60);
  if ("response" in access) return access.response;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: "agentId, channel, agentUid, and text are required" },
      { status: 400 }
    );
  }

  const config = agoraConfig();
  if (!config.appId || !config.appCertificate) {
    return NextResponse.json({ error: "Agora credentials missing" }, { status: 503 });
  }

  const target = await resolveAgentTarget(access.context, body.data);
  if (!target) {
    return NextResponse.json({ error: "Live session not found.", code: "LIVE_SESSION_NOT_FOUND" }, { status: 404 });
  }

  try {
    const area = config.area === "EU" ? Area.EU : config.area === "AP" ? Area.AP : Area.US;
    const client = new AgoraClient({ appId: config.appId, appCertificate: config.appCertificate, area });

    const token = generateConvoAIToken({
      appId: config.appId,
      appCertificate: config.appCertificate,
      channelName: target.channel,
      uid: target.agentUid
    });

    // Official Agora Conversational AI SDK speak API with ConvoAI auth header
    await client.agents.speak(
      {
        appid: config.appId,
        agentId: body.data.agentId,
        text: body.data.text,
        priority: body.data.priority,
        interruptable: body.data.interruptable
      },
      {
        headers: {
          Authorization: `agora token=${token}`
        }
      }
    );

    return NextResponse.json({ success: true, text: body.data.text });
  } catch (error) {
    logError("Agora agent speak failed", {
      requestId: request.headers.get("x-request-id") ?? undefined,
      error
    });
    return NextResponse.json(
      { error: "The interview agent could not speak.", code: "AGORA_SPEAK_FAILED" },
      { status: 502 }
    );
  }
}

