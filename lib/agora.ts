/** Server-only configuration guard. Certificates never cross this module boundary. */
import { logWarn } from "@/lib/server/logger";

export const DEFAULT_AGENT_UID = "741001";
export const TOKEN_TTL_SECONDS = 60 * 60;
/**
 * Agent turn detection. Barge-in needs 600 ms of detected speech: at 160 ms,
 * brief noise or a phone speaker's echo could cut the agent off after a syllable.
 */
export const AGENT_TURN_DETECTION = {
  config: {
    start_of_speech: { mode: "vad" as const, vad_config: { interrupt_duration_ms: 600, prefix_padding_ms: 300 } },
    end_of_speech: { mode: "vad" as const, vad_config: { silence_duration_ms: 480 } }
  }
};
const DEFAULT_CHANNEL_PREFIX = "echopanel";
const CHANNEL_PREFIX_PATTERN = /^[A-Za-z0-9_]{1,20}$/;
let warnedInvalidPrefix = false;

/**
 * Channel names are sent to the browser and to Agora (max 64 bytes), so an
 * invalid prefix is never partially reused: it falls back to the default.
 */
function channelPrefix() {
  const raw = process.env.AGORA_CHANNEL_PREFIX?.trim();
  if (!raw) return DEFAULT_CHANNEL_PREFIX;
  if (CHANNEL_PREFIX_PATTERN.test(raw)) return raw;
  if (!warnedInvalidPrefix) {
    warnedInvalidPrefix = true;
    logWarn("AGORA_CHANNEL_PREFIX is invalid (expected 1-20 letters, digits or underscores); using the default prefix.");
  }
  return DEFAULT_CHANNEL_PREFIX;
}

export function agoraConfig() {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;
  const pipelineId = process.env.AGORA_PIPELINE_ID;
  return { configured: Boolean(appId && appCertificate && pipelineId), appId, appCertificate, pipelineId, area: process.env.AGORA_AREA || "US", channelPrefix: channelPrefix() };
}
/** At most 20 + 1 + 32 + 1 + 8 = 62 characters from [A-Za-z0-9_-]. */
export function createChannel(interviewId: string) { const id = interviewId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "live"; return `${channelPrefix()}-${id}-${crypto.randomUUID().slice(0, 8)}`; }
