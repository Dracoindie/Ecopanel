import { NextResponse } from "next/server";
import { AgoraClient, Area } from "agora-agents";
import { z } from "zod";
import { agoraConfig } from "@/lib/agora";
const schema = z.object({ agentId: z.string().min(1) });
export async function POST(request: Request) {
  const body = schema.safeParse(await request.json()); if (!body.success) return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  const config = agoraConfig(); if (!config.appId || !config.appCertificate) return NextResponse.json({ error: "Agora is not configured" }, { status: 503 });
  try { const area = config.area === "EU" ? Area.EU : config.area === "AP" ? Area.AP : Area.US; await new AgoraClient({ appId: config.appId, appCertificate: config.appCertificate, area }).stopAgent(body.data.agentId); return NextResponse.json({ success: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to stop Agora agent" }, { status: 502 }); }
}
