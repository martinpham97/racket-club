import { describe, expect, it } from 'vitest';
import { definePlugin } from './define';
import {
  contrastRatio,
  defaultTheme,
  resolveTheme,
  type ThemeDefinition,
  ThemeValidationError,
  themeStylesheet,
  toCssVariables,
} from './theme';

const court: ThemeDefinition = {
  id: 'theme-court',
  tokens: { light: { ...defaultTheme.tokens.light, 'color.primary': '#0b6b3a' } },
  editable: ['color.primary'],
  layout: { nav: 'side-menu', density: 'compact' },
};

describe('resolveTheme', () => {
  it('falls back to the default theme for an unknown id', () => {
    expect(resolveTheme([court], 'nope').id).toBe('default');
  });

  it('uses the active theme and its layout', () => {
    const t = resolveTheme([court], 'theme-court');
    expect(t.light['color.primary']).toBe('#0b6b3a');
    expect(t.layout.nav).toBe('side-menu');
  });

  it('applies editable overrides and ignores the rest', () => {
    const t = resolveTheme([court], 'theme-court', {
      'color.primary': '#7a1f1f',
      'color.background': '#000000',
    });
    expect(t.light['color.primary']).toBe('#7a1f1f');
    expect(t.light['color.background']).toBe(defaultTheme.tokens.light['color.background']);
  });

  it('rejects a coach colour that makes button text unreadable', () => {
    expect(() => resolveTheme([court], 'theme-court', { 'color.primary': '#f5f5f5' })).toThrow(
      ThemeValidationError,
    );
  });

  it('builds a dark palette on top of the light one', () => {
    const t = resolveTheme([], 'default');
    expect(t.dark['color.background']).toBe('#0f141a');
    expect(t.dark['font.body']).toBe(t.light['font.body']);
  });
});

describe('css output', () => {
  it('turns token names into --rc- variables', () => {
    const css = toCssVariables(defaultTheme.tokens.light);
    expect(css).toContain('--rc-color-primary: #1f5fbf;');
    expect(css).toContain('--rc-color-on-primary: #ffffff;');
    expect(css).toContain('--rc-radius-card: 12px;');
  });

  it('emits light variables and a dark media query', () => {
    const sheet = themeStylesheet(resolveTheme([], 'default'));
    expect(sheet).toMatch(/^:root \{/);
    expect(sheet).toContain('@media (prefers-color-scheme: dark)');
  });
});

describe('contrastRatio', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('red', '#ffffff')).toBeNull();
  });

  it('default theme passes AA for its text pairs', () => {
    const l = defaultTheme.tokens.light;
    expect(contrastRatio(l['color.onPrimary'], l['color.primary'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(l['color.text'], l['color.background'])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('theme plugins', () => {
  it('requires the theme id to match the plugin id', () => {
    expect(() =>
      definePlugin({
        id: 'theme-x',
        name: { en: 'X', vi: 'X' },
        version: '0.1.0',
        requiresCore: '^0.1.0',
        theme: { ...court, id: 'other' },
      }),
    ).toThrow(/must match/);
  });
});
