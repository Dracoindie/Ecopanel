import { NextResponse } from "next/server";
import { AgoraClient, Area } from "agora-agents";
import { z } from "zod";
import { agoraConfig } from "@/lib/agora";
import { getPrisma } from "@/lib/server/db";
import { interviewScope, requireInterviewAccess } from "@/lib/server/interview-access";
import { logError } from "@/lib/server/logger";
const schema = z.object({ agentId: z.string().min(1).max(128) });
export async function POST(request: Request) {
  const access = await requireInterviewAccess(request, "stop", 20); if ("response" in access) return access.response;
  const body = schema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  const config = agoraConfig(); if (!config.appId || !config.appCertificate) return NextResponse.json({ error: "Agora is not configured" }, { status: 503 });
  // In database mode the agent must belong to a running session the caller may control.
  const session = access.context
    ? await getPrisma().liveInterviewSession.findFirst({ where: { agentId: body.data.agentId, organizationId: access.context.organizationId, status: "RUNNING", ...interviewScope(access.context) }, select: { id: true } })
    : null;
  if (access.context && !session) return NextResponse.json({ error: "Live session not found.", code: "LIVE_SESSION_NOT_FOUND" }, { status: 404 });
  try {
    const area = config.area === "EU" ? Area.EU : config.area === "AP" ? Area.AP : Area.US;
    await new AgoraClient({ appId: config.appId, appCertificate: config.appCertificate, area }).stopAgent(body.data.agentId);
    if (access.context && session) await getPrisma().liveInterviewSession.updateMany({ where: { id: session.id, organizationId: access.context.organizationId }, data: { status: "STOPPED" } });
    return NextResponse.json({ success: true });
  }
  catch (error) { logError("Agora agent stop failed", { requestId: request.headers.get("x-request-id") ?? undefined, error }); return NextResponse.json({ error: "The interview agent could not be stopped.", code: "AGORA_STOP_FAILED" }, { status: 502 }); }
}
