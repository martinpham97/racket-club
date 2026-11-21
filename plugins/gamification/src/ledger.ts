import type { Slot } from './avatar';

/**
 * XP and coins are an append-only ledger keyed by the source event id,
 * so a retried event never pays twice. Balances are derived.
 */
export interface LedgerEntry {
  id: string; // `${sourceEventId}#${reason}` keeps awards idempotent
  userId: string;
  xp: number;
  coins: number;
  reason: string;
  at: string;
}

export interface Balance {
  xp: number;
  coins: number;
  level: number;
}

export interface EarningRules {
  bookSession: { xp: number; coins: number };
  attend: { xp: number; coins: number };
  streak4Weeks: { xp: number; coins: number };
  payOnTime: { xp: number; coins: number };
  referral: { xp: number; coins: number };
  stringingOrder: { xp: number; coins: number };
  /** Level n needs levelFactor * n^2 XP */
  levelFactor: number;
}

export const DEFAULT_RULES: EarningRules = {
  bookSession: { xp: 2, coins: 0 },
  attend: { xp: 10, coins: 5 },
  streak4Weeks: { xp: 25, coins: 15 },
  payOnTime: { xp: 5, coins: 5 },
  referral: { xp: 20, coins: 20 },
  stringingOrder: { xp: 0, coins: 5 },
  levelFactor: 50,
};

export function levelForXp(xp: number, factor = DEFAULT_RULES.levelFactor): number {
  // Level 0 at 0 XP; level n reached at factor * n^2
  return Math.floor(Math.sqrt(Math.max(0, xp) / factor));
}

export function xpForLevel(level: number, factor = DEFAULT_RULES.levelFactor): number {
  return factor * level * level;
}

export function balanceOf(entries: LedgerEntry[], factor = DEFAULT_RULES.levelFactor): Balance {
  const xp = entries.reduce((s, e) => s + e.xp, 0);
  const coins = entries.reduce((s, e) => s + e.coins, 0);
  return { xp, coins, level: levelForXp(xp, factor) };
}

/** Append an entry unless one with the same id exists. Returns the new ledger and whether it changed. */
export function award(
  entries: LedgerEntry[],
  entry: LedgerEntry,
): { entries: LedgerEntry[]; added: boolean } {
  if (entries.some((e) => e.id === entry.id)) return { entries, added: false };
  return { entries: [...entries, entry], added: true };
}

export interface ShopItem {
  id: string;
  name: { en: string; vi: string };
  slot: Slot;
  priceCoins: number;
  minLevel: number;
  /** Optional sale window, ISO strings */
  availableFrom?: string;
  availableUntil?: string;
  stock?: number;
}

export type PurchaseResult =
  | { ok: true; entries: LedgerEntry[]; inventory: string[] }
  | {
      ok: false;
      reason: 'owned' | 'level-too-low' | 'not-enough-coins' | 'not-available' | 'sold-out';
    };

/**
 * Buy an item. In AWS this is one DynamoDB transaction with a `balance >= price` condition;
 * this function holds the same rules for unit tests and the local dev server.
 */
export function purchase(
  entries: LedgerEntry[],
  inventory: string[],
  item: ShopItem,
  userId: string,
  now: Date,
  factor = DEFAULT_RULES.levelFactor,
): PurchaseResult {
  if (inventory.includes(item.id)) return { ok: false, reason: 'owned' };
  if (item.stock !== undefined && item.stock <= 0) return { ok: false, reason: 'sold-out' };
  const t = now.getTime();
  if (
    (item.availableFrom && t < Date.parse(item.availableFrom)) ||
    (item.availableUntil && t > Date.parse(item.availableUntil))
  ) {
    return { ok: false, reason: 'not-available' };
  }
  const bal = balanceOf(entries, factor);
  if (bal.level < item.minLevel) return { ok: false, reason: 'level-too-low' };
  if (bal.coins < item.priceCoins) return { ok: false, reason: 'not-enough-coins' };
  return {
    ok: true,
    inventory: [...inventory, item.id],
    entries: [
      ...entries,
      {
        id: `purchase#${item.id}`,
        userId,
        xp: 0,
        coins: -item.priceCoins,
        reason: `shop:${item.id}`,
        at: now.toISOString(),
      },
    ],
  };
}
