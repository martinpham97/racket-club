/**
 * pnpm create-plugin <id> [--theme]
 *
 * Scaffolds plugins/<id> with a manifest, translations and unit tests, so every new
 * plugin starts with tests (they are required in CI).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function renderPlugin(id: string, opts: { theme: boolean }): Record<string, string> {
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(id)) {
    throw new Error('Plugin id must be lowercase letters, digits and dashes (2-40 chars)');
  }
  const title = id
    .split('-')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');

  const themeBlock = opts.theme
    ? `
  theme: {
    id: '${id}',
    tokens: { light: { ...defaultTheme.tokens.light, 'color.primary': '#1f5fbf' } },
    editable: ['color.primary', 'color.accent'],
    layout: { nav: 'bottom-tabs', density: 'comfortable' },
  },`
    : `
  hooks: {
    'booking.created': async (event, ctx) => {
      ctx.log.info('booking created', { sessionId: event.payload.sessionId });
    },
  },`;

  const index = `import { definePlugin${opts.theme ? ', defaultTheme' : ''} } from '@racket-club/plugin-sdk';

export default definePlugin({
  id: '${id}',
  name: { en: '${title}', vi: '${title}' }, // TODO: Vietnamese name
  version: '0.1.0',
  requiresCore: '^0.1.0',
  permissions: [],${themeBlock}
  i18n: {
    en: async () => ({ title: '${title}' }),
    vi: async () => ({ title: '${title}' }), // TODO: translate
  },
});
`;

  const test = `import { PluginRegistry } from '@racket-club/plugin-sdk';
import { describe, expect, it } from 'vitest';
import plugin from './index';

describe('${id}', () => {
  it('installs and activates', () => {
    const reg = new PluginRegistry([plugin], '0.1.0');
    reg.activate('${id}');
    expect(reg.isActive('${id}')).toBe(true);
  });

  it('has the same translation keys in en and vi', async () => {
    const en = await plugin.i18n?.en?.();
    const vi = await plugin.i18n?.vi?.();
    expect(Object.keys(vi ?? {})).toEqual(Object.keys(en ?? {}));
  });
});
`;

  const pkg = `${JSON.stringify(
    {
      name: `@racket-club/plugin-${id}`,
      version: '0.1.0',
      private: true,
      type: 'module',
      main: 'src/index.ts',
      scripts: { typecheck: 'tsc -p tsconfig.json' },
      dependencies: { '@racket-club/plugin-sdk': 'workspace:*' },
    },
    null,
    2,
  )}\n`;

  const tsconfig = `${JSON.stringify({ extends: '../../tsconfig.base.json', include: ['src'] }, null, 2)}\n`;

  return {
    'package.json': pkg,
    'tsconfig.json': tsconfig,
    'src/index.ts': index,
    [`src/${id}.test.ts`]: test,
    'README.md': `# ${title}\n\nA Racket Club plugin. Add it to \`racket-club.config.ts\`, deploy, then switch it on in Admin > Plugins.\n`,
  };
}

function main(argv: string[]): void {
  const id = argv.find((a) => !a.startsWith('--'));
  if (!id) {
    console.error('Usage: pnpm create-plugin <id> [--theme]');
    process.exit(1);
  }
  const dir = resolve(process.cwd(), 'plugins', id);
  if (existsSync(dir)) {
    console.error(`plugins/${id} already exists`);
    process.exit(1);
  }
  for (const [path, content] of Object.entries(
    renderPlugin(id, { theme: argv.includes('--theme') }),
  )) {
    const full = join(dir, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  console.log(`Created plugins/${id}. Next: add it to racket-club.config.ts, then run pnpm test.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
