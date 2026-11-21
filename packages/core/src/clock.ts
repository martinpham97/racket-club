/**
 * Time is always injected, never read with `new Date()` inside domain logic,
 * so reminders, cut-offs and streaks can be tested with a fake clock.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(iso: string): Clock & { advance(ms: number): void } {
  let current = new Date(iso).getTime();
  return {
    now: () => new Date(current),
    advance(ms: number) {
      current += ms;
    },
  };
}

export const HOUR_MS = 60 * 60 * 1000;
