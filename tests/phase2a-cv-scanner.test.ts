import { createHash } from "node:crypto";
import http from "node:http";
import net from "node:net";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ClamAvCvScanner, HttpCvScanner, type CvScanner } from "@/lib/server/cv/scanner";
import { scanCvFile } from "@/lib/server/cv/scan-service";
import type { PrivateCvStorage } from "@/lib/server/cv/storage";

const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const checksum = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

function listen(server: http.Server | net.Server) {
  return new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") reject(new Error("No port."));
      else resolve(address.port);
    });
  });
}

function close(server: http.Server | net.Server) {
  if ("closeAllConnections" in server) server.closeAllConnections();
  return new Promise<void>(resolve => server.close(() => resolve()));
}

function parseInstream(buffer: Buffer) {
  const signature = Buffer.from("zINSTREAM\0");
  if (buffer.length < signature.length || !buffer.subarray(0, signature.length).equals(signature)) return null;
  let offset = signature.length;
  const chunks: Buffer[] = [];
  while (offset + 4 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    if (length === 0) return Buffer.concat(chunks);
    if (offset + length > buffer.length) return null;
    chunks.push(buffer.subarray(offset, offset + length));
    offset += length;
  }
  return null;
}

function fakeStorage(buffer: Buffer, options: { onRead?: (count: number) => void } = {}) {
  let reads = 0;
  const read = vi.fn(async () => {
    reads += 1;
    options.onRead?.(reads);
    return buffer;
  });
  const remove = vi.fn(async () => undefined);
  return {
    storage: { read, delete: remove, put: vi.fn() } as unknown as PrivateCvStorage,
    read,
    remove
  };
}

function fakePrisma(initial: Record<string, unknown>, counts: { claim?: number; final?: number } = {}) {
  let record = { ...initial };
  let updates = 0;
  const updateMany = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    updates += 1;
    const isClaim = updates === 1;
    const count = isClaim ? counts.claim ?? 1 : counts.final ?? 1;
    if (count === 0) return { count: 0 };
    const patch = { ...data };
    if (patch.scanAttempts && typeof patch.scanAttempts === "object") {
      const increment = Number((patch.scanAttempts as { increment?: number }).increment ?? 0);
      delete patch.scanAttempts;
      patch.scanAttempts = Number(record.scanAttempts ?? 0) + increment;
    }
    record = { ...record, ...patch };
    return { count };
  });
  return {
    prisma: {
      cvFile: {
        findUnique: vi.fn(async () => ({ ...record })),
        updateMany
      }
    } as unknown as PrismaClient,
    updateMany,
    snapshot: () => ({ ...record })
  };
}

function cvRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "cv-1",
    organizationId: "org-1",
    applicationId: "app-1",
    storageKey: "cv/org-1/11111111-1111-1111-1111-111111111111.pdf",
    originalFilename: "cv.pdf",
    mimeType: "application/pdf",
    sizeBytes: pdf.length,
    checksum: checksum(pdf),
    scanStatus: "PENDING",
    scanProvider: null,
    scanDetail: null,
    scanAttemptId: null,
    scanStartedAt: null,
    scanCompletedAt: null,
    scanAttempts: 0,
    uploadedAt: new Date("2026-10-26T00:00:00Z"),
    deletedAt: null,
    ...overrides
  };
}

