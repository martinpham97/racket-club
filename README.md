# Racket Club

A free, open-source booking app for badminton coaches. Students sign in with Google, book
classes and keep a profile; the coach runs everything from an admin console. It runs entirely
on AWS serverless services in the coach's own AWS account, and everything beyond the core
(stringing, gamification, themes, messaging apps, socials, tournaments) is a plugin.

"Racket Club" is the project name. Each coach sets their own app name, logo, colours and theme,
so their students see the coach's brand.

> Status: Phase 0 (foundations). See the design plan for the roadmap.

## For coaches: deploy in one click

1. Create an AWS account (choose the **Paid** plan; you still get the sign-up credits).
2. Click **Launch Stack** (link published with each release), fill in your email and app name.
3. Wait about 10 minutes, then open the link in the email and follow the setup wizard.

The Basic setup costs about US$1 a month for 100 students.

## For developers

Requirements: Node.js 22+, pnpm 10+, Docker (for DynamoDB Local).

```bash
pnpm install
cp .env.example .env
pnpm dev          # web app + API with hot reload + DynamoDB Local + mock sign-in
pnpm seed         # demo coach, 20 students, a term of classes
```

| Command                   | What it does                                            |
| ------------------------- | ------------------------------------------------------- |
| `pnpm test`               | Unit tests (required to pass, with coverage thresholds) |
| `pnpm test:int`           | Integration tests against DynamoDB Local                |
| `pnpm test:e2e`           | Playwright end-to-end tests                             |
| `pnpm lint`               | Biome lint and format check                             |
| `pnpm create-plugin <id>` | Scaffold a new plugin with tests                        |
| `pnpm sandbox`            | Deploy a personal stack to your AWS account             |

### Repository layout

```
apps/web            React PWA (student app and /admin console)
apps/api            Hono API, plugin loader, Lambda handlers
packages/core       Domain logic: classes, sessions, bookings, invoices
packages/plugin-sdk definePlugin(), hooks, filters, UI slots, themes, test helpers
packages/i18n       Core translations (en, vi) and translation checks
plugins/            First-party plugins (stringing, gamification, theme-court)
infra/              AWS CDK app (Basic and Advanced setup)
tools/              create-plugin generator
```

### Writing a plugin

```ts
import { definePlugin } from '@racket-club/plugin-sdk';

export default definePlugin({
  id: 'my-plugin',
  name: { en: 'My plugin', vi: 'Plugin của tôi' },
  version: '0.1.0',
  requiresCore: '^0.1.0',
  hooks: {
    'booking.created': async (event, ctx) => {
      ctx.log.info('booked', { sessionId: event.payload.sessionId });
    },
  },
});
```

Then add it to `racket-club.config.ts`. Themes are plugins with a `theme` field; see
`plugins/theme-court`.

## Licence

MIT. Plugins may use any licence their authors choose.
