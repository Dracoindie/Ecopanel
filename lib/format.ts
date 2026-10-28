const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return "—";
  return `${day} ${MONTHS[Number(month) - 1] ?? "—"} ${year}`;
}

export function formatDateShort(value: string | null | undefined) {
  if (!value) return "—";
  const [, month, day] = value.slice(0, 10).split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? "—"}`;
}

export function formatTime(value: string) {
  return value.slice(11, 16) || "—";
}

export function formatDateTime(value: string, timezone?: string) {
  return `${formatDate(value)} · ${formatTime(value)}${timezone ? ` ${timezone.split("/").pop()?.replace("_", " ")}` : ""}`;
}

export function formatFileSize(bytes: number) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

export function startOfDay(value: string) {
  return value.slice(0, 10);
}

export function calendarCells(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const startWeekday = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: Array<{ day: number; date: string } | null> = Array.from({ length: startWeekday }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ day, date });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month, 1))
  );
}