describe("HTTP CV scanner adapter", () => {
  it("maps clean and infected responses and sends the CV as an octet stream", async () => {
    let received = Buffer.alloc(0);
    const server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", chunk => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        received = Buffer.concat(chunks);
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(received.includes("EICAR")
          ? { status: "infected", detail: "Eicar-Test-Signature" }
          : { status: "clean" }));
      });
    });
    const port = await listen(server);
    try {
      const scanner = new HttpCvScanner(`http://127.0.0.1:${port}`, "test-token", 2_000);
      await expect(scanner.scan({ buffer: pdf, filename: "cv.pdf", mimeType: "application/pdf" }))
        .resolves.toEqual({ status: "CLEAN", provider: "http-scanner" });
      expect(received.equals(pdf)).toBe(true);
      await expect(scanner.scan({ buffer: Buffer.from("EICAR"), filename: "cv.pdf", mimeType: "application/pdf" }))
        .resolves.toMatchObject({ status: "INFECTED", detail: "Eicar-Test-Signature" });
    } finally {
      await close(server);
    }
  });

  it("fails closed on HTTP errors, malformed bodies, and timeouts", async () => {
    let mode: "error" | "malformed" | "slow" = "error";
    const server = http.createServer((_request, response) => {
      if (mode === "error") {
        response.statusCode = 503;
        response.end("unavailable");
      } else if (mode === "malformed") {
        response.end(JSON.stringify({ status: "maybe" }));
      }
    });
    const port = await listen(server);
    try {
      const scanner = new HttpCvScanner(`http://127.0.0.1:${port}`, undefined, 100);
      await expect(scanner.scan({ buffer: pdf, filename: "cv.pdf", mimeType: "application/pdf" }))
        .resolves.toMatchObject({ status: "SCAN_FAILED" });
      mode = "malformed";
      await expect(scanner.scan({ buffer: pdf, filename: "cv.pdf", mimeType: "application/pdf" }))
        .resolves.toMatchObject({ status: "SCAN_FAILED" });
      mode = "slow";
      await expect(scanner.scan({ buffer: pdf, filename: "cv.pdf", mimeType: "application/pdf" }))
        .resolves.toMatchObject({ status: "SCAN_FAILED", detail: "Scanner timed out." });
    } finally {
      await close(server);
    }
  });
});

describe("ClamAV INSTREAM adapter", () => {
  it("sends a valid INSTREAM payload and parses clean, infected, and malformed verdicts", async () => {
    let verdict: "clean" | "infected" | "malformed" = "clean";
    let received = Buffer.alloc(0);
    const server = net.createServer(socket => {
      const chunks: Buffer[] = [];
      socket.on("data", chunk => {
        chunks.push(Buffer.from(chunk));
        const payload = parseInstream(Buffer.concat(chunks));
        if (!payload) return;
        received = payload;
        if (verdict === "clean") socket.end("stream: OK\0");
        else if (verdict === "infected") socket.end("stream: Eicar-Test-Signature FOUND\0");
        else socket.end("unexpected\0");
      });
    });
    const port = await listen(server);
    try {
      const scanner = new ClamAvCvScanner("127.0.0.1", port, 2_000);
      await expect(scanner.scan({ buffer: pdf, filename: "cv.pdf", mimeType: "application/pdf" }))
        .resolves.toEqual({ status: "CLEAN", provider: "clamav" });
      expect(received.equals(pdf)).toBe(true);
      verdict = "infected";
      await expect(scanner.scan({ buffer: pdf, filename: "cv.pdf", mimeType: "application/pdf" }))
        .resolves.toMatchObject({ status: "INFECTED", detail: "Eicar-Test-Signature" });
      verdict = "malformed";
      await expect(scanner.scan({ buffer: pdf, filename: "cv.pdf", mimeType: "application/pdf" }))
        .resolves.toMatchObject({ status: "SCAN_FAILED" });
    } finally {
      await close(server);
    }
  });

  it("fails closed when ClamAV is unavailable or does not answer", async () => {
    const server = net.createServer(() => undefined);
    const port = await listen(server);
    await close(server);

    const refused = new ClamAvCvScanner("127.0.0.1", port, 1_000);
    await expect(refused.scan({ buffer: pdf, filename: "cv.pdf", mimeType: "application/pdf" }))
      .resolves.toMatchObject({ status: "SCAN_FAILED", detail: "Scanner connection failed." });

    const silentSockets = new Set<net.Socket>();
    const silent = net.createServer(socket => {
      silentSockets.add(socket);
      socket.on("close", () => silentSockets.delete(socket));
    });
    const silentPort = await listen(silent);
    try {
      const timeout = new ClamAvCvScanner("127.0.0.1", silentPort, 100);
      await expect(timeout.scan({ buffer: pdf, filename: "cv.pdf", mimeType: "application/pdf" }))
        .resolves.toMatchObject({ status: "SCAN_FAILED", detail: "Scanner timed out." });
    } finally {
      for (const socket of silentSockets) socket.destroy();
      await close(silent);
    }
  });
});

