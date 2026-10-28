import { describe, expect, it } from "vitest";
import {
  formatZonedDate,
  formatZonedTime,
  isValidTimeZone,
  zonedDateTimeParts,
  zonedDateTimeToUtc
} from "@/lib/timezone";

describe("Phase 2D timezone conversion", () => {
  it("converts London summer and winter wall-clock times to UTC", () => {
    expect(zonedDateTimeToUtc("2027-07-14", "10:00", "Europe/London")?.toISOString())
      .toBe("2027-07-14T09:00:00.000Z");
    expect(zonedDateTimeToUtc("2027-01-14", "10:00", "Europe/London")?.toISOString())
      .toBe("2027-01-14T10:00:00.000Z");
  });

  it("converts New York wall-clock times across DST", () => {
    expect(zonedDateTimeToUtc("2027-07-14", "10:00", "America/New_York")?.toISOString())
      .toBe("2027-07-14T14:00:00.000Z");
    expect(zonedDateTimeToUtc("2027-01-14", "10:00", "America/New_York")?.toISOString())
      .toBe("2027-01-14T15:00:00.000Z");
  });

  it("rejects the spring-forward gap and invalid inputs", () => {
    expect(zonedDateTimeToUtc("2026-03-29", "01:30", "Europe/London")).toBeNull();
    expect(zonedDateTimeToUtc("2026-02-30", "10:00", "Europe/London")).toBeNull();
    expect(zonedDateTimeToUtc("2026-10-27", "25:00", "Europe/London")).toBeNull();
    expect(zonedDateTimeToUtc("2026-10-27", "10:00", "Not/AZone")).toBeNull();
  });

  it("round-trips wall-clock parts for display", () => {
    const instant = "2027-07-14T09:00:00.000Z";
    expect(zonedDateTimeParts(instant, "Europe/London")).toMatchObject({
      date: "2027-07-14",
      time: "10:00"
    });
    expect(formatZonedDate(instant, "Europe/London")).toBe("2027-07-14");
    expect(formatZonedTime(instant, "Asia/Singapore")).toBe("17:00");
  });

  it("recognizes valid IANA time zones", () => {
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("")).toBe(false);
  });
});
