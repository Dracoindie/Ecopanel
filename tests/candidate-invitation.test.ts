import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HrContext } from "@/lib/server/session";

type Row = Record<string, unknown>;
const mockGetHrContext = vi.fn();

const store: { invitations: Row[]; sessions: Row[]; interviews: Row[]; applications: Row[]; events: Row[] } = {
  invitations: [], sessions: [], interviews: [], applications: [], events: []
};

function matches(row: Row, where: Row) {
  return Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      if ("gt" in expected) return (row[key] as Date) > (expected as { gt: Date }).gt;
    }
    return (row[key] ?? null) === expected;
  });
}

const fakePrisma: Record<string, unknown> = {
  candidateInvitation: {
    create: async ({ data }: { data: Row }) => {
      const row = { revokedAt: null, redeemedAt: null, createdAt: new Date(), ...data };
      store.invitations.push(row);
      return row;
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const rows = store.invitations.filter(row => matches(row, where));
      rows.forEach(row => Object.assign(row, data));
      return { count: rows.length };
    },
    findFirst: async ({ where }: { where: Row }) =>
      [...store.invitations].reverse().find(row => matches(row, where)) ?? null,
    findUnique: async ({ where }: { where: Row }) => {
      const invitation = store.invitations.find(row => row.tokenHash === where.tokenHash);
      if (!invitation) return null;
      const application = store.applications.find(row => row.id === invitation.applicationId)!;
      return {
        ...invitation,
        interview: store.interviews.find(row => row.id === invitation.interviewId),
        application: { ...application, candidate: { name: "Ada Candidate" }, job: { title: "Platform Engineer", description: "Build platforms." } }
      };
    }
  },
  candidateSession: {
    create: async ({ data }: { data: Row }) => {
      const row = { id: `cs-${store.sessions.length + 1}`, revokedAt: null, ...data };
      store.sessions.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: Row }) => {
      const session = store.sessions.find(row => row.tokenHash === where.tokenHash);
      return session ? { ...session, interview: store.interviews.find(row => row.id === session.interviewId) } : null;
    }
  },
  applicationEvent: { create: async ({ data }: { data: Row }) => { store.events.push(data); return data; } }
};
fakePrisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(fakePrisma);

vi.mock("@/lib/server/db", () => ({ getPrisma: () => fakePrisma }));
vi.mock("@/lib/server/session", () => ({ getHrContext: (...args: unknown[]) => mockGetHrContext(...args) }));
vi.mock("@/lib/server/http", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/server/http")>()),
  enforceRateLimit: vi.fn(async () => ({ decision: {} }))
}));

const access = await import("@/lib/server/candidate-access");
const { requireInterviewAccess } = await import("@/lib/server/interview-access");

const NOW = new Date("2026-10-28T09:00:00.000Z");

async function invite(interviewId = "int-1", now = NOW) {
  return access.createCandidateInvitation(fakePrisma as never, {
    organizationId: "org-1", interviewId, applicationId: "app-1", createdByUserId: "recruiter-1", now
  });
}

function cookieHeaders(token: string) {
  return new Headers({ cookie: `other=1; ${access.CANDIDATE_SESSION_COOKIE}=${token}` });
}

