/**
 * Pure helper functions for the live Agora interview flow.
 * Extracted so they can be unit-tested without a React component.
 */

const GENERIC_GREETING_RE = /how can i help you today/i;

/**
 * Detect short conversational greetings that should not be treated as
 * substantive candidate answers (e.g. "Morning.", "Hi!", "Hello.").
 */
export function isShortGreeting(text: string): boolean {
  const cleaned = text.trim();
  if (!cleaned) return false;
  if (GENERIC_GREETING_RE.test(cleaned)) return true;
  // Strip trailing punctuation for word counting
  const words = cleaned.replace(/[.!?,;]+$/g, "").split(/\s+/);
  if (words.length > 3) return false;
  const lower = cleaned.toLowerCase().replace(/[.!?,;]+$/g, "");
  const greetings = [
    "hi", "hi there", "hello", "hello there", "hey", "hey there", "morning",
    "good morning", "good afternoon", "good evening", "howdy", "greetings"
  ];
  return greetings.includes(lower);
}

/**
 * Normalize text for fuzzy comparison: lowercase, collapse whitespace,
 * strip leading/trailing whitespace and trailing punctuation.
 */
export function normalizeForMatch(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?,;]+$/g, "");
}

function normalizeForSpeech(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canSegmentIntoAuthorizedSpeech(agentText: string, authorized: Set<string>): boolean {
  if (!agentText) return false;
  const reachable = new Array<boolean>(agentText.length + 1).fill(false);
  reachable[0] = true;

  for (let start = 0; start < agentText.length; start += 1) {
    if (!reachable[start]) continue;
    if (agentText[start] === " ") {
      reachable[start + 1] = true;
      continue;
    }
    for (const phrase of authorized) {
      if (!phrase || !agentText.startsWith(phrase, start)) continue;
      const end = start + phrase.length;
      if (end === agentText.length || agentText[end] === " ") {
        reachable[end] = true;
      }
    }
  }

  return reachable[agentText.length];
}

export type AuthorizedSpeechLedger = {
  /** Record exactly what the application asked the agent to say. */
  authorize: (...texts: string[]) => void;
  /** True only when the agent output is authorised speech, or a concatenation of it. */
  isAuthorized: (agentText: string) => boolean;
  clear: () => void;
};

/**
 * Tracks only app-authorised agent speech. Candidate turns are never added
 * here, and substring matches against arbitrary transcript text are not used.
 */
export function createAuthorizedSpeechLedger(): AuthorizedSpeechLedger {
  const authorized = new Set<string>();

  return {
    authorize(...texts: string[]) {
      for (const text of texts) {
        const normalized = normalizeForSpeech(text);
        if (normalized) authorized.add(normalized);
      }
    },
    isAuthorized(agentText: string) {
      const normalized = normalizeForSpeech(agentText);
      if (!normalized) return false;
      if (authorized.has(normalized)) return true;
      return canSegmentIntoAuthorizedSpeech(normalized, authorized);
    },
    clear() {
      authorized.clear();
    }
  };
}

/**
 * Determine whether a finalized candidate utterance should be analyzed.
 * Greetings and empty/punctuation-only input are ignored. Short but
 * meaningful answers such as "Yes.", "No.", "OK.", and "I don't know."
 * are preserved because length alone is not a signal.
 */
export function isSubstantiveUtterance(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (isShortGreeting(trimmed)) return false;
  return /[\p{L}\p{N}]/u.test(trimmed);
}

export type CandidateTurnIdentity = {
  turnId?: number;
  fallbackKey?: string;
};

export type SerialTurnQueueOptions<T extends CandidateTurnIdentity & { text: string }> = {
  process: (turn: T) => Promise<void> | void;
  /** Runs synchronously for each newly accepted turn, before processing waits on earlier turns. */
  onAccepted?: (turn: T) => void;
  onError?: (error: unknown, turn: T) => void;
  onBusyChange?: (busy: boolean) => void;
  fallbackTtlMs?: number;
  now?: () => number;
};

export type SerialTurnQueue<T extends CandidateTurnIdentity & { text: string }> = {
  enqueue: (turn: T) => boolean;
  reset: () => void;
  size: () => number;
  isBusy: () => boolean;
};

/**
 * Serial, single-flight processor with stable-ID dedupe. The lock is closure
 * state, not React state, so asynchronous analysis cannot observe a stale
 * "busy" value. Processing continues after a turn succeeds or fails.
 */
export function createSerialTurnQueue<T extends CandidateTurnIdentity & { text: string }>(
  options: SerialTurnQueueOptions<T>
): SerialTurnQueue<T> {
  const fallbackTtlMs = Math.max(0, options.fallbackTtlMs ?? 3000);
  const now = options.now ?? Date.now;
  const queue: T[] = [];
  const seenTurnIds = new Set<number>();
  const recentFallbackKeys = new Map<string, number>();
  let processing = false;

  const pruneFallbackKeys = () => {
    const cutoff = now() - fallbackTtlMs;
    for (const [key, timestamp] of recentFallbackKeys) {
      if (timestamp <= cutoff) recentFallbackKeys.delete(key);
    }
  };

  const fallbackKeyFor = (turn: T) => turn.fallbackKey || normalizeForMatch(turn.text);

  const isDuplicate = (turn: T) => {
    if (typeof turn.turnId === "number") return seenTurnIds.has(turn.turnId);
    pruneFallbackKeys();
    return recentFallbackKeys.has(fallbackKeyFor(turn));
  };

  const remember = (turn: T) => {
    if (typeof turn.turnId === "number") {
      seenTurnIds.add(turn.turnId);
      return;
    }
    recentFallbackKeys.set(fallbackKeyFor(turn), now());
  };

  const pump = async () => {
    if (processing) return;
    processing = true;
    options.onBusyChange?.(true);

    try {
      while (queue.length > 0) {
        const turn = queue.shift()!;
        try {
          await options.process(turn);
        } catch (error) {
          options.onError?.(error, turn);
        }
      }
    } finally {
      processing = false;
      options.onBusyChange?.(false);
      // Safety net for an enqueue triggered by onBusyChange/onError.
      if (queue.length > 0) void pump();
    }
  };

  return {
    enqueue(turn: T) {
      if (isDuplicate(turn)) return false;
      remember(turn);
      queue.push(turn);
      try {
        options.onAccepted?.(turn);
      } catch (error) {
        options.onError?.(error, turn);
      }
      if (!processing) void pump();
      return true;
    },
    reset() {
      queue.length = 0;
      seenTurnIds.clear();
      recentFallbackKeys.clear();
    },
    size() {
      return queue.length;
    },
    isBusy() {
      return processing;
    }
  };
}

export type SessionToken = {
  readonly generation: number;
  readonly signal: AbortSignal;
};

export type SessionScope = {
  begin: () => SessionToken;
  invalidate: () => number;
  currentGeneration: () => number;
  isCurrent: (token: SessionToken) => boolean;
  isGenerationCurrent: (generation: number) => boolean;
};

/**
 * Coordinates session boundaries. Starting or invalidating a session aborts
 * work belonging to the previous one and advances the generation, so late
 * async results can be rejected even if they were already in flight.
 */
export function createSessionScope(): SessionScope {
  let generation = 0;
  let controller: AbortController | null = null;

  const abortActive = () => {
    controller?.abort();
    controller = null;
  };

  return {
    begin() {
      abortActive();
      generation += 1;
      controller = new AbortController();
      return { generation, signal: controller.signal };
    },
    invalidate() {
      abortActive();
      generation += 1;
      return generation;
    },
    currentGeneration() {
      return generation;
    },
    isCurrent(token: SessionToken) {
      return token.generation === generation && !token.signal.aborted;
    },
    isGenerationCurrent(candidateGeneration: number) {
      return candidateGeneration === generation;
    }
  };
}

export type RecentKeyTrackerOptions = {
  ttlMs?: number;
  now?: () => number;
};

export type RecentKeyTracker = {
  /** Returns true only the first time a key is claimed within the TTL. */
  claim: (key: string) => boolean;
  reset: () => void;
};

/** Bounds repeated-event handling without permanently suppressing a key. */
export function createRecentKeyTracker(options: RecentKeyTrackerOptions = {}): RecentKeyTracker {
  const ttlMs = Math.max(0, options.ttlMs ?? 5000);
  const now = options.now ?? Date.now;
  const claimed = new Map<string, number>();

  const prune = () => {
    const cutoff = now() - ttlMs;
    for (const [key, timestamp] of claimed) {
      if (timestamp <= cutoff) claimed.delete(key);
    }
  };

  return {
    claim(key: string) {
      if (!key) return false;
      prune();
      if (claimed.has(key)) return false;
      claimed.set(key, now());
      return true;
    },
    reset() {
      claimed.clear();
    }
  };
}

/** Quiet time after the last candidate speech before a finalized answer is analyzed. */
export const ANSWER_GRACE_MS = 2000;

export type AnswerSegment = { text: string; key: string };

export type AnswerAccumulator = {
  /** Adds a finalized transcript segment; false when it was already seen this session. */
  addFinal: (segment: AnswerSegment) => boolean;
  /** The candidate is still speaking (interim transcript): postpone the pending answer. */
  noteSpeech: () => void;
  /** Number of segments waiting to be released as one answer. */
  pending: () => number;
  reset: () => void;
};

/**
 * Speech recognition finalizes a turn at a short pause, so one spoken answer can
 * arrive as several segments. Segments are merged and released as one answer
 * only after the candidate has been quiet for graceMs; a pause alone never
 * advances the interview. Each segment key is accepted once per session
 * because the toolkit re-sends the full history.
 */
export function createAnswerAccumulator(options: {
  onAnswer: (answer: AnswerSegment & { segments: number }) => void;
  graceMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}): AnswerAccumulator {
  const graceMs = Math.max(0, options.graceMs ?? ANSWER_GRACE_MS);
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const seen = new Set<string>();
  let buffer: AnswerSegment[] = [];
  let timer: unknown = null;

  const release = () => {
    timer = null;
    if (!buffer.length) return;
    const segments = buffer;
    buffer = [];
    options.onAnswer({
      text: segments.map(segment => segment.text.trim()).join(" "),
      key: `answer:${segments.map(segment => segment.key).join("+")}`,
      segments: segments.length
    });
  };
  const restart = () => {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(release, graceMs);
  };

  return {
    addFinal(segment) {
      if (!segment.key || seen.has(segment.key) || !segment.text.trim()) return false;
      seen.add(segment.key);
      buffer.push(segment);
      restart();
      return true;
    },
    noteSpeech() {
      if (buffer.length) restart();
    },
    pending() {
      return buffer.length;
    },
    reset() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      buffer = [];
      seen.clear();
    }
  };
}

