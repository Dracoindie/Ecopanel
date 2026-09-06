import { NextResponse } from "next/server";
import { z } from "zod";
import { AgoraClient, Area } from "agora-agents";
import { agoraConfig } from "@/lib/agora";

const schema = z.object({ agentId: z.string().min(1) });

/** Stops an in-flight autonomous pipeline turn before EchoPanel analyzes it. */
export async function POST(request: Request) {
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "agentId is required" }, { status: 400 });

  const config = agoraConfig();
  if (!config.appId || !config.appCertificate) {
    return NextResponse.json({ error: "Agora credentials missing" }, { status: 503 });
  }

  try {
    const area = config.area === "EU" ? Area.EU : config.area === "AP" ? Area.AP : Area.US;
    const client = new AgoraClient({ appId: config.appId, appCertificate: config.appCertificate, area });
    await client.agents.interrupt({ appid: config.appId, agentId: body.data.agentId });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Agora agent interrupt failed:", error);
    return NextResponse.json({ error: "Unable to interrupt Agora agent" }, { status: 502 });
  }
}
