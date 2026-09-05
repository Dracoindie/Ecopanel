export type AgentId = "technical" | "product" | "behavioural";
export type AgentStatus = "listening" | "thinking" | "requesting" | "speaking" | "idle";
export type Claim = { id: string; text: string; sourceTurn: number; technical: "supported" | "unverified"; product: "missing" | "supported"; behavioural: "pending" | "supported"; status: "unresolved" | "resolved"; confidence: number };
export type Decision = { nextSpeaker: AgentId; reason: string; priority: number; questionObjective: string };

export function detectVagueness(answer: string) { return /significantly|improved performance|users liked|scaled well/i.test(answer) && !/\d|%|ms|customer|revenue/i.test(answer); }
export function findContradiction(answer: string, history: string[]) {
  const readDuration = (text: string) => text.match(/(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+weeks?/i)?.[1]?.toLowerCase();
  const weeks = readDuration(answer); const prior = history.map(readDuration).find(Boolean);
  return Boolean(weeks && prior && weeks !== prior);
}
export function selectNextSpeaker(claim: Claim, contradiction = false): Decision {
  if (contradiction) return { nextSpeaker: "behavioural", reason: "Timeline contradiction needs reconciliation", priority: .94, questionObjective: "clarify_ownership" };
  if (claim.product === "missing") return { nextSpeaker: "product", reason: "Business impact evidence missing", priority: .91, questionObjective: "customer_impact" };
  return { nextSpeaker: "technical", reason: "Technical depth can be increased", priority: .72, questionObjective: "constraints" };
}
export function nextDifficulty(current: number, signal: "strong" | "weak" | "vague" | "contradictory") { return Math.max(1, Math.min(5, current + (signal === "strong" ? 1 : signal === "weak" ? -1 : 0))); }
export const demoClaim: Claim = { id: "claim-04", text: "Reduced payment API latency by 40% using Redis caching", sourceTurn: 4, technical: "supported", product: "missing", behavioural: "pending", status: "unresolved", confidence: .88 };
