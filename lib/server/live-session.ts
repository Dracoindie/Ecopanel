import { DEFAULT_AGENT_UID } from "@/lib/agora";
import { getPrisma } from "@/lib/server/db";
import { interviewScope, type InterviewAccessContext } from "@/lib/server/interview-access";

export interface AgentTarget {
  channel: string;
  agentUid: number;
}

/**
 * Resolves which Agora channel/agent a speak or interrupt command may target.
 * In database mode the agent must belong to a running session the caller may
 * control (their organization; for candidates, their own interview), and the
 * stored channel is used; a client-supplied channel that does not match is
 * rejected. Demo mode (no context) keeps the client values.
 */
export async function resolveAgentTarget(
  context: InterviewAccessContext | null,
  input: { agentId: string; channel: string; agentUid: number | string }
): Promise<AgentTarget | null> {
  if (!context) return { channel: input.channel, agentUid: Number(input.agentUid) };

  const session = await getPrisma().liveInterviewSession.findFirst({
    where: { agentId: input.agentId, organizationId: context.organizationId, status: "RUNNING", ...interviewScope(context) },
    select: { channel: true }
  });
  if (!session || session.channel !== input.channel) return null;
  return { channel: session.channel, agentUid: Number(DEFAULT_AGENT_UID) };
}
