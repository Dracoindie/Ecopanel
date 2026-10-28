import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CalendarCryptoError,
  decryptCalendarSecret,
  encryptCalendarSecret,
  getCalendarEncryptionStatus,
  oauthVerifierAad,
  tokenAad
} from "@/lib/server/calendar/crypto";

describe("Phase 2D calendar credential encryption", () => {
  const originalKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  const originalPrevious = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY_PREVIOUS;

  beforeAll(() => {
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY_PREVIOUS;
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    else process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = originalKey;
    if (originalPrevious === undefined) delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY_PREVIOUS;
    else process.env.CALENDAR_TOKEN_ENCRYPTION_KEY_PREVIOUS = originalPrevious;
  });

  it("encrypts, authenticates, and decrypts calendar secrets", () => {
    const aad = tokenAad("org-1", "google", "refresh");
    const encrypted = encryptCalendarSecret("refresh-token-value", aad);
    expect(encrypted).not.toContain("refresh-token-value");
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(decryptCalendarSecret(encrypted, aad)).toEqual({
      value: "refresh-token-value",
      needsRotation: false
    });
    expect(() => decryptCalendarSecret(encrypted, oauthVerifierAad("state-1")))
      .toThrow(CalendarCryptoError);
  });

  it("supports controlled key rotation", () => {
    const previous = randomBytes(32).toString("base64");
    const current = randomBytes(32).toString("base64");
    const aad = tokenAad("org-2", "google", "access");

    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = previous;
    const encrypted = encryptCalendarSecret("access-token-value", aad);

    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = current;
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY_PREVIOUS = previous;

    expect(decryptCalendarSecret(encrypted, aad)).toEqual({
      value: "access-token-value",
      needsRotation: true
    });
  });

  it("reports malformed keys without exposing values", () => {
    const valid = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = "not-a-32-byte-key";
    expect(getCalendarEncryptionStatus()).toMatchObject({ configured: false });
    expect(getCalendarEncryptionStatus().issue).toContain("32 bytes");
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = valid;
  });
});
