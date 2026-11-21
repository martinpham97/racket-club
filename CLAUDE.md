# Racket Club: guide for Claude Code

Racket Club is a free, MIT-licensed, self-hosted booking app for badminton coaches. Each coach
deploys their own copy into their own AWS account with one click. Everything beyond the core is
a plugin. The full design is in `docs/design.md`; the current work plan is `docs/phase-0.md`.
When the design and this file disagree, ask before choosing.

## Commands

```bash
pnpm install
pnpm dev            # web (5173) + API (8787, mock auth) + DynamoDB Local (Docker)
pnpm test           # unit tests: must pass, coverage thresholds enforced
pnpm test:int       # integration tests (needs `pnpm db:up`)
pnpm test:e2e       # Playwright
pnpm typecheck && pnpm lint
pnpm create-plugin <id> [--theme]
pnpm sandbox        # deploy RacketClub-$USER to the dev AWS account
```

Before saying a task is done: `pnpm lint && pnpm typecheck && pnpm test` all pass, plus
`pnpm test:int` / `pnpm test:e2e` when you touched the API, data layer or UI.

## Layout

```
apps/web            React PWA: student app and /admin console
apps/api            Hono app; same code runs on Node locally and on Lambda
packages/core       Pure domain logic (no I/O): bookings, invoices, money, branding, events
packages/plugin-sdk definePlugin(), PluginRegistry, themes, testing helpers
packages/i18n       en + vi strings and translation checks
plugins/*           First-party plugins (stringing, gamification, theme-court)
infra               AWS CDK; one stack per coach; Basic vs Advanced via CloudFormation conditions
tools/create-plugin Plugin generator
racket-club.config.ts  Which plugins are compiled into a deployment
```

## Rules that matter

**Architecture**

- Serverless only: Lambda, API Gateway HTTP API, DynamoDB (single table, on-demand), S3 +
  CloudFront, Cognito, EventBridge, SQS, Scheduler. No servers, containers, NAT gateways or
  anything with a fixed monthly cost in the Basic setup. Basic must stay around US$1/month for
  100 students; anything that costs money goes behind `SetupMode=Advanced`.
- One `api` Lambda (modular monolith). Split out a function only for webhooks, the notifier,
  workers or slow jobs.
- `packages/core` stays pure: no AWS SDK, no `fetch`, no `Date.now()`. I/O lives in `apps/api`.

**Data**

- Every key starts with the tenant (`T#default`); plugins only write under `P#<pluginId>#`.
- Every class, session and invoice has a `coachId` (the owner for now; multi-coach is a future plugin).
- Money is integer cents + currency (`money(2350, 'AUD')`). Never floats.
- Times are UTC ISO strings in storage; display in the coach's timezone (default Australia/Sydney).
- Capacity and coin balances are enforced with DynamoDB conditional transactions, never read-then-write.
- Ledgers (payments, XP/coins) are append-only and idempotent by source id.
- The table and uploads bucket are `RemovalPolicy.RETAIN`. Never change that.

**Time and tests**

- Inject time with `Clock` (`fixedClock()` in tests). Never call `new Date()` in domain logic.
- Unit tests sit next to the code as `*.test.ts`; integration tests are `*.int.test.ts`.
- Coverage thresholds: 80% lines for core and plugin-sdk, 70% for plugins. Don't lower them.
- No test calls real Google, Stripe, Meta or SMS. Use recorded fixtures.
- Integration tests and `pnpm dev` talk to AWS Emulator via `AWS_ENDPOINT_URL` (never real AWS).
  Create resources in test setup with the SDK, not CloudFormation. The emulator does not enforce
  IAM, so never treat a passing emulator test as proof a permission is right: cdk-nag and the
  sandbox deploy cover that. If an operation returns 501, record it in `docs/testing.md` and
  test that path against the sandbox instead of mocking around it.
- A bug fix comes with a test that fails without the fix.

**Plugins**

- Plugins reach core only through `PluginContext` (`ctx.store`, `ctx.notify`, `ctx.emit`,
  `ctx.clock`, `ctx.settings`), gated by the manifest's `permissions`.
- `hooks` are for core events (typed payloads); `on` is for other plugins' events (`'stringing.order.created'`).
- Hooks must be idempotent and must never throw into the caller: a failing hook can't fail a booking.
- Every plugin ships `en` and `vi` translations with identical keys, and tests.
- Don't add plugin-specific code to core. If a plugin needs something, add an extension point
  (hook, filter, slot) to the SDK, with tests.

**UI, themes and language**

- Styles use theme tokens only (`var(--rc-color-primary)` etc.). No hard-coded colours, fonts or radii.
- Themes are plugins (`theme` field). Coach colour overrides must pass WCAG AA (checked in `resolveTheme`).
- No user-facing string in code: use i18next keys, add both `en` and `vi`, ICU format for plurals.
- The app name is configurable. "Racket Club" is only the default; never hard-code it in UI text.
- Basic setup notifies by Web Push plus the in-app inbox only. Email/SMS/WhatsApp are Advanced or plugins.

**Security and privacy**

- Every API route declares its roles with `requireRole(...)`; students only see their own records.
- `AUTH_MODE=mock` is for local dev only; the CDK stack always sets `cognito`.
- Secrets go in SSM SecureString parameters, never in env files committed to git or in code.
- Juniors (under 18) sign in themselves; guardian details are captured at onboarding; juniors are
  hidden from leaderboards.

## Style

- TypeScript strict, ESM, Biome formatting (single quotes, 2 spaces, 100 columns).
- Small pure functions with discriminated-union results (`{ kind: 'booked' } | { kind: 'rejected', reason }`)
  rather than throwing for expected outcomes.
- Comments explain why, not what.
- Commit messages: imperative mood, one change per PR, link the task id from `docs/phase-0.md`.
