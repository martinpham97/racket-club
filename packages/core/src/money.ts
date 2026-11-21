/** Money is stored as integer cents plus an ISO currency code. Never floats. */
export interface Money {
  cents: number;
  currency: string;
}

export function money(cents: number, currency = 'AUD'): Money {
  if (!Number.isInteger(cents)) throw new Error(`Money must be whole cents, got ${cents}`);
  return { cents, currency };
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { cents: a.cents + b.cents, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { cents: a.cents - b.cents, currency: a.currency };
}

export function formatMoney(m: Money, locale = 'en-AU'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency }).format(
    m.cents / 100,
  );
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}
