/**
 * Themes. Every UI component reads design tokens as CSS variables (var(--rc-color-primary)),
 * never hard-coded values, so a theme plugin can restyle the whole app, including other
 * plugins' pages. The coach picks the active theme and may override the tokens the theme
 * marks as editable; colour pairs are checked for WCAG AA contrast on save.
 */

export type TokenName =
  | 'color.primary'
  | 'color.onPrimary'
  | 'color.accent'
  | 'color.background'
  | 'color.surface'
  | 'color.text'
  | 'color.textMuted'
  | 'color.border'
  | 'color.success'
  | 'color.warning'
  | 'color.danger'
  | 'font.body'
  | 'font.heading'
  | 'font.pixel'
  | 'radius.card'
  | 'radius.button'
  | 'space.unit'
  | 'shadow.card';

export type TokenSet = Record<TokenName, string>;

/** Components a theme may replace. Overrides receive the same props as the default. */
export type OverridableComponent =
  | 'AppHeader'
  | 'BottomNav'
  | 'SessionCard'
  | 'AvatarFrame'
  | 'EmptyState';

export interface ThemeDefinition {
  id: string;
  tokens: { light: TokenSet; dark?: Partial<TokenSet> };
  /** Tokens the coach may change from the admin Appearance page. */
  editable: TokenName[];
  layout?: { nav: 'bottom-tabs' | 'side-menu'; density: 'compact' | 'comfortable' };
  components?: Partial<Record<OverridableComponent, unknown>>;
  fonts?: Array<{ family: string; url: string }>;
}

export const defaultTheme: ThemeDefinition = {
  id: 'default',
  tokens: {
    light: {
      'color.primary': '#1f5fbf',
      'color.onPrimary': '#ffffff',
      'color.accent': '#f2a516',
      'color.background': '#f7f8fa',
      'color.surface': '#ffffff',
      'color.text': '#16202c',
      'color.textMuted': '#536070',
      'color.border': '#d9dee5',
      'color.success': '#1e7d45',
      'color.warning': '#9a6100',
      'color.danger': '#b42318',
      'font.body': "'Be Vietnam Pro', system-ui, sans-serif",
      'font.heading': "'Be Vietnam Pro', system-ui, sans-serif",
      'font.pixel': "'Pixelify Sans', monospace",
      'radius.card': '12px',
      'radius.button': '10px',
      'space.unit': '4px',
      'shadow.card': '0 1px 2px rgba(16, 24, 40, 0.08)',
    },
    dark: {
      'color.background': '#0f141a',
      'color.surface': '#18202a',
      'color.text': '#eef2f6',
      'color.textMuted': '#a3afbd',
      'color.border': '#2a3542',
      'color.primary': '#6aa3ff',
      'color.onPrimary': '#0b1220',
    },
  },
  editable: ['color.primary', 'color.onPrimary', 'color.accent'],
  layout: { nav: 'bottom-tabs', density: 'comfortable' },
};

/** Text/background pairs that must stay readable whatever the coach picks. */
export const CONTRAST_PAIRS: Array<[TokenName, TokenName]> = [
  ['color.onPrimary', 'color.primary'],
  ['color.text', 'color.background'],
  ['color.text', 'color.surface'],
];

export interface ResolvedTheme {
  id: string;
  light: TokenSet;
  dark: TokenSet;
  layout: NonNullable<ThemeDefinition['layout']>;
  components: NonNullable<ThemeDefinition['components']>;
}

export class ThemeValidationError extends Error {}

/**
 * Pick the active theme (falling back to the default) and apply the coach's overrides.
 * Overrides for non-editable tokens are ignored; overrides that break contrast are rejected.
 */
export function resolveTheme(
  available: ThemeDefinition[],
  activeId: string,
  overrides: Record<string, string> = {},
): ResolvedTheme {
  const theme = available.find((t) => t.id === activeId) ?? defaultTheme;
  const allowed = Object.fromEntries(
    Object.entries(overrides).filter(([k]) => theme.editable.includes(k as TokenName)),
  ) as Partial<TokenSet>;

  const light: TokenSet = { ...defaultTheme.tokens.light, ...theme.tokens.light, ...allowed };
  const dark: TokenSet = { ...light, ...defaultTheme.tokens.dark, ...theme.tokens.dark };

  for (const [fg, bg] of CONTRAST_PAIRS) {
    const ratio = contrastRatio(light[fg], light[bg]);
    if (ratio !== null && ratio < 4.5) {
      throw new ThemeValidationError(
        `${fg} on ${bg} has contrast ${ratio.toFixed(2)}:1; at least 4.5:1 is needed`,
      );
    }
  }

  return {
    id: theme.id,
    light,
    dark,
    layout: theme.layout ?? defaultTheme.layout ?? { nav: 'bottom-tabs', density: 'comfortable' },
    components: theme.components ?? {},
  };
}

/** Render tokens as CSS custom properties: 'color.primary' -> --rc-color-primary */
export function toCssVariables(tokens: TokenSet): string {
  return Object.entries(tokens)
    .map(
      ([k, v]) =>
        `--rc-${k
          .replace(/\./g, '-')
          .replace(/([A-Z])/g, '-$1')
          .toLowerCase()}: ${v};`,
    )
    .join('\n');
}

export function themeStylesheet(theme: ResolvedTheme): string {
  return [
    `:root {\n${toCssVariables(theme.light)}\n}`,
    `@media (prefers-color-scheme: dark) {\n:root {\n${toCssVariables(theme.dark)}\n}\n}`,
  ].join('\n');
}

/** WCAG 2.x contrast ratio for two #rrggbb colours; null if either is not a hex colour. */
export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function luminance(hex: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1], 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
