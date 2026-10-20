import { NextResponse } from "next/server";
import { z } from "zod";
import { AgoraClient, Area, generateConvoAIToken } from "agora-agents";
import { agoraConfig } from "@/lib/agora";

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
  const body = schema.safeParse(await request.json());
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

  try {
    const area = config.area === "EU" ? Area.EU : config.area === "AP" ? Area.AP : Area.US;
    const client = new AgoraClient({ appId: config.appId, appCertificate: config.appCertificate, area });

    const token = generateConvoAIToken({
      appId: config.appId,
      appCertificate: config.appCertificate,
      channelName: body.data.channel,
      uid: Number(body.data.agentUid)
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
    console.error("Agora agent speak failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to broadcast speech to Agora agent" },
      { status: 502 }
    );
  }
}

