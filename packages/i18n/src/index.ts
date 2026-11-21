import en from './en';
import vi from './vi';

export const SUPPORTED_LOCALES = ['en', 'vi'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const coreMessages: Record<Locale, Record<string, unknown>> = { en, vi };

/** Flatten nested messages to dotted keys: { a: { b: 'x' } } -> { 'a.b': 'x' } */
export function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object')
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    else out[key] = String(v);
  }
  return out;
}

/** Keys present in `reference` but missing (or empty) in `candidate`. Used in CI for core and every plugin. */
export function missingKeys(
  reference: Record<string, unknown>,
  candidate: Record<string, unknown>,
): string[] {
  const ref = flatten(reference);
  const cand = flatten(candidate);
  return Object.keys(ref).filter((k) => !cand[k]?.trim());
}

/** Placeholders like {count} or {reference} must match between languages. */
export function placeholderMismatches(
  reference: Record<string, unknown>,
  candidate: Record<string, unknown>,
): string[] {
  const ref = flatten(reference);
  const cand = flatten(candidate);
  return Object.keys(ref).filter(
    (k) => cand[k] !== undefined && argumentNames(ref[k] ?? '') !== argumentNames(cand[k] ?? ''),
  );
}

/**
 * ICU argument names in a message. A `{` at even nesting depth opens an argument
 * ({count}, {count, plural, ...}); at odd depth it opens a plural/select branch ({Full}),
 * whose text is not a variable.
 */
export function argumentNames(message: string): string {
  const names = new Set<string>();
  let depth = 0;
  for (let i = 0; i < message.length; i++) {
    const ch = message[i];
    if (ch === '{') {
      if (depth % 2 === 0) {
        const m = /^\s*([A-Za-z_]\w*)\s*[,}]/.exec(message.slice(i + 1));
        if (m?.[1]) names.add(m[1]);
      }
      depth++;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
    }
  }
  return [...names].sort().join(',');
}

export function pickLocale(requested: string | undefined | null, fallback: Locale = 'en'): Locale {
  const short = requested?.toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(short ?? '')
    ? (short as Locale)
    : fallback;
}