export type AgentTurnAuditor = {
  /** True only the first time a completed agent turn is seen and it is not authorised speech. */
  review: (key: string, text: string) => boolean;
  reset: () => void;
};

/**
 * Reviews completed agent turns once per session. The toolkit re-sends the
 * full chat history on every update, so a TTL-based dedupe re-reports old
 * turns indefinitely. A completed turn has already finished playing, so it is
 * only reported, never interrupted: an interrupt sent then would cut off
 * whatever the agent says next, typically EchoPanel's authorised question.
 */
export function createAgentTurnAuditor(isAuthorized: (text: string) => boolean): AgentTurnAuditor {
  const seen = new Set<string>();
  return {
    review(key: string, text: string) {
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return !isAuthorized(text);
    },
    reset() {
      seen.clear();
    }
  };
}

/** Ids minted by /setup when no persisted interview was handed over (demo/dev). */
const FABRICATED_INTERVIEW_ID_RE = /^live-\d+$/;

/** Returns the id only when it refers to a persisted interview, never a /setup placeholder. */
export function persistedInterviewId(interviewId: string | undefined): string | null {
  return interviewId && !FABRICATED_INTERVIEW_ID_RE.test(interviewId) ? interviewId : null;
}

/**
 * Finalized turns in the shape POST /api/hr/interviews/[id]/transcript accepts.
 * The server deduplicates by id and rejects interim turns, so only final,
 * non-empty turns are sent.
 */
