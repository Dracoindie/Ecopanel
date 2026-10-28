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
  agentUid: z.union([z.number(), z.string().regex(/^\d+$/)])
});

/** Stops an in-flight autonomous pipeline turn before EchoPanel analyzes it. */
export async function POST(request: Request) {
  const access = await requireInterviewAccess(request, "interview-api", 60);
  if ("response" in access) return access.response;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: "agentId, channel, and agentUid are required" },
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

    await client.agents.interrupt(
      {
        appid: config.appId,
        agentId: body.data.agentId
      },
      {
        headers: {
          Authorization: `agora token=${token}`
        }
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("Agora agent interrupt failed", {
      requestId: request.headers.get("x-request-id") ?? undefined,
      error
    });
    return NextResponse.json(
      { error: "The interview agent could not be interrupted.", code: "AGORA_INTERRUPT_FAILED" },
      { status: 502 }
    );
  }
}

