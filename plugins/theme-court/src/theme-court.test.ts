import {
  contrastRatio,
  PluginRegistry,
  resolveTheme,
  type ThemeDefinition,
} from '@racket-club/plugin-sdk';
import { describe, expect, it } from 'vitest';
import plugin from './index';

describe('Court Green theme', () => {
  it('becomes available once its plugin is active', () => {
    const reg = new PluginRegistry([plugin], '0.1.0');
    expect(reg.themes()).toEqual([]);
    reg.activate('theme-court');
    const themes = reg.themes().map((p) => p.theme as ThemeDefinition);
    const t = resolveTheme(themes, 'theme-court');
    expect(t.id).toBe('theme-court');
    expect(t.layout.nav).toBe('side-menu');
  });

  it('meets WCAG AA in light and dark', () => {
    const t = resolveTheme([plugin.theme as ThemeDefinition], 'theme-court');
    for (const tokens of [t.light, t.dark]) {
      expect(
        contrastRatio(tokens['color.onPrimary'], tokens['color.primary']),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(tokens['color.text'], tokens['color.background']),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
