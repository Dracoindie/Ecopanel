import net from "node:net";

export type CvScanStatus = "UNSCANNED" | "PENDING" | "CLEAN" | "INFECTED" | "SCAN_FAILED";
export type CvScannerProvider = "clamav" | "http";

export interface CvScanResult {
  status: CvScanStatus;
  provider: string;
  detail?: string;
}

export interface CvScanner {
  name: string;
  scan(input: { buffer: Buffer; filename: string; mimeType: string }): Promise<CvScanResult>;
}

export class CvScannerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CvScannerConfigurationError";
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_DETAIL_LENGTH = 240;
const MAX_RESPONSE_LENGTH = 16_384;

export function getCvScannerTimeoutMs() {
  const raw = Number(process.env.CV_SCANNER_TIMEOUT_MS);
  if (!Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS;
  return Math.min(120_000, Math.max(1_000, Math.floor(raw)));
}

function safeDetail(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return normalized ? normalized.slice(0, MAX_DETAIL_LENGTH) : undefined;
}

export function getCvScannerProvider(): CvScannerProvider | null {
  const configured = process.env.CV_SCANNER_PROVIDER?.trim().toLowerCase();
  if (configured === "disabled" || configured === "none" || configured === "off") return null;
  if (configured === "clamav" || configured === "http") return configured;
  if (configured) {
    throw new CvScannerConfigurationError("CV_SCANNER_PROVIDER must be clamav, http, or disabled.");
  }
  if (process.env.CV_CLAMAV_HOST?.trim() || process.env.CV_CLAMAV_PORT?.trim()) return "clamav";
  if (process.env.CV_SCANNER_URL?.trim()) return "http";
  return null;
}

export function isCvScannerConfigured() {
  try {
    return getCvScannerProvider() !== null;
  } catch {
    return true;
  }
}

export class HttpCvScanner implements CvScanner {
  readonly name = "http-scanner";

  constructor(
    private readonly endpoint: string,
    private readonly token?: string,
    private readonly timeoutMs = getCvScannerTimeoutMs()
  ) {}

  async scan(input: { buffer: Buffer; filename: string; mimeType: string }): Promise<CvScanResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Filename": input.filename,
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
        },
        body: new Uint8Array(input.buffer),
        signal: controller.signal
      });
      if (!response.ok) {
        return { status: "SCAN_FAILED", provider: this.name, detail: `Scanner returned HTTP ${response.status}` };
      }
      const body = await response.json() as { status?: unknown; detail?: unknown };
      if (body.status === "clean") return { status: "CLEAN", provider: this.name };
      if (body.status === "infected") {
        return { status: "INFECTED", provider: this.name, detail: safeDetail(body.detail) || "Malware signature detected." };
      }
      return { status: "SCAN_FAILED", provider: this.name, detail: safeDetail(body.detail) || "Scanner returned an unknown result." };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      return {
        status: "SCAN_FAILED",
        provider: this.name,
        detail: timedOut ? "Scanner timed out." : "Scanner request failed."
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class ClamAvCvScanner implements CvScanner {
  readonly name = "clamav";

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = getCvScannerTimeoutMs()
  ) {}

  scan(input: { buffer: Buffer; filename: string; mimeType: string }): Promise<CvScanResult> {
    return new Promise(resolve => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      let settled = false;
      let response = "";

      const finish = (result: CvScanResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(result);
      };

      const timer = setTimeout(() => {
        finish({ status: "SCAN_FAILED", provider: this.name, detail: "Scanner timed out." });
      }, this.timeoutMs);

      socket.on("error", () => {
        finish({ status: "SCAN_FAILED", provider: this.name, detail: "Scanner connection failed." });
      });

      socket.on("end", () => {
        finish({ status: "SCAN_FAILED", provider: this.name, detail: "Scanner closed the connection without a verdict." });
      });

      socket.on("data", chunk => {
        response += chunk.toString("utf8");
        if (response.length > MAX_RESPONSE_LENGTH) {
          finish({ status: "SCAN_FAILED", provider: this.name, detail: "Scanner returned an oversized response." });
          return;
        }
        if (!response.includes("\0")) return;

        const message = response.split("\0", 1)[0].trim();
        if (/^(stream:|[a-z0-9._-]+:)\s*OK$/i.test(message)) {
          finish({ status: "CLEAN", provider: this.name });
          return;
        }
        const infected = /^(?:stream:)?\s*(.+?)\s+FOUND$/i.exec(message);
        if (infected) {
          finish({
            status: "INFECTED",
            provider: this.name,
            detail: safeDetail(infected[1]) || "Malware signature detected."
          });
          return;
        }
        finish({ status: "SCAN_FAILED", provider: this.name, detail: "Scanner returned an invalid response." });
      });

      socket.on("connect", () => {
        socket.write(Buffer.from("zINSTREAM\0", "utf8"));
        for (let offset = 0; offset < input.buffer.length; offset += 64 * 1024) {
          const chunk = input.buffer.subarray(offset, Math.min(offset + 64 * 1024, input.buffer.length));
          const length = Buffer.allocUnsafe(4);
          length.writeUInt32BE(chunk.length, 0);
          socket.write(length);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
    });
  }
}

function createConfiguredScanner(): CvScanner | null {
  const provider = getCvScannerProvider();
  if (!provider) return null;
  const timeoutMs = getCvScannerTimeoutMs();

  if (provider === "http") {
    const endpoint = process.env.CV_SCANNER_URL?.trim();
    if (!endpoint) throw new CvScannerConfigurationError("CV_SCANNER_URL is required for the HTTP scanner.");
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new CvScannerConfigurationError("CV_SCANNER_URL must be a valid http:// or https:// URL.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new CvScannerConfigurationError("CV_SCANNER_URL must be a valid http:// or https:// URL.");
    }
    return new HttpCvScanner(endpoint, process.env.CV_SCANNER_TOKEN?.trim(), timeoutMs);
  }

  const host = process.env.CV_CLAMAV_HOST?.trim() || "127.0.0.1";
  const port = Number(process.env.CV_CLAMAV_PORT || "3310");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new CvScannerConfigurationError("CV_CLAMAV_PORT must be a valid TCP port.");
  }
  return new ClamAvCvScanner(host, port, timeoutMs);
}

let scanner: CvScanner | null | undefined;

export function getCvScanner(): CvScanner | null {
  if (scanner !== undefined) return scanner;
  scanner = createConfiguredScanner();
  return scanner;
}

export function resetCvScannerCache() {
  scanner = undefined;
}

export interface CvScannerHealth {
  configured: boolean;
  provider: CvScannerProvider | null;
  reachable: boolean | null;
}

function tcpReachable(host: string, port: number, timeoutMs: number) {
  return new Promise<boolean>(resolve => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (reachable: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(reachable);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

/** Readiness probe for the configured malware scanner. Never returns endpoints or credentials. */
export async function checkCvScannerHealth(timeoutMs = 2_000): Promise<CvScannerHealth> {
  let provider: CvScannerProvider | null;
  try {
    provider = getCvScannerProvider();
  } catch {
    return { configured: true, provider: null, reachable: false };
  }
  if (!provider) return { configured: false, provider: null, reachable: null };

  if (provider === "clamav") {
    const host = process.env.CV_CLAMAV_HOST?.trim() || "127.0.0.1";
    const port = Number(process.env.CV_CLAMAV_PORT || "3310");
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return { configured: true, provider, reachable: false };
    }
    return { configured: true, provider, reachable: await tcpReachable(host, port, timeoutMs) };
  }

  const endpoint = process.env.CV_SCANNER_URL?.trim();
  if (!endpoint) return { configured: true, provider, reachable: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(endpoint, { method: "GET", signal: controller.signal, cache: "no-store" });
    return { configured: true, provider, reachable: true };
  } catch {
    return { configured: true, provider, reachable: false };
  } finally {
    clearTimeout(timer);
  }
}
