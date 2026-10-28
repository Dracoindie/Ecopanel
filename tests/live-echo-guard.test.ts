import { describe, expect, it } from "vitest";
import { isLikelyEcho, MICROPHONE_TRACK_CONFIG } from "../lib/live-helpers";

const greeting =
  "Welcome to EchoPanel, Alex. I'll coordinate your adaptive interview for Backend Engineer across technical, product, and behavioural perspectives. Only one interviewer speaks at a time.";
const question = "Would you use idempotency keys or a distributed lock to keep payment retries safe?";

describe("candidate microphone processing", () => {
  it("enables echo cancellation, noise suppression and gain control", () => {
    expect(MICROPHONE_TRACK_CONFIG).toEqual({ AEC: true, ANS: true, AGC: true });
  });
});

describe("isLikelyEcho", () => {
  it.each([
    ["a fragment of the greeting", "coordinate your adaptive interview", greeting],
    ["the fragment with different casing and punctuation", "Your adaptive interview, for backend!", greeting],
    ["a longer run of the question", "you use idempotency keys or a distributed lock", question],
    ["a run with one misheard word", "only one interviewer speaks at the", greeting],
    // Recorded live test: speech recognition misheard two words of the Product question.
    [
      "the recorded echo with misheard words",
      "Our customer or business become resulted from that work on live test engineer Please quantify impact if you can.",
      "What customer or business outcome resulted from that work on Live Test Engineer? Please quantify impact if you can."
    ]
  ])("flags %s", (_label, candidate, ai) => {
    expect(isLikelyEcho(candidate, ai)).toBe(true);
  });

  it.each([
    ["an answer that reuses a phrase from the question", "I would use idempotency keys with a queue", question],
    ["a one-word answer that appears in the question", "Idempotency", question],
    ["a two-word answer that appears in the question", "distributed lock", question],
    ["an unrelated short answer", "We cut checkout failures by half", question],
    ["a long answer that repeats the question before answering", `${question} I would choose idempotency keys because retries are common`, question],
    ["any text when nothing has been said yet", "coordinate your adaptive interview", ""],
    [
      "a real answer to the Product question that reuses its words",
      "The business outcome was a twenty percent lift in customer retention",
      "What customer or business outcome resulted from that work on Live Test Engineer? Please quantify impact if you can."
    ],
    [
      "the candidate asking for a repeat",
      "Can you ask the question again please",
      "What customer or business outcome resulted from that work on Live Test Engineer? Please quantify impact if you can."
    ]
  ])("keeps %s", (_label, candidate, ai) => {
    expect(isLikelyEcho(candidate, ai)).toBe(false);
  });
});
