import { describe, expect, it } from 'vitest';
import { DEFAULT_BRANDING, resolveBranding } from './branding';
import { addMoney, formatMoney, money } from './money';

describe('branding', () => {
  it('defaults to Racket Club', () => {
    expect(resolveBranding(undefined).appName).toBe('Racket Club');
  });

  it('lets the deploy-time APP_NAME replace the default', () => {
    const b = resolveBranding(undefined, { APP_NAME: 'Smash Academy', DEFAULT_LOCALE: 'vi' });
    expect(b.appName).toBe('Smash Academy');
    expect(b.defaultLocale).toBe('vi');
  });

  it("prefers the coach's saved settings over env and defaults", () => {
    const b = resolveBranding(
      { appName: 'Coach Linh Badminton', activeThemeId: 'theme-court' },
      { APP_NAME: 'Ignored' },
    );
    expect(b.appName).toBe('Coach Linh Badminton');
    expect(b.activeThemeId).toBe('theme-court');
    expect(b.shortName).toBe('Coach Linh B');
  });

  it('ignores an unsupported locale from env', () => {
    expect(resolveBranding(undefined, { DEFAULT_LOCALE: 'fr' }).defaultLocale).toBe(
      DEFAULT_BRANDING.defaultLocale,
    );
  });
});

describe('money', () => {
  it('adds cents and formats per locale', () => {
    expect(addMoney(money(1050), money(250)).cents).toBe(1300);
    expect(formatMoney(money(2350))).toBe('$23.50');
  });

  it('refuses fractional cents and mixed currencies', () => {
    expect(() => money(10.5)).toThrow();
    expect(() => addMoney(money(1), money(1, 'USD'))).toThrow();
  });
});
