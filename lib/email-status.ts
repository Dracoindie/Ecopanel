import type { Tone } from "@/components/ui";

export type EmailLifecycleStatus =
  | "Draft"
  | "Queued"
  | "Sending"
  | "Sent"
  | "Delivered"
  | "Bounced"
  | "Complained"
  | "Failed"
  | "Cancelled";

export const EMAIL_LIFECYCLE_STATUSES: EmailLifecycleStatus[] = [
  "Draft",
  "Queued",
  "Sending",
  "Sent",
  "Delivered",
  "Bounced",
  "Complained",
  "Failed",
  "Cancelled"
];

export function normalizeEmailStatus(status: string): EmailLifecycleStatus {
  if (status === "Pending") return "Queued";
  return EMAIL_LIFECYCLE_STATUSES.includes(status as EmailLifecycleStatus)
    ? status as EmailLifecycleStatus
    : "Failed";
}

export function emailStatusLabel(status: string, options: { isDemo?: boolean } = {}) {
  const normalized = normalizeEmailStatus(status);
  if (options.isDemo && normalized === "Sent") return "Seeded record";
  switch (normalized) {
    case "Draft":
      return "Draft";
    case "Queued":
      return "Queued";
    case "Sending":
      return "Sending";
    case "Sent":
      return "Provider accepted";
    case "Delivered":
      return "Delivered";
    case "Bounced":
      return "Bounced";
    case "Complained":
      return "Spam complaint";
    case "Failed":
      return "Failed";
    case "Cancelled":
      return "Cancelled";
  }
}

export function emailStatusTone(status: string): Tone {
  switch (normalizeEmailStatus(status)) {
    case "Draft":
      return "violet";
    case "Queued":
    case "Sending":
      return "amber";
    case "Sent":
    case "Delivered":
      return "mint";
    case "Bounced":
    case "Complained":
    case "Failed":
      return "rose";
    case "Cancelled":
      return "slate";
  }
}

export function isQueuedEmail(status: string) {
  const normalized = normalizeEmailStatus(status);
  return normalized === "Queued" || normalized === "Sending";
}

export function needsEmailAttention(status: string) {
  const normalized = normalizeEmailStatus(status);
  return normalized === "Bounced" || normalized === "Complained" || normalized === "Failed";
}