describe("candidate interview invitations", () => {
  beforeEach(() => {
    process.env.APP_DATA_MODE = "database";
    process.env.AUTH_SECRET = "unit-test-secret-value-that-is-long-enough";
    process.env.NEXT_PUBLIC_APP_URL = "https://hire.example.test";
    store.invitations = [];
    store.sessions = [];
    store.events = [];
    store.interviews = [
      { id: "int-1", organizationId: "org-1", applicationId: "app-1", status: "Scheduled" },
      { id: "int-2", organizationId: "org-1", applicationId: "app-2", status: "Scheduled" }
    ];
    store.applications = [
      { id: "app-1", organizationId: "org-1" },
      { id: "app-2", organizationId: "org-1" }
    ];
    mockGetHrContext.mockReset();
    mockGetHrContext.mockResolvedValue(null);
  });

  it("stores only a hash of the token and links it to the persisted interview", async () => {
    const { invitation, token } = await invite();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(store.invitations)).not.toContain(token);
    expect(invitation).toMatchObject({ interviewId: "int-1", applicationId: "app-1", organizationId: "org-1" });
    expect(await access.activeInvitationLink(fakePrisma as never, { organizationId: "org-1", interviewId: "int-1", now: NOW }))
      .toBe(`https://hire.example.test/interview/join#token=${token}`);
  });

  it("redeems a valid invitation once into a session pinned to that interview", async () => {
    const { token } = await invite();

    const redeemed = await access.redeemCandidateInvitation(token, NOW);
    const session = await access.getCandidateSession(cookieHeaders(redeemed.sessionToken), NOW);

    expect(redeemed.interview).toMatchObject({
      id: "int-1",
      candidateName: "Ada Candidate",
      jobTitle: "Platform Engineer",
      jobDescription: "Build platforms.",
      experienceLevel: "Mid"
    });
    expect(session).toMatchObject({ organizationId: "org-1", interviewId: "int-1", applicationId: "app-1" });
    expect(redeemed.expiresAt.getTime() - NOW.getTime()).toBe(access.CANDIDATE_SESSION_TTL_MS);
    expect(JSON.stringify(store.sessions)).not.toContain(redeemed.sessionToken);
    expect(await access.activeInvitationLink(fakePrisma as never, { organizationId: "org-1", interviewId: "int-1", now: NOW })).toBeNull();
  });

  it("rejects reuse of a redeemed invitation", async () => {
    const { token } = await invite();
    await access.redeemCandidateInvitation(token, NOW);

    await expect(access.redeemCandidateInvitation(token, NOW)).rejects.toMatchObject({ status: 404, code: "INVITATION_INVALID" });
    expect(store.sessions).toHaveLength(1);
  });

  it("revokes the earlier link when a new one is issued", async () => {
    const first = await invite();
    const second = await invite();

    await expect(access.redeemCandidateInvitation(first.token, NOW)).rejects.toMatchObject({ code: "INVITATION_INVALID" });
    await expect(access.redeemCandidateInvitation(second.token, NOW)).resolves.toMatchObject({ interview: { id: "int-1" } });
  });

  it("rejects an expired invitation", async () => {
    const { token } = await invite();
    const later = new Date(NOW.getTime() + access.INVITATION_TTL_MS + 1);

    await expect(access.redeemCandidateInvitation(token, later)).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  });

  it.each(["", "short", "x".repeat(43) + "!", 42, null])("rejects a malformed token (%s)", async token => {
    await expect(access.redeemCandidateInvitation(token, NOW)).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  });

  it("rejects an unknown token without revealing it in the error", async () => {
    const unknown = "A".repeat(43);
    const error = await access.redeemCandidateInvitation(unknown, NOW).then(() => null, (e: Error) => e);

    expect(error).toMatchObject({ code: "INVITATION_INVALID" });
    expect(error?.message).not.toContain(unknown);
  });

  it.each(["Cancelled", "Completed"])("rejects an invitation for a %s interview", async status => {
    const { token } = await invite();
    store.interviews[0].status = status;

    await expect(access.redeemCandidateInvitation(token, NOW)).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  });

  it("rejects an invitation whose application does not match its interview", async () => {
    const { token } = await invite();
    store.invitations[0].applicationId = "app-2";

    await expect(access.redeemCandidateInvitation(token, NOW)).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  });

  it("ends candidate access when the session expires, is revoked, or the interview closes", async () => {
    const { token } = await invite();
    const { sessionToken, expiresAt } = await access.redeemCandidateInvitation(token, NOW);
    const headers = cookieHeaders(sessionToken);

    expect(await access.getCandidateSession(headers, new Date(expiresAt.getTime() + 1))).toBeNull();
    store.interviews[0].status = "Completed";
    expect(await access.getCandidateSession(headers, NOW)).toBeNull();
    store.interviews[0].status = "Scheduled";
    store.sessions[0].revokedAt = NOW;
    expect(await access.getCandidateSession(headers, NOW)).toBeNull();
    expect(await access.getCandidateSession(new Headers({ cookie: `${access.CANDIDATE_SESSION_COOKIE}=forged` }), NOW)).toBeNull();
  });

  describe("requireInterviewAccess", () => {
    const request = (headers: Headers = new Headers()) => new Request("http://localhost/api/agora/token", { method: "POST", headers });

    it("gives an invited candidate access pinned to their interview", async () => {
      const { token } = await invite();
      const { sessionToken } = await access.redeemCandidateInvitation(token, new Date());

      const result = await requireInterviewAccess(request(cookieHeaders(sessionToken)), "token");

      expect(result).toEqual({ context: expect.objectContaining({ kind: "candidate", organizationId: "org-1", interviewId: "int-1", userId: null }) });
    });

    it("never lets a candidate use recruiter-only AI scoring", async () => {
      const { token } = await invite();
      const { sessionToken } = await access.redeemCandidateInvitation(token, new Date());

      const result = await requireInterviewAccess(request(cookieHeaders(sessionToken)), "assess");

      expect("response" in result && result.response.status).toBe(403);
    });

    it("rejects callers with neither a recruiter nor a candidate session", async () => {
      const result = await requireInterviewAccess(request(), "token");
      expect("response" in result && result.response.status).toBe(401);
    });

    it("keeps recruiter access unchanged and unpinned", async () => {
      const hr: HrContext = { user: { id: "recruiter-1", name: "Rae", email: "rae@example.test" }, organization: { id: "org-1", name: "Org", slug: "org" }, role: "OWNER", sessionId: "s" };
      mockGetHrContext.mockResolvedValue(hr);

      const result = await requireInterviewAccess(request(), "assess");

      expect(result).toEqual({ context: { kind: "hr", organizationId: "org-1", userId: "recruiter-1", interviewId: null, candidateSessionId: null } });
    });
  });
});

