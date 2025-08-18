import { startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Calculates the duration in minutes between two time strings in HH:mm format
 *
 * @description Computes the time difference between a start time and end time, both
 * provided as strings in 24-hour HH:mm format. Converts each time to total minutes
 * since midnight and returns the difference. Assumes both times are within the same
 * day (does not handle overnight durations crossing midnight).
 *
 * @param startTime - Start time in HH:mm format (24-hour notation, e.g., "09:30", "14:15")
 * @param endTime - End time in HH:mm format (24-hour notation, e.g., "11:45", "16:30")
 *
 * @returns Duration in minutes between start and end time (positive number)
 *
 * @throws {Error} When time strings are not in valid HH:mm format
 * @throws {Error} When start time is after end time (negative duration)
 *
 * @example
 * ```typescript
 * // Calculate session duration
 * const duration = getTimeDurationInMinutes("09:30", "11:45");
 * console.log(duration); // 135 (2 hours 15 minutes)
 *
 * // Calculate timeslot duration
 * const timeslotDuration = getTimeDurationInMinutes("14:00", "15:30");
 * console.log(timeslotDuration); // 90 (1.5 hours)
 *
 * // Convert to hours
 * const hours = getTimeDurationInMinutes("10:00", "12:30") / 60;
 * console.log(hours); // 2.5
 * ```
 */
export const getTimeDurationInMinutes = (startTime: string, endTime: string): number => {
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);

  const startTotalMinutes = startHours * 60 + startMinutes;
  const endTotalMinutes = endHours * 60 + endMinutes;

  return endTotalMinutes - startTotalMinutes;
};

/**
 * Converts a time string and timezone to a UTC timestamp for a specific date
 *
 * @description Takes a local time (HH:MM format) and converts it to a UTC timestamp
 * by applying the specified timezone offset to the target date. This is useful for
 * scheduling events that need to occur at a specific local time regardless of the
 * server's timezone.
 *
 * @param time - Time string in HH:MM format (24-hour format, e.g., "14:30", "09:00")
 * @param timezone - IANA timezone identifier (e.g., "America/New_York", "Europe/London", "Australia/Sydney")
 * @param targetDate - Target date as Unix timestamp in milliseconds (typically from Date.getTime())
 *
 * @returns UTC timestamp in milliseconds representing the specified local time on the target date
 *
 * @throws {Error} When time format is invalid or timezone is not recognized
 *
 * @example
 * ```typescript
 * // Schedule for 2:30 PM Sydney time on a specific date
 * const targetDate = new Date('2024-01-15').getTime();
 * const utcTime = getUtcTimestampFromZonedTime("14:30", "Australia/Sydney", targetDate);
 *
 * // Use with scheduler
 * await ctx.scheduler.runAt(utcTime, myScheduledFunction, { data });
 * ```
 *
 * @example
 * ```typescript
 * // Convert session start time to UTC for database storage
 * const sessionDate = Date.now();
 * const startTimeUtc = getUtcTimestampFromZonedTime(
 *   "09:00",
 *   "America/Los_Angeles",
 *   sessionDate
 * );
 * ```
 */
export const getUtcTimestampForDate = (
  time: string,
  timezone: string,
  targetDate: number,
): number => {
  const [hours, minutes] = time.split(":").map(Number);
  const zonedTime = toZonedTime(targetDate, timezone);
  zonedTime.setHours(hours, minutes, 0, 0);
  const utcTimestamp = fromZonedTime(zonedTime, timezone);
  return utcTimestamp.getTime();
};

/**
 * Converts a UTC date to the start of day (midnight) in a specific timezone
 *
 * @param utcDate - UTC date as Date object, string, or timestamp in milliseconds
 * @param timezone - IANA timezone identifier (e.g., "America/New_York", "Europe/London", "Australia/Sydney")
 * @returns UTC Date object representing midnight in the specified timezone
 *
 * **Process:**
 * 1. Converts UTC date to the target timezone
 * 2. Sets time to start of day (00:00:00) in that timezone
 * 3. Converts back to UTC while preserving the local date boundary
 *
 * **Use Cases:**
 * - Finding what UTC timestamp represents midnight in a user's timezone
 * - Scheduling daily events at local midnight
 * - Date boundary calculations for different timezones
 */
export const getStartOfDayInTimezone = (
  utcDate: Date | string | number,
  timezone: string,
): Date => {
  const zonedDate = toZonedTime(utcDate, timezone);
  const startOfDayInZone = startOfDay(zonedDate);
  return fromZonedTime(startOfDayInZone, timezone);
};
