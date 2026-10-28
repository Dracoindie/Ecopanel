import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AppConfigurationError,
  assertDatabaseConfigured,
  getDataMode,
  isDemoInterviewAccessExplicitlyAllowed
} from "@/lib/server/config";
import { cvDownloadability } from "@/lib/server/cv/policy";
import { getCvScannerProvider, resetCvScannerCache } from "@/lib/server/cv/scanner";
import { LocalPrivateCvStorage, InvalidStorageKeyError } from "@/lib/server/cv/storage";
import {
  CvValidationError,
  detectCvKind,
  sanitizeOriginalFilename,
  validateCvFile
} from "@/lib/server/cv/validation";
import { parsePublicApplicationForm, PublicApplicationError } from "@/lib/server/recruitment/applications";
import { requireInterviewAccess } from "@/lib/server/interview-access";

const originalEnv = {
  APP_DATA_MODE: process.env.APP_DATA_MODE,
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  CV_ALLOW_UNSCANNED_DOWNLOADS: process.env.CV_ALLOW_UNSCANNED_DOWNLOADS,
  CV_SCANNER_PROVIDER: process.env.CV_SCANNER_PROVIDER,
  CV_CLAMAV_HOST: process.env.CV_CLAMAV_HOST,
  CV_CLAMAV_PORT: process.env.CV_CLAMAV_PORT,
  CV_SCANNER_URL: process.env.CV_SCANNER_URL,
  ALLOW_UNAUTHENTICATED_DEMO_INTERVIEWS: process.env.ALLOW_UNAUTHENTICATED_DEMO_INTERVIEWS,
  NODE_ENV: process.env.NODE_ENV
};

afterEach(() => {
  resetCvScannerCache();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Phase 2A mode and configuration safety", () => {
  it("defaults to demo mode unless database mode is explicit", () => {
    delete process.env.APP_DATA_MODE;
    expect(getDataMode()).toBe("demo");
    process.env.APP_DATA_MODE = "something-else";
    expect(getDataMode()).toBe("demo");
    process.env.APP_DATA_MODE = "database";
    expect(getDataMode()).toBe("database");
  });

  it("fails honestly when database mode lacks required configuration", () => {
    process.env.APP_DATA_MODE = "database";
    delete process.env.DATABASE_URL;
    delete process.env.AUTH_SECRET;
    expect(() => assertDatabaseConfigured()).toThrow(AppConfigurationError);
    process.env.DATABASE_URL = "postgresql://example.invalid/ecopanel";
    expect(() => assertDatabaseConfigured()).toThrow(/AUTH_SECRET/);
    process.env.AUTH_SECRET = "x".repeat(32);
    expect(() => assertDatabaseConfigured()).not.toThrow();
  });

  it("never permits unauthenticated interview mutations in production", () => {
    const env = process.env as Record<string, string | undefined>;
    env.APP_DATA_MODE = "demo";
    env.NODE_ENV = "production";
    expect(isDemoInterviewAccessExplicitlyAllowed()).toBe(false);
    env.ALLOW_UNAUTHENTICATED_DEMO_INTERVIEWS = "true";
    expect(isDemoInterviewAccessExplicitlyAllowed()).toBe(false);
    env.NODE_ENV = "development";
    expect(isDemoInterviewAccessExplicitlyAllowed()).toBe(true);
  });

  it("rejects interview mutations in a production demo build", async () => {
    const env = process.env as Record<string, string | undefined>;
    env.APP_DATA_MODE = "demo";
    env.NODE_ENV = "production";
    const access = await requireInterviewAccess(
      new Request("http://localhost/api/agora/start", { method: "POST" }),
      "test"
    );
    expect("response" in access).toBe(true);
    if ("response" in access) expect(access.response.status).toBe(401);
  });
});

describe("CV download policy", () => {
  it("allows only clean files by default", () => {
    delete process.env.CV_ALLOW_UNSCANNED_DOWNLOADS;
    expect(cvDownloadability("CLEAN").allowed).toBe(true);
    expect(cvDownloadability("UNSCANNED").allowed).toBe(false);
    expect(cvDownloadability("SCAN_FAILED").allowed).toBe(false);
    expect(cvDownloadability("INFECTED").allowed).toBe(false);
  });

  it("permits unscanned files only through the explicit non-production setting", () => {
    process.env.CV_ALLOW_UNSCANNED_DOWNLOADS = "true";
    expect(cvDownloadability("UNSCANNED").allowed).toBe(true);
    expect(cvDownloadability("PENDING").allowed).toBe(false);
    expect(cvDownloadability("INFECTED").allowed).toBe(false);
  });
});