export function finalTranscriptTurns(
  turns: ReadonlyArray<{ id: string; speaker: string; text: string; timestamp: number; isFinal: boolean }>
) {
  return turns
    .filter(turn => turn.isFinal && turn.text.trim())
    .map(({ id, speaker, text, timestamp }) => ({ id, speaker, text, timestamp, isFinal: true as const }));
}

/** Browser audio processing for the candidate microphone (Agora Web SDK). */
export const MICROPHONE_TRACK_CONFIG = { AEC: true, ANS: true, AGC: true } as const;

const ECHO_MIN_WORDS = 3;
const ECHO_MAX_WORDS = 20;
const ECHO_RUN_RATIO = 0.8;

function echoWords(text: string) {
  return normalizeForSpeech(text).split(" ").filter(Boolean);
}

/**
 * Conservative echo check for a finalized candidate turn against the AI's
 * immediately preceding utterance (a speakerphone feeding the agent's audio
 * back into the microphone). Only flags turns of 3-20 words where at least
 * 80% of the words appear in the AI utterance in the same order, either as one
 * unbroken run or with gaps where speech recognition misheard a word. One- and
 * two-word answers and partial phrase reuse in a real answer are kept.
 */
export function isLikelyEcho(candidateText: string, lastAiUtterance: string): boolean {
  const candidate = echoWords(candidateText);
  const ai = echoWords(lastAiUtterance);
  if (candidate.length < ECHO_MIN_WORDS || candidate.length > ECHO_MAX_WORDS || ai.length === 0) return false;
  let longest = 0;
  const previous = new Array<number>(ai.length + 1).fill(0);
  // In-order word overlap (longest common subsequence) tolerates misheard words.
  const inOrder = Array.from({ length: candidate.length + 1 }, () => new Array<number>(ai.length + 1).fill(0));
  for (let i = 1; i <= candidate.length; i++) {
    let diagonal = 0;
    for (let j = 1; j <= ai.length; j++) {
      const above = previous[j];
      const same = candidate[i - 1] === ai[j - 1];
      previous[j] = same ? diagonal + 1 : 0;
      longest = Math.max(longest, previous[j]);
      diagonal = above;
      inOrder[i][j] = same ? inOrder[i - 1][j - 1] + 1 : Math.max(inOrder[i - 1][j], inOrder[i][j - 1]);
    }
  }
  const covered = Math.max(longest, inOrder[candidate.length][ai.length]);
  return covered / candidate.length >= ECHO_RUN_RATIO;
}
