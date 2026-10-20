import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST as speakPOST } from "../app/api/interview/speak/route";
import { POST as interruptPOST } from "../app/api/interview/interrupt/route";

const mockSpeak = vi.fn();
const mockInterrupt = vi.fn();
const mockGenerateConvoAIToken = vi.fn();

vi.mock("agora-agents", () => {
  return {
    Area: { US: "us", EU: "eu", AP: "ap" },
    generateConvoAIToken: (...args: unknown[]) => mockGenerateConvoAIToken(...args),
    AgoraClient: vi.fn().mockImplementation(() => ({
      agents: {
        speak: mockSpeak,
        interrupt: mockInterrupt
      }
    }))
  };
});

describe("Agora ConvoAI Authenticated Routes", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      AGORA_APP_ID: "mock-app-id-12345",
      AGORA_APP_CERTIFICATE: "mock-app-cert-67890",
      AGORA_PIPELINE_ID: "mock-pipeline-id-abcde",
      AGORA_AREA: "US"
    };
    mockSpeak.mockResolvedValue({ success: true });
    mockInterrupt.mockResolvedValue({ success: true });
    mockGenerateConvoAIToken.mockReturnValue("mock-convoai-token-xyz");
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("POST /api/interview/speak", () => {
    it("generates ConvoAI token and calls client.agents.speak with Authorization header", async () => {
      const payload = {
        agentId: "agent-session-999",
        channel: "echopanel-test-chan",
        agentUid: 741001,
        text: "Can you elaborate on your Redis caching strategy?",
        priority: "INTERRUPT",
        interruptable: true
      };

      const request = new Request("http://localhost:3000/api/interview/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const response = await speakPOST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);

      expect(mockGenerateConvoAIToken).toHaveBeenCalledTimes(1);
      expect(mockGenerateConvoAIToken).toHaveBeenCalledWith({
        appId: "mock-app-id-12345",
        appCertificate: "mock-app-cert-67890",
        channelName: "echopanel-test-chan",
        uid: 741001
      });

      expect(mockSpeak).toHaveBeenCalledTimes(1);
      expect(mockSpeak).toHaveBeenCalledWith(
        {
          appid: "mock-app-id-12345",
          agentId: "agent-session-999",
          text: "Can you elaborate on your Redis caching strategy?",
          priority: "INTERRUPT",
          interruptable: true
        },
        {
          headers: {
            Authorization: "agora token=mock-convoai-token-xyz"
          }
        }
      );
    });

    it("rejects when channel or agentUid is missing", async () => {
      const payload = {
        agentId: "agent-session-999",
        text: "Incomplete payload test"
      };

      const request = new Request("http://localhost:3000/api/interview/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const response = await speakPOST(request);
      expect(response.status).toBe(400);
      expect(mockGenerateConvoAIToken).not.toHaveBeenCalled();
      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it("returns 502 when Agora speak fails and preserves sanitized error message", async () => {
      mockSpeak.mockRejectedValue(new Error("401 Invalid authentication type"));

      const payload = {
        agentId: "agent-session-999",
        channel: "echopanel-test-chan",
        agentUid: "741001",
        text: "Testing failure",
        priority: "INTERRUPT",
        interruptable: true
      };

      const request = new Request("http://localhost:3000/api/interview/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const response = await speakPOST(request);
      const json = await response.json();

      expect(response.status).toBe(502);
      expect(json.error).toBe("401 Invalid authentication type");
    });
  });

  describe("POST /api/interview/interrupt", () => {
    it("generates ConvoAI token and calls client.agents.interrupt with Authorization header", async () => {
      const payload = {
        agentId: "agent-session-999",
        channel: "echopanel-test-chan",
        agentUid: 741001
      };

      const request = new Request("http://localhost:3000/api/interview/interrupt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const response = await interruptPOST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);

      expect(mockGenerateConvoAIToken).toHaveBeenCalledTimes(1);
      expect(mockGenerateConvoAIToken).toHaveBeenCalledWith({
        appId: "mock-app-id-12345",
        appCertificate: "mock-app-cert-67890",
        channelName: "echopanel-test-chan",
        uid: 741001
      });

      expect(mockInterrupt).toHaveBeenCalledTimes(1);
      expect(mockInterrupt).toHaveBeenCalledWith(
        {
          appid: "mock-app-id-12345",
          agentId: "agent-session-999"
        },
        {
          headers: {
            Authorization: "agora token=mock-convoai-token-xyz"
          }
        }
      );
    });

    it("rejects when channel or agentUid is missing", async () => {
      const payload = {
        agentId: "agent-session-999"
      };

      const request = new Request("http://localhost:3000/api/interview/interrupt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const response = await interruptPOST(request);
      expect(response.status).toBe(400);
      expect(mockGenerateConvoAIToken).not.toHaveBeenCalled();
      expect(mockInterrupt).not.toHaveBeenCalled();
    });

    it("returns 502 with observable error when interrupt fails", async () => {
      mockInterrupt.mockRejectedValue(new Error("Agora upstream gateway timeout"));

      const payload = {
        agentId: "agent-session-999",
        channel: "echopanel-test-chan",
        agentUid: 741001
      };

      const request = new Request("http://localhost:3000/api/interview/interrupt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const response = await interruptPOST(request);
      const json = await response.json();

      expect(response.status).toBe(502);
      expect(json.error).toBe("Agora upstream gateway timeout");
    });
  });
});
