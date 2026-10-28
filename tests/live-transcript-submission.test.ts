import { describe, expect, it } from "vitest";
import { finalTranscriptTurns, persistedInterviewId } from "../lib/live-helpers";
import { normalizeCapturedTurns, transcriptChecksum } from "../lib/server/assessment/transcript";
import type { TranscriptTurn } from "../lib/types";

const liveTranscript: TranscriptTurn[] = [
  { id: "t-1", speaker: "moderator", text: "Welcome to EchoPanel.", timestamp: 1000, isFinal: true },
  { id: "t-2", speaker: "technical", text: "Design a payment API.", timestamp: 2000, isFinal: true },
  { id: "t-3", speaker: "candidate", text: "I would use idempo", timestamp: 2500, isFinal: false },
  { id: "t-3", speaker: "candidate", text: "I would use idempotency keys and a queue.", timestamp: 3000, isFinal: true },
  { id: "t-3", speaker: "candidate", text: "I would use idempotency keys and a queue.", timestamp: 3000, isFinal: true },
  { id: "t-4", speaker: "product", text: "   ", timestamp: 4000, isFinal: true }
];

describe("live transcript submission", () => {
  it("only treats persisted ids as interview records", () => {
    expect(persistedInterviewId("clx9abc123")).toBe("clx9abc123");
    expect(persistedInterviewId("live-1793098847796")).toBeNull();
    expect(persistedInterviewId(undefined)).toBeNull();
    expect(persistedInterviewId("")).toBeNull();
  });

  it("sends only finalized, non-empty turns", () => {
    const turns = finalTranscriptTurns(liveTranscript);
    expect(turns.every(turn => turn.isFinal)).toBe(true);
    expect(turns.map(turn => turn.id)).toEqual(["t-1", "t-2", "t-3", "t-3"]);
  });

  it("produces a payload the transcript endpoint accepts, with duplicates collapsed", () => {
    const stored = normalizeCapturedTurns(finalTranscriptTurns(liveTranscript));
    expect(stored.map(turn => [turn.id, turn.speaker])).toEqual([
      ["t-1", "interviewer"],
      ["t-2", "interviewer"],
      ["t-3", "candidate"]
    ]);
    expect(transcriptChecksum(stored)).toBe(transcriptChecksum(normalizeCapturedTurns(finalTranscriptTurns(liveTranscript))));
  });
});
