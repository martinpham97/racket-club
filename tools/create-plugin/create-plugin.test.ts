import { describe, expect, it } from 'vitest';
import { renderPlugin } from './index';

describe('create-plugin', () => {
  it('scaffolds a plugin with tests and translations', () => {
    const files = renderPlugin('socials', { theme: false });
    expect(Object.keys(files).sort()).toEqual(
      ['README.md', 'package.json', 'src/index.ts', 'src/socials.test.ts', 'tsconfig.json'].sort(),
    );
    expect(files['src/index.ts']).toContain("id: 'socials'");
    expect(files['src/index.ts']).toContain("'booking.created'");
  });

  it('scaffolds a theme plugin', () => {
    const files = renderPlugin('theme-night', { theme: true });
    expect(files['src/index.ts']).toContain('defaultTheme');
    expect(files['src/index.ts']).toContain("id: 'theme-night'");
  });

  it('rejects bad ids', () => {
    expect(() => renderPlugin('Bad Id', { theme: false })).toThrow();
  });
});
