import { NextResponse } from "next/server";
import { Agent, AgoraClient, Area, ExpiresIn, generateConvoAIToken } from "agora-agents";
import { z } from "zod";
import { AGENT_TURN_DETECTION, agoraConfig, DEFAULT_AGENT_UID } from "@/lib/agora";
import { getPrisma } from "@/lib/server/db";
import { interviewScope, requireInterviewAccess } from "@/lib/server/interview-access";
import { logError, logInfo, logWarn } from "@/lib/server/logger";

const schema = z.object({
  channel: z.string().min(1).max(64),
  requesterId: z.string().regex(/^\d+$/),
  targetRole: z.string().min(1).max(120).default("Software Engineer"),
  jobDescription: z.string().max(4000).optional().default(""),
  experienceLevel: z.string().max(40).optional().default("Mid"),
  candidateName: z.string().max(80).optional().default("Candidate"),
  greeting: z.string().max(600).optional(),
  openingQuestion: z.string().max(1200).optional()
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
  const access = await requireInterviewAccess(request, "start", 10);
  if ("response" in access) return access.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
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

  const { channel, requesterId, targetRole, jobDescription, experienceLevel, candidateName, greeting, openingQuestion } = parsed.data;

  // In database mode the channel must have been minted by /api/agora/token for
  // the caller's organization. Claiming PENDING -> STARTING also prevents the
  // same session from launching more than one agent.
  const organizationId = access.context?.organizationId;
  if (access.context && organizationId) {
    const claimed = await getPrisma().liveInterviewSession.updateMany({
      where: { channel, organizationId, status: "PENDING", expiresAt: { gt: new Date() }, ...interviewScope(access.context) },
      data: { status: "STARTING" }
    });
    if (claimed.count !== 1) {
      return NextResponse.json({ error: "Live session not found.", code: "LIVE_SESSION_NOT_FOUND" }, { status: 404 });
    }
  }

  const interviewGreeting =
    greeting ||
    `Welcome to EchoPanel, ${candidateName}. I'll coordinate your adaptive interview for ${targetRole} across technical, product, and behavioural perspectives.`;

  try {
    const area = config.area === "EU" ? Area.EU : config.area === "AP" ? Area.AP : Area.US;
    const client = new AgoraClient({ appId: config.appId, appCertificate: config.appCertificate, area });
    const promptInstruction = [
      buildInstructions(targetRole, experienceLevel, jobDescription),
      "You are the voice output layer for EchoPanel. EchoPanel controls the interview.",
      "Do not independently conduct the interview or answer a candidate turn.",
      "EchoPanel will interrupt every candidate turn and use the supported speak endpoint for authorized output.",
      "Do not introduce yourself as a generic assistant. Do not answer the candidate independently.",
      "Do not say 'How can I help you today?' or 'I\\'m an AI developed by OpenAI'.",
      "When the candidate speaks, remain silent and yield the floor to EchoPanel's Moderator."
    ].join(" ");

    // AgentSession supplies the required ConvoAI authorization header. With a
    // pipelineId and no withLlm(), agora-agents sends neither the greeting nor
    // the instructions here (they belong to the omitted llm block): the agent
    // greets with the Console pipeline's message. The client speaks EchoPanel's
    // opening through /api/interview/speak, and the prompt is applied below.
    const agent = new Agent({
      client,
      pipelineId: config.pipelineId,
      instructions: promptInstruction,
      greeting: `${interviewGreeting} ${openingQuestion || ""}`.trim(),
      turnDetection: AGENT_TURN_DETECTION,
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

    if (organizationId) {
      try {
        await getPrisma().liveInterviewSession.updateMany({
          where: { channel, organizationId, status: "STARTING" },
          data: { agentId, status: "RUNNING" }
        });
      } catch (recordErr) {
        // Without a stored agentId the agent could never be stopped through this API.
        await client.stopAgent(agentId).catch(() => undefined);
        throw recordErr;
      }
    }

    // Re-apply the output-only prompt after the pipeline is running. Like speak
    // and interrupt, the update endpoint requires the ConvoAI token header.
    if (agentId) {
      try {
        const convoToken = generateConvoAIToken({
          appId: config.appId,
          appCertificate: config.appCertificate,
          channelName: channel,
          uid: Number(DEFAULT_AGENT_UID)
        });
        await client.agents.update({
          appid: config.appId,
          agentId,
          properties: {
            llm: {
              system_messages: [
                {
                  role: "system",
                  content: promptInstruction
                }
              ]
            }
          }
        }, { headers: { Authorization: `agora token=${convoToken}` } });
        logInfo("Agora agent prompt updated after start", {
          requestId: request.headers.get("x-request-id") ?? undefined
        });
      } catch (updateErr) {
        logWarn("Could not update the Agora agent prompt after start", {
          requestId: request.headers.get("x-request-id") ?? undefined,
          error: updateErr
        });
      }
    }

    return NextResponse.json({
      agentId,
      state: "RUNNING",
      agentUid: DEFAULT_AGENT_UID,
      greeting: interviewGreeting
    });
  } catch (error) {
    if (organizationId) {
      // Release the claim so the owner can retry with the same session.
      await getPrisma()
        .liveInterviewSession.updateMany({ where: { channel, organizationId, status: "STARTING" }, data: { status: "PENDING" } })
        .catch(() => undefined);
    }
    logError("Agora agent start failed", {
      requestId: request.headers.get("x-request-id") ?? undefined,
      error
    });
    return NextResponse.json(
      { error: "The interview agent could not be started.", code: "AGORA_START_FAILED" },
      { status: 502 }
    );
  }
}
