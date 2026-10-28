import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export class CalendarCryptoError extends Error {
  readonly code = "CALENDAR_ENCRYPTION_UNAVAILABLE";

  constructor(message = "Calendar token encryption is not configured correctly.") {
    super(message);
    this.name = "CalendarCryptoError";
  }
}

function decodeKey(raw: string | undefined, name: string) {
  const value = raw?.trim();
  if (!value) return null;
  let key: Buffer;
  try {
    key = Buffer.from(value, "base64");
  } catch {
    throw new CalendarCryptoError(`${name} must be a base64-encoded 32-byte key.`);
  }
  if (key.length !== 32) {
    throw new CalendarCryptoError(`${name} must decode to exactly 32 bytes.`);
  }
  return key;
}

function keyRing() {
  const current = decodeKey(process.env.CALENDAR_TOKEN_ENCRYPTION_KEY, "CALENDAR_TOKEN_ENCRYPTION_KEY");
  const previous = decodeKey(process.env.CALENDAR_TOKEN_ENCRYPTION_KEY_PREVIOUS, "CALENDAR_TOKEN_ENCRYPTION_KEY_PREVIOUS");
  if (!current) throw new CalendarCryptoError();
  return { current, previous };
}

export function getCalendarEncryptionStatus() {
  try {
    keyRing();
    return { configured: true, issue: null as string | null };
  } catch (error) {
    return {
      configured: false,
      issue: error instanceof Error ? error.message : "Calendar token encryption is unavailable."
    };
  }
}

function encode(value: Buffer) {
  return value.toString("base64url");
}

export function encryptCalendarSecret(value: string, aad: string) {
  const { current } = keyRing();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, current, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, encode(iv), encode(tag), encode(encrypted)].join(".");
}

export function decryptCalendarSecret(payload: string, aad: string) {
  const { current, previous } = keyRing();
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new CalendarCryptoError("The stored calendar credential is not in a supported format.");
  }
  const [, ivPart, tagPart, cipherPart] = parts;
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const encrypted = Buffer.from(cipherPart, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== 16 || !encrypted.length) {
    throw new CalendarCryptoError("The stored calendar credential is malformed.");
  }

  for (const [key, needsRotation] of [[current, false], [previous, true]] as const) {
    if (!key) continue;
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAAD(Buffer.from(aad, "utf8"));
      decipher.setAuthTag(tag);
      const value = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
      return { value, needsRotation };
    } catch {
      // Try the previous key during a controlled rotation.
    }
  }
  throw new CalendarCryptoError("The stored calendar credential could not be decrypted with the configured key.");
}

export function tokenAad(organizationId: string, provider: string, kind: "access" | "refresh") {
  return `ecopanel:calendar:${organizationId}:${provider}:${kind}`;
}

export function oauthVerifierAad(stateId: string) {
  return `ecopanel:calendar-oauth:${stateId}`;
}
