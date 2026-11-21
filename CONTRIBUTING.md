# Contributing to Racket Club

Thanks for helping. Racket Club is MIT-licensed; by contributing you agree your work is released
under the same licence. The design is in [`docs/design.md`](docs/design.md) and the current
work plan in [`docs/phase-0.md`](docs/phase-0.md).

## Dev setup

Requirements: Node.js 22+, pnpm 10+ (`corepack enable` installs the pinned version), Docker.

```bash
pnpm install
cp .env.example .env
pnpm dev            # web on :5173, API on :8787 (mock sign-in), AWS Emulator in Docker
```

Open http://localhost:5173 and pick a mock user to sign in. If port 8787 is taken, set
`API_PORT` in `.env`; the API, the Vite proxy and Playwright all follow it. If port 8000 is
taken (another DynamoDB Local, say), set `DYNAMODB_PORT` and `DYNAMODB_ENDPOINT` in `.env`.

| Command                   | What it does                                                 |
| ------------------------- | ------------------------------------------------------------ |
| `pnpm lint`               | Biome lint and format check (`pnpm format` fixes formatting) |
| `pnpm typecheck`          | TypeScript across the workspace                              |
| `pnpm test`               | Unit tests                                                   |
| `pnpm test:coverage`      | Unit tests with coverage thresholds (what CI runs)           |
| `pnpm test:int`           | Integration tests against AWS Emulator (`pnpm aws:up` first) |
| `pnpm test:e2e`           | Playwright end-to-end tests (see below for the first run)    |
| `pnpm create-plugin <id>` | Scaffold a plugin with translations and tests                |

Before the first e2e run, install the browser:
`pnpm --filter @racket-club/web exec playwright install chromium`.

## Pull requests

- One change per PR. Link the task id from `docs/phase-0.md` (or the issue) in the description.
- Commit messages in the imperative mood ("Add waitlist promotion", not "Added...").
- `main` is protected: the `check`, `integration` and `e2e` CI jobs must pass before merging.
- Before opening a PR, run `pnpm lint && pnpm typecheck && pnpm test`, plus `pnpm test:int` and
  `pnpm test:e2e` if you touched the API, data layer or UI.

## Test rules

- Unit tests sit next to the code as `*.test.ts`; integration tests are `*.int.test.ts`.
- Coverage thresholds: 80% lines for `packages/core` and `packages/plugin-sdk`, 70% for plugins.
  Don't lower them.
- A bug fix comes with a test that fails without the fix.
- Inject time with `Clock` (`fixedClock()` in tests). Domain code never calls `new Date()`.
- Tests never call real Google, Stripe, Meta or SMS APIs: use recorded fixtures.
- Integration tests run against local emulators, never a real AWS account. A passing emulator
  test doesn't prove an IAM permission is right; cdk-nag and the sandbox deploy cover that.

## Code rules

- TypeScript strict, ESM, Biome formatting (single quotes, 2 spaces, 100 columns).
- `packages/core` is pure: no AWS SDK, no `fetch`, no clock reads. I/O lives in `apps/api`.
- Money is integer cents plus currency (`money(2350, 'AUD')`), never floats.
- Prefer small pure functions returning discriminated unions over throwing for expected outcomes.
- No user-facing strings in code: add i18next keys in both `en` and `vi`.
- Styles use theme tokens (`var(--rc-color-primary)`), never hard-coded colours, fonts or radii.
- Never hard-code "Racket Club" in UI text: each coach sets their own app name.
- Every API route declares its roles with `requireRole(...)`.
- No secrets in code or committed files; they go in SSM SecureString parameters.
- Anything with a monthly AWS cost goes behind `SetupMode=Advanced`.

## Writing a plugin

```bash
pnpm create-plugin my-plugin          # add --theme for a theme plugin
```

This creates `plugins/my-plugin` with a manifest, `en` and `vi` translations and tests. Then:

1. Add it to `racket-club.config.ts` to compile it into a deployment. Coaches switch it on in
   Admin > Plugins.
2. Reach the app only through `PluginContext` (`ctx.store`, `ctx.notify`, `ctx.emit`,
   `ctx.clock`, `ctx.settings`), and declare what you use in the manifest's `permissions`.
3. Use `hooks` for core events (`'booking.created'`) and `on` for other plugins' events
   (`'stringing.order.created'`).
4. Hooks must be idempotent and must never throw into the caller: a failing hook can't fail a
   booking.
5. Plugin data lives under its own `P#<pluginId>#` keys.
6. Ship `en` and `vi` translations with identical keys, and tests (70% line coverage).

If your plugin needs something the SDK doesn't offer, propose an extension point (hook, filter
or UI slot) in the SDK, with tests, rather than adding plugin-specific code to core. The
**Plugin idea** issue template is a good place to start.

Themes are plugins with a `theme` field; see `plugins/theme-court`. Colour overrides must pass
WCAG AA contrast, which `resolveTheme` checks.
