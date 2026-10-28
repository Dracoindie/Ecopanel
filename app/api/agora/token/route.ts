import { NextResponse } from "next/server";
import { RtcRole, RtcTokenBuilder } from "agora-token";
import { z } from "zod";
import { agoraConfig, createChannel, DEFAULT_AGENT_UID, TOKEN_TTL_SECONDS } from "@/lib/agora";
import { requireInterviewAccess } from "@/lib/server/interview-access";
import { getPrisma } from "@/lib/server/db";
// Any client-supplied channel is ignored: the channel is always minted server-side.
const requestSchema = z.object({ interviewId: z.string().min(1).max(64) });
/** Issues an RTC+RTM token. The App Certificate remains on the server. */
export async function POST(request: Request) {
  const access = await requireInterviewAccess(request, "token", 20); if ("response" in access) return access.response;
  const body = requestSchema.safeParse(await request.json().catch(() => null)); if (!body.success) return NextResponse.json({ error: "A valid interviewId is required." }, { status: 400 });
  const config = agoraConfig(); if (!config.appId || !config.appCertificate) return NextResponse.json({ error: "Agora is not configured", missing: ["AGORA_APP_ID", "AGORA_APP_CERTIFICATE"] }, { status: 503 });
  const uid = String(Math.floor(Math.random() * 8_000_000) + 1_000_000); const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  let channel = createChannel(body.data.interviewId);
  if (access.context) {
    const context = access.context;
    // A candidate session only ever matches its own interview; recruiters any in their organization.
    const notFound = NextResponse.json({ error: "Interview not found.", code: "INTERVIEW_NOT_FOUND" }, { status: 404 });
    if (context.interviewId && context.interviewId !== body.data.interviewId) return notFound;
    const interview = await getPrisma().interview.findFirst({ where: { id: body.data.interviewId, organizationId: context.organizationId }, select: { id: true } });
    if (!interview) return notFound;
    // The stored session binds this channel to the caller; start/stop/speak/interrupt authorize against it.
    const session = await getPrisma().liveInterviewSession.create({
      data: { organizationId: context.organizationId, createdByUserId: context.userId, candidateSessionId: context.candidateSessionId, interviewId: interview.id, channel, expiresAt: new Date(expiresAt * 1000) },
      select: { channel: true }
    });
    channel = session.channel;
  }
  const token = RtcTokenBuilder.buildTokenWithRtm(config.appId, config.appCertificate, channel, uid, RtcRole.PUBLISHER, expiresAt, expiresAt);
  return NextResponse.json({ appId: config.appId, channel, uid, token, expiresAt, agentUid: DEFAULT_AGENT_UID });
}
