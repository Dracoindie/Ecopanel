import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { POST as speakPOST } from "../app/api/interview/speak/route";
import { POST as interruptPOST } from "../app/api/interview/interrupt/route";

type Row = Record<string, unknown>;

const mockSpeak = vi.fn();
const mockInterrupt = vi.fn();
const mockGenerateConvoAIToken = vi.fn();
const mockRequireInterviewAccess = vi.fn();
let sessions: Row[] = [];

vi.mock("@/lib/server/db", () => ({
  getPrisma: () => ({
    liveInterviewSession: {
      findFirst: vi.fn(async ({ where }: { where: Row }) =>
        sessions.find(row => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null)
    }
  })
}));
vi.mock("@/lib/server/interview-access", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/server/interview-access")>()),
  requireInterviewAccess: (...args: unknown[]) => mockRequireInterviewAccess(...args)
}));
vi.mock("agora-agents", () => ({
  Area: { US: "us", EU: "eu", AP: "ap" },
  generateConvoAIToken: (...args: unknown[]) => mockGenerateConvoAIToken(...args),
  AgoraClient: vi.fn().mockImplementation(() => ({ agents: { speak: mockSpeak, interrupt: mockInterrupt } }))
}));

const orgA = { kind: "hr", organizationId: "org-a", userId: "user-a", interviewId: null, candidateSessionId: null };
const candidateA = { kind: "candidate", organizationId: "org-a", userId: null, interviewId: "int-a", candidateSessionId: "cs-a" };

function post(path: string, body: unknown) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

const routes = [
  { name: "speak", call: speakPOST, path: "/api/interview/speak", agora: mockSpeak, extra: { text: "Tell me more." } },
  { name: "interrupt", call: interruptPOST, path: "/api/interview/interrupt", agora: mockInterrupt, extra: {} }
];

describe.each(routes)("POST /api/interview/$name organization scoping", ({ call, path, agora, extra }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AGORA_APP_ID = "test-app-id";
    process.env.AGORA_APP_CERTIFICATE = "test-app-cert";
    sessions = [
      { organizationId: "org-a", interviewId: "int-a", agentId: "agent-a", channel: "echopanel-int-a-1111", status: "RUNNING" },
      { organizationId: "org-a", interviewId: "int-a2", agentId: "agent-a2", channel: "echopanel-int-a2-3333", status: "RUNNING" },
      { organizationId: "org-b", agentId: "agent-b", channel: "echopanel-int-b-2222", status: "RUNNING" },
      { organizationId: "org-a", agentId: "agent-old", channel: "echopanel-int-a-0000", status: "STOPPED" }
    ];
    mockRequireInterviewAccess.mockResolvedValue({ context: orgA });
    mockGenerateConvoAIToken.mockReturnValue("convoai-token");
    agora.mockResolvedValue({});
  });

  it("commands the caller's own running agent using the stored channel and server agent uid", async () => {
    const response = await call(post(path, { agentId: "agent-a", channel: "echopanel-int-a-1111", agentUid: 999, ...extra }));

    expect(response.status).toBe(200);
    expect(mockGenerateConvoAIToken).toHaveBeenCalledWith(expect.objectContaining({ channelName: "echopanel-int-a-1111", uid: 741001 }));
    expect(agora).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["another organization's agent", { agentId: "agent-b", channel: "echopanel-int-b-2222" }],
    ["own agent with another organization's channel", { agentId: "agent-a", channel: "echopanel-int-b-2222" }],
    ["own agent with an arbitrary channel", { agentId: "agent-a", channel: "made-up" }],
    ["an unknown agent", { agentId: "agent-unknown", channel: "echopanel-int-a-1111" }],
    ["a stopped agent", { agentId: "agent-old", channel: "echopanel-int-a-0000" }]
  ])("refuses %s without calling Agora", async (_label, ids) => {
    const response = await call(post(path, { ...ids, agentUid: 741001, ...extra }));

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("LIVE_SESSION_NOT_FOUND");
    expect(mockGenerateConvoAIToken).not.toHaveBeenCalled();
    expect(agora).not.toHaveBeenCalled();
  });

  it("lets an invited candidate command the agent of their own interview", async () => {
    mockRequireInterviewAccess.mockResolvedValue({ context: candidateA });

    const response = await call(post(path, { agentId: "agent-a", channel: "echopanel-int-a-1111", agentUid: 741001, ...extra }));

    expect(response.status).toBe(200);
    expect(agora).toHaveBeenCalledTimes(1);
  });

  it("refuses a candidate commanding another interview's agent in the same organization", async () => {
    mockRequireInterviewAccess.mockResolvedValue({ context: candidateA });

    const response = await call(post(path, { agentId: "agent-a2", channel: "echopanel-int-a2-3333", agentUid: 741001, ...extra }));

    expect(response.status).toBe(404);
    expect(mockGenerateConvoAIToken).not.toHaveBeenCalled();
    expect(agora).not.toHaveBeenCalled();
  });

  it("returns the access response for unauthenticated callers without calling Agora", async () => {
    mockRequireInterviewAccess.mockResolvedValue({ response: NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 }) });

    const response = await call(post(path, { agentId: "agent-a", channel: "echopanel-int-a-1111", agentUid: 741001, ...extra }));

    expect(response.status).toBe(401);
    expect(agora).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400 without calling Agora", async () => {
    const response = await call(post(path, "{not json"));

    expect(response.status).toBe(400);
    expect(agora).not.toHaveBeenCalled();
  });
});
