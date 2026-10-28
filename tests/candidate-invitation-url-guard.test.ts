import { afterEach, describe, expect, it, vi } from "vitest";
import type { HrContext } from "@/lib/server/session";

const mockTransaction = vi.fn();
vi.mock("@/lib/server/db", () => ({ getPrisma: () => ({ $transaction: mockTransaction }) }));

const { inviteCandidateToInterview } = await import("@/lib/server/recruitment/candidate-invitations");

const context: HrContext = {
  user: { id: "recruiter-1", name: "Rae", email: "rae@example.test" },
  organization: { id: "org-1", name: "Org", slug: "org" },
  role: "OWNER",
  sessionId: "s"
};
const original = process.env.NEXT_PUBLIC_APP_URL;

describe("inviteCandidateToInterview link reachability", () => {
  afterEach(() => {
    mockTransaction.mockReset();
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it.each([undefined, "http://localhost:3400", "https://127.0.0.1:3400", "http://hire.example.test"])(
    "refuses %s before any database write",
    async url => {
      if (url === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = url;

      await expect(inviteCandidateToInterview(context, "int-1")).rejects.toMatchObject({ status: 409, code: "INVITATION_URL_NOT_PUBLIC" });
      expect(mockTransaction).not.toHaveBeenCalled();
    }
  );

  it("proceeds to the database for a public HTTPS address", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://hire.example.test";
    mockTransaction.mockRejectedValue(new Error("stop after guard"));

    await expect(inviteCandidateToInterview(context, "int-1")).rejects.toThrow("stop after guard");
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
