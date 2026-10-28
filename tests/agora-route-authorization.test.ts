import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as tokenPOST } from "../app/api/agora/token/route";
import { POST as startPOST } from "../app/api/agora/start/route";
import { POST as stopPOST } from "../app/api/agora/stop/route";
import type { InterviewAccessContext } from "../lib/server/interview-access";

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const mockStopAgent = vi.fn();
const mockSessionStart = vi.fn();
const mockCreateSession = vi.fn();
const mockRequireInterviewAccess = vi.fn();

const store: { interviews: Row[]; sessions: Row[] } = { interviews: [], sessions: [] };

function matches(row: Row, where: Where) {
  return Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === "object" && "gt" in expected) {
      return (row[key] as Date) > (expected as { gt: Date }).gt;
    }
    return row[key] === expected;
  });
}

const fakePrisma = {
  interview: {
    findFirst: vi.fn(async ({ where }: { where: Where }) => store.interviews.find(row => matches(row, where)) ?? null)
  },
  liveInterviewSession: {
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = { id: `lis-${store.sessions.length + 1}`, status: "PENDING", agentId: null, ...data };
      store.sessions.push(row);
      return row;
    }),
    findFirst: vi.fn(async ({ where }: { where: Where }) => store.sessions.find(row => matches(row, where)) ?? null),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Row }) => {
      const rows = store.sessions.filter(row => matches(row, where));
      rows.forEach(row => Object.assign(row, data));
      return { count: rows.length };
    })
  }
};

vi.mock("@/lib/server/db", () => ({ getPrisma: () => fakePrisma }));
vi.mock("@/lib/server/interview-access", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/server/interview-access")>()),
  requireInterviewAccess: (...args: unknown[]) => mockRequireInterviewAccess(...args)
}));
vi.mock("agora-agents", () => ({
  Area: { US: "us", EU: "eu", AP: "ap" },
  ExpiresIn: { hours: (h: number) => h * 3600 },
  AgoraClient: vi.fn().mockImplementation(() => ({
    stopAgent: mockStopAgent,
    agents: { update: vi.fn().mockResolvedValue({}) }
  })),
  Agent: vi.fn().mockImplementation(() => ({ createSession: mockCreateSession }))
}));

type Access = InterviewAccessContext;
const orgA: Access = { kind: "hr", organizationId: "org-a", userId: "user-a", interviewId: null, candidateSessionId: null };
const orgB: Access = { kind: "hr", organizationId: "org-b", userId: "user-b", interviewId: null, candidateSessionId: null };
/** An invited candidate whose session is pinned to interview int-a (org-a). */
const candidateA: Access = { kind: "candidate", organizationId: "org-a", userId: null, interviewId: "int-a", candidateSessionId: "cs-a" };

function post(path: string, body: unknown) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

function signedInAs(context: Access | null) {
  mockRequireInterviewAccess.mockResolvedValue({ context });
}

async function issueToken(interviewId: string, extra: Row = {}) {
  const response = await tokenPOST(post("/api/agora/token", { interviewId, ...extra }));
  return { response, json: await response.json() };
}

