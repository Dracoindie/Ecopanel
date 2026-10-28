const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function zonedPartsAt(instant: Date, timeZone: string): ZonedParts | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(instant);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const year = Number(values.year);
    const month = Number(values.month);
    const day = Number(values.day);
    const hour = Number(values.hour);
    const minute = Number(values.minute);
    const second = Number(values.second);
    if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;
    return { year, month, day, hour, minute, second };
  } catch {
    return null;
  }
}

function validDate(year: number, month: number, day: number) {
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

/**
 * Converts a wall-clock date/time in an IANA timezone to a UTC instant.
 * Returns null for invalid or non-existent local times (for example, the
 * spring-forward DST gap).
 */
export function zonedDateTimeToUtc(date: string, time: string, timeZone: string) {
  if (!isValidTimeZone(timeZone)) return null;
  const dateMatch = DATE_PATTERN.exec(date);
  const timeMatch = TIME_PATTERN.exec(time);
  if (!dateMatch || !timeMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (!validDate(year, month, day) || hour > 23 || minute > 59) return null;

  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = naive;
  for (let index = 0; index < 6; index += 1) {
    const parts = zonedPartsAt(new Date(candidate), timeZone);
    if (!parts) return null;
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const next = candidate + (naive - represented);
    if (next === candidate) break;
    candidate = next;
  }

  const resolved = zonedPartsAt(new Date(candidate), timeZone);
  if (!resolved) return null;
  if (
    resolved.year !== year ||
    resolved.month !== month ||
    resolved.day !== day ||
    resolved.hour !== hour ||
    resolved.minute !== minute
  ) {
    return null;
  }
  return new Date(candidate);
}

export function zonedDateTimeParts(value: string | Date, timeZone: string) {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = zonedPartsAt(instant, timeZone);
  if (!parts) return null;
  return {
    date: `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
    ...parts
  };
}

export function formatZonedDate(value: string | Date, timeZone: string) {
  const parts = zonedDateTimeParts(value, timeZone);
  return parts?.date ?? (value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10));
}

export function formatZonedTime(value: string | Date, timeZone: string) {
  const parts = zonedDateTimeParts(value, timeZone);
  return parts?.time ?? (value instanceof Date ? value.toISOString().slice(11, 16) : value.slice(11, 16));
}
