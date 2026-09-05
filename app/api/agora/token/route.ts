import { NextResponse } from "next/server";
import { RtcRole, RtcTokenBuilder } from "agora-token";
import { z } from "zod";
import { agoraConfig, createChannel, DEFAULT_AGENT_UID, TOKEN_TTL_SECONDS } from "@/lib/agora";
const requestSchema = z.object({ interviewId: z.string().min(1).max(64), channel: z.string().min(1).max(64).optional() });
/** Issues an RTC+RTM token. The App Certificate remains on the server. */
export async function POST(request: Request) {
  const body = requestSchema.safeParse(await request.json()); if (!body.success) return NextResponse.json({ error: "A valid interviewId is required." }, { status: 400 });
  const config = agoraConfig(); if (!config.appId || !config.appCertificate) return NextResponse.json({ error: "Agora is not configured", missing: ["AGORA_APP_ID", "AGORA_APP_CERTIFICATE"] }, { status: 503 });
  const uid = String(Math.floor(Math.random() * 8_000_000) + 1_000_000); const channel = body.data.channel || createChannel(body.data.interviewId); const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const token = RtcTokenBuilder.buildTokenWithRtm(config.appId, config.appCertificate, channel, uid, RtcRole.PUBLISHER, expiresAt, expiresAt);
  return NextResponse.json({ appId: config.appId, channel, uid, token, expiresAt, agentUid: DEFAULT_AGENT_UID });
}