describe("Agora route organization scoping", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    store.interviews = [
      { id: "int-a", organizationId: "org-a" },
      { id: "int-a2", organizationId: "org-a" },
      { id: "int-b", organizationId: "org-b" }
    ];
    store.sessions = [];
    process.env = {
      ...originalEnv,
      AGORA_APP_ID: "test-app-id",
      AGORA_APP_CERTIFICATE: "0123456789abcdef0123456789abcdef",
      AGORA_PIPELINE_ID: "test-pipeline",
      AGORA_CHANNEL_PREFIX: "echopanel"
    };
    mockSessionStart.mockResolvedValue("agent-a-1");
    mockCreateSession.mockReturnValue({ start: mockSessionStart });
    mockStopAgent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("POST /api/agora/token", () => {
    it("signs a token for a server-minted channel stored against the caller's organization", async () => {
      signedInAs(orgA);
      const { response, json } = await issueToken("int-a");

      expect(response.status).toBe(200);
      expect(json.channel).toMatch(/^echopanel-int-a-/);
      expect(typeof json.token).toBe("string");
      expect(store.sessions).toEqual([
        expect.objectContaining({ organizationId: "org-a", createdByUserId: "user-a", interviewId: "int-a", channel: json.channel, status: "PENDING" })
      ]);
    });

    it("ignores a client-supplied channel", async () => {
      signedInAs(orgA);
      const { response, json } = await issueToken("int-a", { channel: "victim-channel" });

      expect(response.status).toBe(200);
      expect(json.channel).not.toBe("victim-channel");
      expect(store.sessions[0].channel).toBe(json.channel);
    });

    it("returns 404 for another organization's interview without creating a session", async () => {
      signedInAs(orgA);
      const { response, json } = await issueToken("int-b");

      expect(response.status).toBe(404);
      expect(json.code).toBe("INTERVIEW_NOT_FOUND");
      expect(json.token).toBeUndefined();
      expect(store.sessions).toHaveLength(0);
    });

    it("rejects missing and malformed bodies with 400", async () => {
      signedInAs(orgA);
      expect((await tokenPOST(post("/api/agora/token", {}))).status).toBe(400);
      expect((await tokenPOST(post("/api/agora/token", "{not json"))).status).toBe(400);
      expect(store.sessions).toHaveLength(0);
    });
  });

  describe("POST /api/agora/start", () => {
    it("starts an agent on the caller's own channel and records the agentId", async () => {
      signedInAs(orgA);
      const { json: token } = await issueToken("int-a");

      const response = await startPOST(post("/api/agora/start", { channel: token.channel, requesterId: String(token.uid) }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.agentId).toBe("agent-a-1");
      expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({ channel: token.channel }));
      expect(store.sessions[0]).toMatchObject({ agentId: "agent-a-1", status: "RUNNING" });
    });

    it("refuses another organization's channel before calling Agora", async () => {
      signedInAs(orgB);
      const { json: victim } = await issueToken("int-b");

      signedInAs(orgA);
      const response = await startPOST(post("/api/agora/start", { channel: victim.channel, requesterId: "1234567" }));

      expect(response.status).toBe(404);
      expect((await response.json()).code).toBe("LIVE_SESSION_NOT_FOUND");
      expect(mockCreateSession).not.toHaveBeenCalled();
      expect(store.sessions[0].status).toBe("PENDING");
    });

    it("refuses an arbitrary channel that was never issued", async () => {
      signedInAs(orgA);
      const response = await startPOST(post("/api/agora/start", { channel: "echopanel-made-up", requesterId: "1234567" }));

      expect(response.status).toBe(404);
      expect(mockCreateSession).not.toHaveBeenCalled();
    });

    it("refuses a second start on the same session", async () => {
      signedInAs(orgA);
      const { json: token } = await issueToken("int-a");
      const body = { channel: token.channel, requesterId: String(token.uid) };

      expect((await startPOST(post("/api/agora/start", body))).status).toBe(200);
      expect((await startPOST(post("/api/agora/start", body))).status).toBe(404);
      expect(mockCreateSession).toHaveBeenCalledTimes(1);
    });

    it("releases the claim when Agora fails so the owner can retry", async () => {
      signedInAs(orgA);
      const { json: token } = await issueToken("int-a");
      mockSessionStart.mockRejectedValueOnce(new Error("upstream down"));

      const response = await startPOST(post("/api/agora/start", { channel: token.channel, requesterId: String(token.uid) }));

      expect(response.status).toBe(502);
      expect(store.sessions[0].status).toBe("PENDING");
    });

    it("rejects malformed JSON with 400", async () => {
      signedInAs(orgA);
      expect((await startPOST(post("/api/agora/start", "{not json"))).status).toBe(400);
    });
  });

  describe("POST /api/agora/stop", () => {
    async function runningAgentFor(context: Access, interviewId: string, agentId: string) {
      signedInAs(context);
      mockSessionStart.mockResolvedValueOnce(agentId);
      const { json: token } = await issueToken(interviewId);
      await startPOST(post("/api/agora/start", { channel: token.channel, requesterId: String(token.uid) }));
    }

    it("stops the caller's own running agent", async () => {
      await runningAgentFor(orgA, "int-a", "agent-a-1");

      const response = await stopPOST(post("/api/agora/stop", { agentId: "agent-a-1" }));

      expect(response.status).toBe(200);
      expect(mockStopAgent).toHaveBeenCalledWith("agent-a-1");
      expect(store.sessions[0].status).toBe("STOPPED");
    });

    it("refuses to stop another organization's agent", async () => {
      await runningAgentFor(orgB, "int-b", "agent-b-1");

      signedInAs(orgA);
      const response = await stopPOST(post("/api/agora/stop", { agentId: "agent-b-1" }));

      expect(response.status).toBe(404);
      expect((await response.json()).code).toBe("LIVE_SESSION_NOT_FOUND");
      expect(mockStopAgent).not.toHaveBeenCalled();
      expect(store.sessions[0].status).toBe("RUNNING");
    });

    it("refuses an arbitrary agentId", async () => {
      signedInAs(orgA);
      const response = await stopPOST(post("/api/agora/stop", { agentId: "agent-unknown" }));

      expect(response.status).toBe(404);
      expect(mockStopAgent).not.toHaveBeenCalled();
    });

    it("rejects missing and malformed bodies with 400", async () => {
      signedInAs(orgA);
      expect((await stopPOST(post("/api/agora/stop", {}))).status).toBe(400);
      expect((await stopPOST(post("/api/agora/stop", "{not json"))).status).toBe(400);
      expect(mockStopAgent).not.toHaveBeenCalled();
    });
  });

  describe("invited candidate (session pinned to int-a)", () => {
    async function recruiterChannel(interviewId: string) {
      signedInAs(orgA);
      return (await issueToken(interviewId)).json.channel as string;
    }

    it("gets a token for their own interview, recorded against the candidate session", async () => {
      signedInAs(candidateA);
      const { response, json } = await issueToken("int-a");

      expect(response.status).toBe(200);
      expect(store.sessions).toEqual([
        expect.objectContaining({ organizationId: "org-a", interviewId: "int-a", channel: json.channel, createdByUserId: null, candidateSessionId: "cs-a" })
      ]);
    });

    it.each(["int-a2", "int-b"])("cannot get a token for another interview (%s)", async interviewId => {
      signedInAs(candidateA);
      const { response } = await issueToken(interviewId);

      expect(response.status).toBe(404);
      expect(store.sessions).toHaveLength(0);
    });

    it("cannot start an agent on another interview's channel in the same organization", async () => {
      const otherChannel = await recruiterChannel("int-a2");

      signedInAs(candidateA);
      const response = await startPOST(post("/api/agora/start", { channel: otherChannel, requesterId: "1234567" }));

      expect(response.status).toBe(404);
      expect(mockCreateSession).not.toHaveBeenCalled();
    });

    it("cannot stop the agent of another interview in the same organization", async () => {
      const otherChannel = await recruiterChannel("int-a2");
      mockSessionStart.mockResolvedValueOnce("agent-a2");
      await startPOST(post("/api/agora/start", { channel: otherChannel, requesterId: "1234567" }));

      signedInAs(candidateA);
      const response = await stopPOST(post("/api/agora/stop", { agentId: "agent-a2" }));

      expect(response.status).toBe(404);
      expect(mockStopAgent).not.toHaveBeenCalled();
    });

    it("runs token, start and stop for their own interview", async () => {
      signedInAs(candidateA);
      mockSessionStart.mockResolvedValueOnce("agent-cand");
      const { json: token } = await issueToken("int-a");

      expect((await startPOST(post("/api/agora/start", { channel: token.channel, requesterId: String(token.uid) }))).status).toBe(200);
      expect((await stopPOST(post("/api/agora/stop", { agentId: "agent-cand" }))).status).toBe(200);
      expect(mockStopAgent).toHaveBeenCalledWith("agent-cand");
      expect(store.sessions[0].status).toBe("STOPPED");
    });
  });

  describe("demo mode (no organization context)", () => {
    it("keeps issuing tokens and stopping agents without database lookups", async () => {
      signedInAs(null);
      const { response } = await issueToken("demo-interview");
      expect(response.status).toBe(200);

      const stop = await stopPOST(post("/api/agora/stop", { agentId: "demo-agent" }));
      expect(stop.status).toBe(200);
      expect(fakePrisma.interview.findFirst).not.toHaveBeenCalled();
      expect(fakePrisma.liveInterviewSession.findFirst).not.toHaveBeenCalled();
    });
  });
});