describe("CV scanner configuration", () => {
  it("disables scanning when no provider is configured", () => {
    delete process.env.CV_SCANNER_PROVIDER;
    delete process.env.CV_CLAMAV_HOST;
    delete process.env.CV_CLAMAV_PORT;
    delete process.env.CV_SCANNER_URL;
    expect(getCvScannerProvider()).toBeNull();
  });

  it("supports explicit ClamAV and HTTP providers with an explicit disable switch", () => {
    process.env.CV_SCANNER_PROVIDER = "clamav";
    expect(getCvScannerProvider()).toBe("clamav");
    process.env.CV_SCANNER_PROVIDER = "http";
    expect(getCvScannerProvider()).toBe("http");
    process.env.CV_SCANNER_PROVIDER = "disabled";
    process.env.CV_CLAMAV_HOST = "127.0.0.1";
    expect(getCvScannerProvider()).toBeNull();
  });

  it("rejects unknown providers and incomplete HTTP configuration", async () => {
    process.env.CV_SCANNER_PROVIDER = "magic";
    expect(() => getCvScannerProvider()).toThrow(/clamav, http, or disabled/);
    process.env.CV_SCANNER_PROVIDER = "http";
    delete process.env.CV_SCANNER_URL;
    resetCvScannerCache();
    const { getCvScanner } = await import("@/lib/server/cv/scanner");
    expect(() => getCvScanner()).toThrow(/CV_SCANNER_URL/);
  });
});

describe("CV content validation", () => {
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
  const docx = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from("word/document.xml [Content_Types].xml", "utf8")
  ]);
  const doc = Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.alloc(24)
  ]);

  it("detects real PDF, DOC, and DOCX signatures instead of trusting the extension", () => {
    expect(detectCvKind(pdf)).toBe("pdf");
    expect(detectCvKind(doc)).toBe("doc");
    expect(detectCvKind(docx)).toBe("docx");
    expect(() => detectCvKind(Buffer.from("<html>not a cv</html>"))).toThrow(CvValidationError);
  });

  it("sanitizes traversal and control characters from filenames", () => {
    expect(sanitizeOriginalFilename("../../evil\u0000name.pdf", "pdf")).toBe("evilname.pdf");
    expect(sanitizeOriginalFilename("cv", "docx")).toBe("cv.docx");
  });

  it("returns server-derived MIME type and a checksum", async () => {
    const file = new File([new Uint8Array(pdf)], "resume.pdf", { type: "text/html" });
    const result = await validateCvFile(file);
    expect(result.kind).toBe("pdf");
    expect(result.mimeType).toBe("application/pdf");
    expect(result.originalFilename).toBe("resume.pdf");
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a misleading extension", async () => {
    const file = new File(["plain text"], "resume.pdf", { type: "application/pdf" });
    await expect(validateCvFile(file)).rejects.toBeInstanceOf(CvValidationError);
  });
});

describe("public application form validation", () => {
  function validForm() {
    const form = new FormData();
    form.set("jobId", "job-1");
    form.set("name", "Ada Lovelace");
    form.set("email", "ada@example.com");
    form.set("phone", "+44 7700 900000");
    form.set("linkedinUrl", "");
    form.set("githubUrl", "");
    form.set("portfolioUrl", "");
    form.set("coverLetter", "I am interested in this role because the infrastructure problems are compelling.");
    form.set("consent", "on");
    form.set("cv", new File([new Uint8Array(Buffer.from("%PDF-1.4\n...\n"))], "ada.pdf", { type: "application/pdf" }));
    return form;
  }

  it("accepts a complete application payload", () => {
    const parsed = parsePublicApplicationForm(validForm());
    expect(parsed.jobId).toBe("job-1");
    expect(parsed.input.email).toBe("ada@example.com");
    expect(parsed.file.name).toBe("ada.pdf");
  });

  it("rejects missing consent, short cover letters, and unsafe URLs", () => {
    const noConsent = validForm();
    noConsent.delete("consent");
    expect(() => parsePublicApplicationForm(noConsent)).toThrow(PublicApplicationError);

    const shortCover = validForm();
    shortCover.set("coverLetter", "Too short");
    expect(() => parsePublicApplicationForm(shortCover)).toThrow(/40 characters/);

    const unsafe = validForm();
    unsafe.set("portfolioUrl", "javascript:alert(1)");
    expect(() => parsePublicApplicationForm(unsafe)).toThrow(PublicApplicationError);
  });

  it("requires a CV file", () => {
    const form = validForm();
    form.delete("cv");
    expect(() => parsePublicApplicationForm(form)).toThrow(/Attach your CV/);
  });
});

describe("private CV storage", () => {
  it("writes, reads, deletes, and rejects path traversal", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ecopanel-cv-"));
    const storage = new LocalPrivateCvStorage(root);
    try {
      const stored = await storage.put({
        organizationId: "org-123",
        kind: "pdf",
        buffer: Buffer.from("%PDF-1.4\nprivate\n")
      });
      expect(stored.key).toMatch(/^cv\/org-123\/[a-f0-9-]{36}\.pdf$/);
      expect((await storage.read(stored.key)).toString()).toContain("private");
      await expect(storage.read("../../outside.pdf")).rejects.toBeInstanceOf(InvalidStorageKeyError);
      await storage.delete(stored.key);
      await expect(storage.read(stored.key)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
