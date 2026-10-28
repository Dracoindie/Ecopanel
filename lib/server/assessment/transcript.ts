import { createHash } from "node:crypto";
import { AssessmentServiceError, type StoredTranscriptTurn } from "@/lib/server/assessment/types";

const CANDIDATE_SPEAKERS = new Set(["candidate"]);
const INTERVIEWER_SPEAKERS = new Set([
  "moderator",
  "technical",
  "product",
  "behavioural",
  "customer",
  "interviewer",
  "agent"
]);
const MAX_TURNS = 1_000;
const MAX_TURN_CHARS = 8_000;
const MAX_TRANSCRIPT_CHARS = 150_000;

function cleanText(value: unknown, label: string, max: number) {
  if (typeof value !== "string") {
    throw new AssessmentServiceError(`${label} must be text.`, 400, "INVALID_TRANSCRIPT");
  }
  const text = value.replace(/\u0000/g, "").trim();
  if (!text || text.length > max) {
    throw new AssessmentServiceError(`${label} is empty or too long.`, 400, "INVALID_TRANSCRIPT");
  }
  return text;
}

export function normalizeCapturedTurns(raw: unknown): StoredTranscriptTurn[] {
  if (!Array.isArray(raw)) {
    throw new AssessmentServiceError("Send a finalized transcript turn list.", 400, "INVALID_TRANSCRIPT");
  }
  if (!raw.length || raw.length > MAX_TURNS) {
    throw new AssessmentServiceError(`Transcripts must contain between 1 and ${MAX_TURNS} turns.`, 400, "INVALID_TRANSCRIPT");
  }

  const turns: StoredTranscriptTurn[] = [];
  const byId = new Map<string, StoredTranscriptTurn>();
  let totalChars = 0;

  for (const value of raw) {
    if (!value || typeof value !== "object") {
      throw new AssessmentServiceError("Every transcript turn must be an object.", 400, "INVALID_TRANSCRIPT");
    }
    const item = value as Record<string, unknown>;
    if (item.isFinal !== true) {
      throw new AssessmentServiceError("Only finalized transcript turns can be stored.", 400, "INVALID_TRANSCRIPT");
    }
    const id = cleanText(item.id, "Turn ID", 120);
    const originalSpeaker = cleanText(item.speaker, "Turn speaker", 40).toLowerCase();
    const text = cleanText(item.text, "Turn text", MAX_TURN_CHARS);
    const timestamp = Number(item.timestamp);
    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw new AssessmentServiceError("Turn timestamps must be valid non-negative numbers.", 400, "INVALID_TRANSCRIPT");
    }
    const speaker = CANDIDATE_SPEAKERS.has(originalSpeaker)
      ? "candidate" as const
      : INTERVIEWER_SPEAKERS.has(originalSpeaker)
        ? "interviewer" as const
        : null;
    if (!speaker) {
      throw new AssessmentServiceError("Transcript turns must identify the candidate or an interviewer.", 400, "INVALID_TRANSCRIPT");
    }

    const existing = byId.get(id);
    if (existing) {
      if (existing.text !== text || existing.speaker !== speaker) {
        throw new AssessmentServiceError("Transcript turn IDs must be unique.", 400, "INVALID_TRANSCRIPT");
      }
      continue;
    }

    totalChars += text.length;
    if (totalChars > MAX_TRANSCRIPT_CHARS) {
      throw new AssessmentServiceError("The transcript is too large to assess.", 413, "TRANSCRIPT_TOO_LARGE");
    }

    const turn: StoredTranscriptTurn = { id, speaker, originalSpeaker, text, timestamp };
    byId.set(id, turn);
    turns.push(turn);
  }

  if (!turns.length) {
    throw new AssessmentServiceError("The transcript has no usable turns.", 400, "INVALID_TRANSCRIPT");
  }
  if (!turns.some(turn => turn.speaker === "candidate")) {
    throw new AssessmentServiceError("The transcript must include at least one finalized candidate turn.", 400, "INVALID_TRANSCRIPT");
  }
  if (!turns.some(turn => turn.speaker === "interviewer")) {
    throw new AssessmentServiceError("The transcript must include at least one interviewer turn.", 400, "INVALID_TRANSCRIPT");
  }

  turns.sort((a, b) => a.timestamp - b.timestamp);
  return turns;
}

export function parseStoredTurns(value: unknown): StoredTranscriptTurn[] {
  if (!Array.isArray(value)) {
    throw new AssessmentServiceError("Stored transcript turns are invalid.", 409, "TRANSCRIPT_CORRUPT");
  }
  const turns = value.filter(item => item && typeof item === "object") as StoredTranscriptTurn[];
  if (!turns.length) {
    throw new AssessmentServiceError("Stored transcript turns are missing.", 409, "TRANSCRIPT_CORRUPT");
  }
  return turns;
}

export function transcriptChecksum(turns: StoredTranscriptTurn[]) {
  const canonical = JSON.stringify(
    turns.map(turn => [turn.id, turn.speaker, turn.text, turn.timestamp])
  );
  return createHash("sha256").update(canonical).digest("hex");
}
