/**
 * Wall-clock times in the coach's timezone (default Australia/Sydney) to and from the UTC
 * instants we store. Uses Intl, so daylight saving follows the IANA database.
 */
export interface LocalDate {
  year: number;
  month: number; // 1-12
  day: number;
}

export interface LocalDateTime extends LocalDate {
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The wall-clock date and time at a UTC instant in a timezone. `weekday` is 0 for Sunday. */
export function toLocal(instant: Date, timeZone: string): LocalDateTime & { weekday: number } {
  const parts = formatter(timeZone).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(part('year')),
    month: Number(part('month')),
    day: Number(part('day')),
    hour: Number(part('hour')),
    minute: Number(part('minute')),
    weekday: WEEKDAYS.indexOf(part('weekday')),
  };
}

function offsetMs(utcMs: number, timeZone: string): number {
  const l = toLocal(new Date(utcMs), timeZone);
  const seconds = new Date(utcMs).getUTCSeconds();
  return Date.UTC(l.year, l.month - 1, l.day, l.hour, l.minute, seconds) - (utcMs - (utcMs % 1000));
}

/**
 * The UTC instant of a wall-clock time in a timezone, e.g. 18:00 on 7 Dec in Sydney is 07:00Z.
 * In the hour skipped when clocks go forward, the result is an hour later than asked.
 */
export function fromLocal(local: LocalDateTime, timeZone: string): Date {
  const guess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const first = guess - offsetMs(guess, timeZone);
  const second = guess - offsetMs(first, timeZone);
  return new Date(second);
}

/** Calendar arithmetic on dates without a time (no timezone involved). */
export function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}
