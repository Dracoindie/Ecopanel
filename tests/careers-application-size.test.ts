import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/careers/applications/route";

const mockSubmit = vi.fn();

vi.mock("@/lib/server/config", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/server/config")>()),
  isDatabaseMode: () => true
}));
vi.mock("@/lib/server/http", () => ({ enforceRateLimit: vi.fn(async () => ({ decision: {} })) }));
vi.mock("@/lib/server/recruitment/applications", () => ({
  submitPublicApplication: (...args: unknown[]) => mockSubmit(...args)
}));

function streamOf(bytes: number) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    }
  });
}

describe("POST /api/careers/applications upload size", () => {
  beforeEach(() => {
    mockSubmit.mockReset();
    mockSubmit.mockResolvedValue({ summary: { reference: "APP-1" }, duplicate: false });
  });

  it("rejects a chunked body without Content-Length before reading it", async () => {
    const request = new Request("http://localhost/api/careers/applications", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
      body: streamOf(16),
      // @ts-expect-error Node's fetch requires duplex for streamed bodies.
      duplex: "half"
    });
    expect(request.headers.get("content-length")).toBeNull();

    const response = await POST(request);

    expect(response.status).toBe(411);
    expect((await response.json()).code).toBe("LENGTH_REQUIRED");
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("rejects a declared size over the limit", async () => {
    const request = new Request("http://localhost/api/careers/applications", {
      method: "POST",
      headers: { "content-length": String(7 * 1024 * 1024) },
      body: "x"
    });

    expect((await POST(request)).status).toBe(413);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("accepts a normal multipart form with Content-Length", async () => {
    const form = new FormData();
    form.set("jobId", "job-1");
    const encoded = new Request("http://localhost", { method: "POST", body: form });
    const body = await encoded.arrayBuffer();
    const request = new Request("http://localhost/api/careers/applications", {
      method: "POST",
      headers: { "content-type": encoded.headers.get("content-type")!, "content-length": String(body.byteLength) },
      body
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-1" }));
  });
});
