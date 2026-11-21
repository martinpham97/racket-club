import { describe, expect, it } from 'vitest';
import { addDays, fromLocal, toLocal } from './time';

const SYD = 'Australia/Sydney';

describe('fromLocal', () => {
  it('converts Sydney summer time (UTC+11)', () => {
    const at = { year: 2026, month: 12, day: 7, hour: 18, minute: 0 };
    expect(fromLocal(at, SYD).toISOString()).toBe('2026-12-07T07:00:00.000Z');
  });

  it('converts Sydney winter time (UTC+10)', () => {
    const at = { year: 2026, month: 6, day: 1, hour: 18, minute: 30 };
    expect(fromLocal(at, SYD).toISOString()).toBe('2026-06-01T08:30:00.000Z');
  });

  it('follows the daylight saving change on the day it happens', () => {
    // Clocks go forward at 02:00 on 4 Oct 2026 in Sydney.
    expect(
      fromLocal({ year: 2026, month: 10, day: 4, hour: 1, minute: 0 }, SYD).toISOString(),
    ).toBe('2026-10-03T15:00:00.000Z');
    expect(
      fromLocal({ year: 2026, month: 10, day: 4, hour: 9, minute: 0 }, SYD).toISOString(),
    ).toBe('2026-10-03T22:00:00.000Z');
  });

  it('works for other zones, and UTC', () => {
    const at = { year: 2026, month: 12, day: 7, hour: 18, minute: 0 };
    expect(fromLocal(at, 'Asia/Ho_Chi_Minh').toISOString()).toBe('2026-12-07T11:00:00.000Z');
    expect(fromLocal(at, 'UTC').toISOString()).toBe('2026-12-07T18:00:00.000Z');
  });
});

describe('toLocal', () => {
  it('gives the wall-clock date, time and weekday', () => {
    expect(toLocal(new Date('2026-12-06T13:30:00.000Z'), SYD)).toEqual({
      year: 2026,
      month: 12,
      day: 7,
      hour: 0,
      minute: 30,
      weekday: 1, // Monday in Sydney, still Sunday in UTC
    });
  });

  it('round-trips with fromLocal', () => {
    const at = { year: 2027, month: 3, day: 15, hour: 19, minute: 45 };
    const { weekday: _, ...back } = toLocal(fromLocal(at, SYD), SYD);
    expect(back).toEqual(at);
  });
});

describe('addDays', () => {
  it('crosses month and year ends', () => {
    expect(addDays({ year: 2026, month: 12, day: 28 }, 7)).toEqual({
      year: 2027,
      month: 1,
      day: 4,
    });
    expect(addDays({ year: 2028, month: 2, day: 28 }, 1)).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
  });
});
