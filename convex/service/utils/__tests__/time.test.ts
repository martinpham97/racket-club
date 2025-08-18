import { getStartOfDayInTimezone, getTimeDurationInMinutes, getUtcTimestampForDate } from "@/convex/service/utils/time";
import { describe, expect, it } from "vitest";

describe("getTimeDurationInMinutes", () => {
  it("should calculate duration correctly for same hour", () => {
    expect(getTimeDurationInMinutes("09:30", "09:45")).toBe(15);
  });

  it("should calculate duration correctly across hours", () => {
    expect(getTimeDurationInMinutes("09:30", "11:45")).toBe(135);
  });

  it("should calculate duration correctly for whole hours", () => {
    expect(getTimeDurationInMinutes("14:00", "16:00")).toBe(120);
  });

  it("should calculate duration correctly for 30-minute intervals", () => {
    expect(getTimeDurationInMinutes("14:00", "15:30")).toBe(90);
  });

  it("should return 0 for same start and end time", () => {
    expect(getTimeDurationInMinutes("12:00", "12:00")).toBe(0);
  });

  it("should handle midnight times", () => {
    expect(getTimeDurationInMinutes("00:00", "01:00")).toBe(60);
  });

  it("should handle late evening times", () => {
    expect(getTimeDurationInMinutes("22:30", "23:45")).toBe(75);
  });
});

describe("getUtcTimestampForDate", () => {
  it("should convert New York time to UTC correctly", () => {
    const targetDate = new Date("2024-01-15T12:00:00Z").getTime();
    const result = getUtcTimestampForDate("14:30", "America/New_York", targetDate);
    
    // 14:30 EST (UTC-5) should be 19:30 UTC
    const expected = new Date("2024-01-15T19:30:00Z").getTime();
    expect(result).toBe(expected);
  });

  it("should convert Sydney time to UTC correctly", () => {
    const targetDate = new Date("2024-01-15T12:00:00Z").getTime();
    const result = getUtcTimestampForDate("14:30", "Australia/Sydney", targetDate);
    
    // 14:30 AEDT (UTC+11) should be 03:30 UTC
    const expected = new Date("2024-01-15T03:30:00Z").getTime();
    expect(result).toBe(expected);
  });

  it("should handle midnight times", () => {
    const targetDate = new Date("2024-01-15T12:00:00Z").getTime();
    const result = getUtcTimestampForDate("00:00", "America/New_York", targetDate);
    
    // 00:00 EST (UTC-5) should be 05:00 UTC
    const expected = new Date("2024-01-15T05:00:00Z").getTime();
    expect(result).toBe(expected);
  });

  it("should handle late evening times", () => {
    const targetDate = new Date("2024-01-15T12:00:00Z").getTime();
    const result = getUtcTimestampForDate("23:45", "Europe/London", targetDate);
    
    // 23:45 GMT (UTC+0) should be 23:45 UTC
    const expected = new Date("2024-01-15T23:45:00Z").getTime();
    expect(result).toBe(expected);
  });
});

describe("getStartOfDayInTimezone", () => {
  it("should get start of day for New York timezone", () => {
    const utcDate = new Date("2024-01-15T15:30:00Z");
    const result = getStartOfDayInTimezone(utcDate, "America/New_York");
    
    // Start of Jan 15 in NY (EST, UTC-5) should be Jan 15 05:00 UTC
    const expected = new Date("2024-01-15T05:00:00Z");
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("should get start of day for Sydney timezone", () => {
    const utcDate = new Date("2024-01-15T15:30:00Z");
    const result = getStartOfDayInTimezone(utcDate, "Australia/Sydney");
    
    // Start of Jan 16 in Sydney (AEDT, UTC+11) should be Jan 15 13:00 UTC
    const expected = new Date("2024-01-15T13:00:00Z");
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("should handle UTC timezone", () => {
    const utcDate = new Date("2024-01-15T15:30:00Z");
    const result = getStartOfDayInTimezone(utcDate, "UTC");
    
    // Start of Jan 15 in UTC should be Jan 15 00:00 UTC
    const expected = new Date("2024-01-15T00:00:00Z");
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("should work with timestamp input", () => {
    const timestamp = new Date("2024-01-15T15:30:00Z").getTime();
    const result = getStartOfDayInTimezone(timestamp, "America/New_York");
    
    const expected = new Date("2024-01-15T05:00:00Z");
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("should work with string input", () => {
    const dateString = "2024-01-15T15:30:00Z";
    const result = getStartOfDayInTimezone(dateString, "Europe/London");
    
    // Start of Jan 15 in London (GMT, UTC+0) should be Jan 15 00:00 UTC
    const expected = new Date("2024-01-15T00:00:00Z");
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("should handle timezone crossing date boundary", () => {
    const utcDate = new Date("2024-01-15T02:00:00Z");
    const result = getStartOfDayInTimezone(utcDate, "Australia/Sydney");
    
    // 02:00 UTC on Jan 15 is 13:00 on Jan 15 in Sydney
    // Start of Jan 15 in Sydney should be Jan 14 13:00 UTC
    const expected = new Date("2024-01-14T13:00:00Z");
    expect(result.getTime()).toBe(expected.getTime());
  });
});