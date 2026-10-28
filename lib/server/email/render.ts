const TEMPLATE_VALUE_KEYS = [
  "candidate_name",
  "candidate_first_name",
  "job_title",
  "company_name",
  "interview_date",
  "interview_time",
  "sender_name"
] as const;

export type EmailTemplateValues = Partial<Record<(typeof TEMPLATE_VALUE_KEYS)[number], string>>;

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderEmailTemplate(content: string, values: EmailTemplateValues) {
  return TEMPLATE_VALUE_KEYS.reduce((result, key) => {
    const value = values[key];
    if (value === undefined) return result;
    return result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }, content);
}

export function appendSignature(body: string, signature: string | null | undefined) {
  const normalizedBody = body.trimEnd();
  const normalizedSignature = signature?.trim();
  if (!normalizedSignature) return normalizedBody;
  if (normalizedBody.endsWith(normalizedSignature)) return normalizedBody;
  return `${normalizedBody}\n\n--\n${normalizedSignature}`;
}

export function emailHtml(subject: string, body: string) {
  const paragraphs = body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)
    .map(paragraph => {
      const lines = paragraph.split("\n").map(line => escapeHtml(line)).join("<br />");
      return `<p style="margin:0 0 16px 0">${lines}</p>`;
    })
    .join("");
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8" />',
    `<title>${escapeHtml(subject)}</title>`,
    "</head>",
    '<body style="margin:0;padding:24px;background:#f6f8fa;color:#172033;font-family:Arial,sans-serif;font-size:15px;line-height:1.6">',
    '<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e9ef;border-radius:12px;padding:28px">',
    paragraphs,
    "</div></body></html>"
  ].join("");
}

export function formatInterviewDate(value: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeZone: timezone
    }).format(value);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(value);
  }
}

export function formatInterviewTime(value: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone
    }).format(value);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(value);
  }
}

export function previewText(body: string) {
  return body.replace(/\s+/g, " ").trim().slice(0, 180);
}
