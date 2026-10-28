import { describe, expect, it } from "vitest";
import { ClamAvCvScanner, checkCvScannerHealth } from "@/lib/server/cv/scanner";

const enabled = process.env.CV_CLAMAV_INTEGRATION === "1";
const host = process.env.CV_CLAMAV_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.CV_CLAMAV_PORT || "3310");

describe.skipIf(!enabled)("real ClamAV integration", () => {
  const scanner = new ClamAvCvScanner(host, port, 30_000);

  it("reports the daemon as reachable", async () => {
    await expect(checkCvScannerHealth(5_000)).resolves.toMatchObject({
      configured: true,
      provider: "clamav",
      reachable: true
    });
  });

  it("returns CLEAN for a benign PDF", async () => {
    const buffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
    await expect(scanner.scan({ buffer, filename: "cv.pdf", mimeType: "application/pdf" }))
      .resolves.toMatchObject({ status: "CLEAN", provider: "clamav" });
  });

  it("returns INFECTED for the EICAR test signature", async () => {
    const eicar = Buffer.from(
      "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    );
    const result = await scanner.scan({ buffer: eicar, filename: "eicar.com", mimeType: "application/octet-stream" });
    expect(result.status).toBe("INFECTED");
    expect(result.detail).toMatch(/eicar/i);
  });
});
