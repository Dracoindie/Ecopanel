import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as startPOST } from "../app/api/agora/start/route";
import { AGENT_TURN_DETECTION } from "../lib/agora";

const mockAgentOptions = vi.fn();
const mockStart = vi.fn();
const mockUpdate = vi.fn();
const mockGenerateConvoAIToken = vi.fn();
const mockLogWarn = vi.fn();

vi.mock("@/lib/server/interview-access", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/server/interview-access")>()),
  requireInterviewAccess: vi.fn(async () => ({ context: null }))
}));
vi.mock("@/lib/server/logger", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/server/logger")>()),
  logWarn: (...args: unknown[]) => mockLogWarn(...args)
}));
vi.mock("agora-agents", () => ({
  Area: { US: "us", EU: "eu", AP: "ap" },
  ExpiresIn: { hours: (h: number) => h * 3600 },
  generateConvoAIToken: (...args: unknown[]) => mockGenerateConvoAIToken(...args),
  AgoraClient: vi.fn().mockImplementation(() => ({ stopAgent: vi.fn(), agents: { update: mockUpdate } })),
  Agent: vi.fn().mockImplementation((options: unknown) => {
    mockAgentOptions(options);
    return { createSession: () => ({ start: mockStart }) };
  })
}));

function start() {
  return startPOST(new Request("http://localhost/api/agora/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel: "echopanel-int-1-abcd1234", requesterId: "1234567" })
  }));
}

describe("POST /api/agora/start agent configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AGORA_APP_ID = "test-app-id";
    process.env.AGORA_APP_CERTIFICATE = "test-app-cert";
    process.env.AGORA_PIPELINE_ID = "test-pipeline";
    mockStart.mockResolvedValue("agent-1");
    mockUpdate.mockResolvedValue({});
    mockGenerateConvoAIToken.mockReturnValue("convoai-token");
  });

  it("re-applies the prompt with the ConvoAI authorization header for the agent's channel", async () => {
    const response = await start();

    expect(response.status).toBe(200);
    expect(mockGenerateConvoAIToken).toHaveBeenCalledWith({
      appId: "test-app-id",
      appCertificate: "test-app-cert",
      channelName: "echopanel-int-1-abcd1234",
      uid: 741001
    });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ appid: "test-app-id", agentId: "agent-1" }),
      { headers: { Authorization: "agora token=convoai-token" } }
    );
  });

  it("starts the agent with 600 ms barge-in so brief noise or echo cannot cut it off", async () => {
    await start();

    const options = mockAgentOptions.mock.calls[0][0] as { turnDetection: typeof AGENT_TURN_DETECTION };
    expect(options.turnDetection).toEqual(AGENT_TURN_DETECTION);
    expect(options.turnDetection.config.start_of_speech.vad_config.interrupt_duration_ms).toBe(600);
    expect(options.turnDetection.config.end_of_speech.vad_config.silence_duration_ms).toBe(900);
  });

  it("still succeeds when the prompt update fails, without logging the token", async () => {
    mockUpdate.mockRejectedValue(new Error("Status code: 401"));

    const response = await start();

    expect(response.status).toBe(200);
    expect(mockLogWarn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mockLogWarn.mock.calls)).not.toContain("convoai-token");
  });
});