describe("invitation link base URL", () => {
  const original = { url: process.env.NEXT_PUBLIC_APP_URL, allow: process.env.ALLOW_LOCAL_INVITATION_LINKS };
  const withUrl = (url: string | undefined, allowLocal?: string) => {
    if (url === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = url;
    if (allowLocal === undefined) delete process.env.ALLOW_LOCAL_INVITATION_LINKS; else process.env.ALLOW_LOCAL_INVITATION_LINKS = allowLocal;
  };

  afterEach(() => withUrl(original.url, original.allow));

  it("accepts a public HTTPS address", () => {
    withUrl("https://hire.example.test/");
    expect(access.publicInvitationBaseUrl()).toBe("https://hire.example.test");
  });

  it.each([undefined, "http://localhost:3400", "https://localhost:3400", "http://hire.example.test", "https://127.0.0.1", "https://ecopanel.local", "not a url"])(
    "refuses links candidates could not open (%s)",
    url => {
      withUrl(url);
      expect(access.publicInvitationBaseUrl()).toBeNull();
      expect(() => access.invitationJoinUrl("A".repeat(43))).toThrow(expect.objectContaining({ code: "INVITATION_URL_NOT_PUBLIC" }));
    }
  );

  it("allows local links only when explicitly enabled outside production", () => {
    withUrl("http://localhost:3400", "true");
    expect(access.publicInvitationBaseUrl()).toBe("http://localhost:3400");
  });

  describe("runtime APP_PUBLIC_URL (a new tunnel needs a restart, not a rebuild)", () => {
    const originalRuntime = process.env.APP_PUBLIC_URL;
    afterEach(() => {
      if (originalRuntime === undefined) delete process.env.APP_PUBLIC_URL; else process.env.APP_PUBLIC_URL = originalRuntime;
    });

    it("takes precedence over the build-time NEXT_PUBLIC_APP_URL", () => {
      withUrl("https://old-tunnel.example.test");
      process.env.APP_PUBLIC_URL = "https://new-tunnel.example.test/";
      expect(access.publicInvitationBaseUrl()).toBe("https://new-tunnel.example.test");
      expect(access.invitationJoinUrl("A".repeat(43))).toMatch(/^https:\/\/new-tunnel\.example\.test\/interview\/join#token=/);
    });

    it("is held to the same public HTTPS rule", () => {
      withUrl("https://hire.example.test");
      process.env.APP_PUBLIC_URL = "http://localhost:3401";
      expect(access.publicInvitationBaseUrl()).toBeNull();
    });
  });
});

describe("live interview experience level", () => {
  it.each([
    [{ title: "Platform Engineer", employmentType: "Full-time" }, "Mid"],
    [{ title: "Senior Backend Engineer", employmentType: "Full-time" }, "Senior"],
    [{ title: "Lead QA Engineer" }, "Senior"],
    [{ title: "Staff Software Engineer" }, "Staff"],
    [{ title: "Junior Data Analyst" }, "Junior"],
    [{ title: "Software Engineer", employmentType: "Internship" }, "Junior"],
    [{ title: "Graduate Developer", employmentType: null }, "Junior"]
  ])("derives %o as %s", (job, level) => {
    expect(access.experienceLevelForJob(job)).toBe(level);
  });

  it("does not match level words inside other words", () => {
    expect(access.experienceLevelForJob({ title: "Leadership Programme Coordinator" })).toBe("Mid");
    expect(access.experienceLevelForJob({ title: "Internal Tools Engineer" })).toBe("Mid");
  });
});
