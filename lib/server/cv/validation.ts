export const MAX_CV_BYTES = 5 * 1024 * 1024;

export const CV_MIME_TYPES = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
} as const;

export type CvKind = keyof typeof CV_MIME_TYPES;

export class CvValidationError extends Error {
  readonly code: string;

  constructor(message: string, code = "INVALID_CV") {
    super(message);
    this.name = "CvValidationError";
    this.code = code;
  }
}

const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function includesAscii(buffer: Buffer, value: string) {
  return buffer.includes(Buffer.from(value, "utf8"));
}

export function detectCvKind(buffer: Buffer): CvKind {
  if (buffer.length < 8) throw new CvValidationError("The CV file is empty or truncated.");

  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (buffer.subarray(0, 8).equals(OLE_MAGIC)) return "doc";
  if (buffer.subarray(0, 4).equals(ZIP_MAGIC) && includesAscii(buffer, "[Content_Types].xml") && includesAscii(buffer, "word/")) {
    return "docx";
  }

  throw new CvValidationError("The CV must be a genuine PDF, DOC, or DOCX file.", "UNSUPPORTED_CV_CONTENT");
}

export function sanitizeOriginalFilename(filename: string, kind: CvKind) {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? "cv";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[^\w.\- ()]/g, "_").trim().slice(0, 180);
  const extension = kind === "pdf" ? ".pdf" : kind === "doc" ? ".doc" : ".docx";
  if (!cleaned) return `cv${extension}`;
  if (!/\.(pdf|doc|docx)$/i.test(cleaned)) return `${cleaned}${extension}`;
  return cleaned;
}

export interface ValidatedCv {
  buffer: Buffer;
  kind: CvKind;
  mimeType: string;
  originalFilename: string;
  checksum: string;
}

export async function validateCvFile(file: File): Promise<ValidatedCv> {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new CvValidationError("Attach a CV file.");
  }
  if (file.size === 0) throw new CvValidationError("The CV file is empty.");
  if (file.size > MAX_CV_BYTES) throw new CvValidationError("Your CV must be 5 MB or smaller.", "CV_TOO_LARGE");

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_CV_BYTES) throw new CvValidationError("Your CV must be 5 MB or smaller.", "CV_TOO_LARGE");

  const kind = detectCvKind(buffer);
  const { createHash } = await import("node:crypto");
  const checksum = createHash("sha256").update(buffer).digest("hex");

  return {
    buffer,
    kind,
    mimeType: CV_MIME_TYPES[kind],
    originalFilename: sanitizeOriginalFilename(file.name, kind),
    checksum
  };
}
