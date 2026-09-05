/** Server-only configuration guard. Certificates never cross this module boundary. */
export const DEFAULT_AGENT_UID = "741001";
export const TOKEN_TTL_SECONDS = 60 * 60;
export function agoraConfig() {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;
  const pipelineId = process.env.AGORA_PIPELINE_ID;
  return { configured: Boolean(appId && appCertificate && pipelineId), appId, appCertificate, pipelineId, area: process.env.AGORA_AREA || "US", channelPrefix: process.env.AGORA_CHANNEL_PREFIX || "echopanel" };
}
export function createChannel(interviewId: string) { const id = interviewId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "live"; return `${agoraConfig().channelPrefix}-${id}-${crypto.randomUUID().slice(0, 8)}`; }
