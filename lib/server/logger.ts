import { randomUUID } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const REDACTED = "[redacted]";
const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 500;

const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|cookie|authorization|api[-_]?key|app[-_]?certificate|certificate|database[-_]?url|connection[-_]?string|storage[-_]?key|checksum|email|phone|full[-_]?name|candidate(?:name)?|cover[-_]?letter|cv(?:content|buffer|file)?|resume|body|contents?)/i;

const SENSITIVE_VALUE_PATTERNS: Array<[RegExp, string]> = [
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]"],
  [/\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"']+/gi, "[redacted-database-url]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]"],
  [/\bagora token=[^\s"']+/gi, "agora token=[redacted]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted-token]"]
];

export function sanitizeLogString(value: string) {
  let result = value.replace(/[\u0000-\u001f\u007f]/g, " ");
  for (const [pattern, replacement] of SENSITIVE_VALUE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result.length > MAX_STRING_LENGTH ? `${result.slice(0, MAX_STRING_LENGTH)}...[truncated]` : result;
}

function redactValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return "[truncated]";
  if (typeof value === "string") return sanitizeLogString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    const code = (value as unknown as { code?: unknown }).code;
    return {
      name: value.name,
      ...(typeof code === "string" ? { code } : {}),
      message: sanitizeLogString(value.message || "Error")
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map(item => redactValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactValue(nested, depth + 1);
    }
    return output;
  }
  return "[unserializable]";
}

export function redactLogFields(fields: LogFields = {}) {
  return redactValue(fields, 0) as LogFields;
}

export function requestIdFromHeaders(headers: Headers) {
  const incoming = headers.get("x-request-id")?.trim();
  return incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
}

export function requestIdFromRequest(request: Request) {
  return requestIdFromHeaders(request.headers);
}

function writeLog(level: LogLevel, message: string, fields: LogFields = {}) {
  if (process.env.NODE_ENV === "test" && process.env.LOG_TEST_OUTPUT !== "true") return;
  const payload = {
    level,
    time: new Date().toISOString(),
    message: sanitizeLogString(message),
    ...redactLogFields(fields)
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logDebug(message: string, fields?: LogFields) {
  writeLog("debug", message, fields);
}

export function logInfo(message: string, fields?: LogFields) {
  writeLog("info", message, fields);
}

export function logWarn(message: string, fields?: LogFields) {
  writeLog("warn", message, fields);
}

export function logError(message: string, fields?: LogFields) {
  writeLog("error", message, fields);
}

export function describeError(error: unknown) {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return {
      name: error.name,
      ...(typeof code === "string" || typeof code === "number" ? { code: String(code) } : {}),
      message: sanitizeLogString(error.message || "Error")
    };
  }
  return { name: "UnknownError", message: sanitizeLogString(String(error ?? "Unknown error")) };
}
