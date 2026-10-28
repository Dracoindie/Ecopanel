import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { describeError, logError, redactLogFields, requestIdFromHeaders, sanitizeLogString } from "@/lib/server/logger";
import { checkReadiness, type ReadinessDependencies } from "@/lib/server/health";
import { middleware } from "@/middleware";

function dependencies(overrides: Partial<ReadinessDependencies> = {}): ReadinessDependencies {
  return {
    databaseMode: true,
    checkDatabase: async () => true,
    checkStorage: async () => true,
    checkScanner: async () => ({ configured: true, provider: "http", reachable: true }),
    ...overrides
  };
}

describe("structured logging redaction", () => {
  const originalOutput = process.env.LOG_TEST_OUTPUT;

  afterEach(() => {
    if (originalOutput === undefined) delete process.env.LOG_TEST_OUTPUT;
    else process.env.LOG_TEST_OUTPUT = originalOutput;
    vi.restoreAllMocks();
  });

  it("redacts sensitive fields and values without emitting raw PII", () => {
    process.env.LOG_TEST_OUTPUT = "true";
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("Application failed for jane@example.com", {
      requestId: "request-12345678",
      password: "hunter2",
      token: "secret-token",
      email: "jane@example.com",
      fullName: "Jane Doe",
      cvContent: "raw bytes",
      databaseUrl: "postgresql://user:pass@db.example.com/ecopanel",
      nested: { authorization: "Bearer abc.def.ghi", phone: "+44 7700 900123" },
      error: new Error("connect postgresql://user:pass@db.example.com/ecopanel failed\nretry")
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0][0]);
    expect(line).not.toContain("hunter2");
    expect(line).not.toContain("jane@example.com");
    expect(line).not.toContain("Jane Doe");
    expect(line).not.toContain("abc.def.ghi");
    expect(line).not.toContain("postgresql://");
    expect(line).not.toContain("\n");
    const payload = JSON.parse(line);
    expect(payload.level).toBe("error");
    expect(payload.requestId).toBe("request-12345678");
    expect(payload.password).toBe("[redacted]");
    expect(payload.nested).toEqual({ authorization: "[redacted]", phone: "[redacted]" });
    expect(payload.fullName).toBe("[redacted]");
    expect(payload.error.message).toContain("[redacted-database-url]");
  });

  it("keeps useful error metadata and sanitises control characters", () => {
    const error = Object.assign(new Error("boom\u0000now"), { code: "E_TEST" });
    expect(describeError(error)).toEqual({ name: "Error", code: "E_TEST", message: "boom now" });
    expect(describeError("plain")).toEqual({ name: "UnknownError", message: "plain" });
    expect(sanitizeLogString("Bearer top-secret-token")).toBe("Bearer [redacted]");
    expect(redactLogFields({ candidateName: "Jane", cvFile: "bytes", safe: "ok" }))
      .toEqual({ candidateName: "[redacted]", cvFile: "[redacted]", safe: "ok" });
  });

  it("validates incoming request IDs", () => {
    expect(requestIdFromHeaders(new Headers({ "x-request-id": "abc12345" }))).toBe("abc12345");
    const generated = requestIdFromHeaders(new Headers({ "x-request-id": "bad id" }));
    expect(generated).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("readiness aggregation", () => {
  it("is ready when required dependencies and the scanner are healthy", async () => {
    await expect(checkReadiness(dependencies())).resolves.toMatchObject({
      status: "ready",
      httpStatus: 200,
      checks: {
        database: { status: "ok", required: true },
        cvStorage: { status: "ok", required: true },
        scanner: { status: "ok", required: false }
      }
    });
  });

  it("is unavailable when the database is down", async () => {
    const result = await checkReadiness(dependencies({ checkDatabase: async () => false }));
    expect(result).toMatchObject({ status: "unavailable", httpStatus: 503 });
    expect(result.checks.database.status).toBe("unavailable");
  });

  it("is unavailable when private storage is not writable", async () => {
    const result = await checkReadiness(dependencies({
      checkStorage: async () => {
        throw new Error("permission denied");
      }
    }));
    expect(result).toMatchObject({ status: "unavailable", httpStatus: 503 });
    expect(result.checks.cvStorage.status).toBe("unavailable");
  });

  it("stays ready but degraded when only the scanner is unreachable", async () => {
    const result = await checkReadiness(dependencies({
      checkScanner: async () => ({ configured: true, provider: "clamav", reachable: false })
    }));
    expect(result).toMatchObject({ status: "degraded", httpStatus: 200 });
    expect(result.checks.scanner).toMatchObject({ status: "degraded", required: false, provider: "clamav" });
  });

  it("reports disabled dependencies in demo mode", async () => {
    const result = await checkReadiness(dependencies({
      databaseMode: false,
      checkScanner: async () => ({ configured: false, provider: null, reachable: false })
    }));
    expect(result).toMatchObject({ status: "ready", httpStatus: 200 });
    expect(result.checks.database).toMatchObject({ status: "disabled", required: false });
    expect(result.checks.cvStorage).toMatchObject({ status: "disabled", required: false });
    expect(result.checks.scanner).toMatchObject({ status: "disabled", required: false });
  });
});

describe("request ID middleware", () => {
  it("preserves a valid request ID and propagates it", () => {
    const response = middleware(new NextRequest("http://localhost/api/health/live", {
      headers: { "x-request-id": "trace-12345678" }
    }));
    expect(response.headers.get("x-request-id")).toBe("trace-12345678");
  });

  it("replaces an invalid request ID", () => {
    const response = middleware(new NextRequest("http://localhost/api/health/live", {
      headers: { "x-request-id": "../../etc/passwd" }
    }));
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});