describe("durable CV scan service", () => {
  it("claims a pending CV, scans the stored bytes, and records a clean verdict", async () => {
    const { prisma, updateMany, snapshot } = fakePrisma(cvRecord());
    const { storage } = fakeStorage(pdf);
    const scanner: CvScanner = { name: "fake", scan: vi.fn(async () => ({ status: "CLEAN" as const, provider: "fake" })) };

    const result = await scanCvFile("cv-1", { prisma, storage, scanner });

    expect(result).toMatchObject({ outcome: "updated", status: "CLEAN", provider: "fake" });
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(snapshot()).toMatchObject({ scanStatus: "CLEAN", scanAttemptId: null, scanAttempts: 1 });
  });

  it("records SCAN_FAILED when the scanner throws and never deletes the file", async () => {
    const { prisma, snapshot } = fakePrisma(cvRecord());
    const { storage, remove } = fakeStorage(pdf);
    const scanner: CvScanner = { name: "fake", scan: vi.fn(async () => { throw new Error("socket hang up"); }) };

    const result = await scanCvFile("cv-1", { prisma, storage, scanner });

    expect(result.status).toBe("SCAN_FAILED");
    expect(snapshot()).toMatchObject({ scanStatus: "SCAN_FAILED", scanDetail: "Scanner request failed." });
    expect(remove).not.toHaveBeenCalled();
  });

  it("blocks and deletes infected content while preserving metadata", async () => {
    const { prisma, snapshot } = fakePrisma(cvRecord());
    const { storage, remove } = fakeStorage(pdf);
    const scanner: CvScanner = {
      name: "fake",
      scan: vi.fn(async () => ({ status: "INFECTED" as const, provider: "fake", detail: "Eicar-Test-Signature" }))
    };

    const result = await scanCvFile("cv-1", { prisma, storage, scanner });

    expect(result).toMatchObject({ status: "INFECTED", provider: "fake" });
    expect(remove).toHaveBeenCalledWith("cv/org-1/11111111-1111-1111-1111-111111111111.pdf");
    expect(snapshot()).toMatchObject({
      scanStatus: "INFECTED",
      scanDetail: "Eicar-Test-Signature",
      originalFilename: "cv.pdf"
    });
    expect(snapshot().deletedAt).toBeInstanceOf(Date);
  });

  it("fails closed when stored bytes no longer match the recorded checksum", async () => {
    const { prisma, snapshot } = fakePrisma(cvRecord({ checksum: checksum(Buffer.from("different")) }));
    const { storage } = fakeStorage(pdf);
    const scan = vi.fn(async () => ({ status: "CLEAN" as const, provider: "fake" }));

    const result = await scanCvFile("cv-1", { prisma, storage, scanner: { name: "fake", scan } });

    expect(result.status).toBe("SCAN_FAILED");
    expect(result.detail).toMatch(/checksum changed/);
    expect(scan).not.toHaveBeenCalled();
    expect(snapshot().scanStatus).toBe("SCAN_FAILED");
  });

  it("fails closed when the stored file is missing", async () => {
    const { prisma, snapshot } = fakePrisma(cvRecord());
    const storage = {
      read: vi.fn(async () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); }),
      delete: vi.fn(),
      put: vi.fn()
    } as unknown as PrivateCvStorage;
    const scan = vi.fn(async () => ({ status: "CLEAN" as const, provider: "fake" }));

    const result = await scanCvFile("cv-1", { prisma, storage, scanner: { name: "fake", scan } });

    expect(result).toMatchObject({ status: "SCAN_FAILED", detail: "Stored file is missing." });
    expect(scan).not.toHaveBeenCalled();
    expect(snapshot().scanStatus).toBe("SCAN_FAILED");
  });

  it("does not scan when no provider is configured or another attempt owns the file", async () => {
    const disabled = fakePrisma(cvRecord({ scanStatus: "UNSCANNED" }));
    const { storage } = fakeStorage(pdf);
    const scan = vi.fn(async () => ({ status: "CLEAN" as const, provider: "fake" }));

    await expect(scanCvFile("cv-1", { prisma: disabled.prisma, storage, scanner: null }))
      .resolves.toMatchObject({ outcome: "disabled", status: "UNSCANNED" });
    expect(scan).not.toHaveBeenCalled();

    const claimed = fakePrisma(cvRecord(), { claim: 0 });
    await expect(scanCvFile("cv-1", { prisma: claimed.prisma, storage, scanner: { name: "fake", scan } }))
      .resolves.toMatchObject({ outcome: "skipped", status: "PENDING" });
    expect(scan).not.toHaveBeenCalled();
  });
});
