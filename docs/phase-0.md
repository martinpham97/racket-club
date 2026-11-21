# Phase 0: Foundations

**Gate to leave Phase 0:** a clean AWS account deploys Racket Club from the Launch Stack button,
and `pnpm dev` runs the whole app locally in one command.

Work top to bottom; each task is one pull request. A task is done only when its "Done when"
items are all true and CI is green.

## Done already (scaffold)

- [x] Monorepo, pnpm workspaces, Biome, Vitest projects (unit / integration), CI workflow, MIT licence
- [x] `packages/core`: booking and waitlist rules, invoices with part payments, money, branding, clock, events
- [x] `packages/plugin-sdk`: `definePlugin`, `PluginRegistry` (hooks, `on`, filters, slots), themes with contrast checks, test helpers
- [x] `packages/i18n`: en + vi core strings, missing-key and placeholder checks
- [x] Plugins: stringing, gamification (ledger, levels, shop, chicken/cat/dog spec), theme-court
- [x] `tools/create-plugin`
- [x] API, web shell and CDK stack written, with tests (not yet run: see task 0.1)

## Tasks

### 0.1 Install and make everything green

- Run `pnpm install`; update package versions if any don't resolve (`pnpm up --latest`).
- Fix whatever fails in `apps/api`, `apps/web` and `infra` (that code was written without being run).
- Add `pnpm-lock.yaml`.

**Done when:** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` pass locally and in CI;
`pnpm dev` shows the app at http://localhost:5173 with mock sign-in and the language switcher working.

### 0.2 GitHub setup

- Public repo, `main` protected: PRs need the `check`, `integration` and `e2e` jobs to pass.
- Issue templates (bug, feature, plugin idea), `CONTRIBUTING.md` (dev setup, plugin guide, test rules).

**Done when:** a PR that breaks a unit test cannot be merged.

### 0.3a Local AWS with AWS Emulator

- Install AWS Emulator (Linux: the .deb/.rpm package; macOS/Windows: build the Docker image from the
  Dockerfile in its docs; no ready-made image is published). Pin the version in CI.
- `pnpm aws:up` starts it and waits on `/__admin/health`; `pnpm dev` and `pnpm test:int` set
  `AWS_ENDPOINT_URL=https://127.0.0.1:9297` and use the emulator's generated credentials, with real
  AWS credentials unset.
- A test-setup script creates the table (with GSIs and streams), event bus, queues and buckets
  through the SDK (not CloudFormation, which the emulator supports least well).
- Keep DynamoDB Local in `docker-compose.yml` as a fallback until every integration test passes on the emulator.
- Start `docs/testing.md`: what runs on the emulator, and any operation that returned 501 Not
  Implemented with the sandbox test that covers it instead.

**Done when:** `pnpm test:int` passes against the emulator locally and in CI, and a DynamoDB write
reaches an SQS queue through the stream and EventBridge path.

### 0.3 Data layer (DynamoDB)

- Table access with ElectroDB entities for settings, users, classes, sessions, bookings, invoices.
- `dynamoSettingsStore` replacing `memorySettingsStore` when `TABLE_NAME` is set.
- Plugin `ctx.store` backed by DynamoDB under `P#<pluginId>#`.
- Idempotency store (conditional put on `IDEMP#<key>`).
- Booking transaction: increment `booked` with condition `booked < capacity` + write booking.
- `pnpm seed`: demo coach, 20 students, a term of classes, some bookings and invoices.

**Done when:** integration tests prove 20 parallel bookings for the last spot never overbook, a
retried event is handled once, and plugin data can't be read outside its namespace.

### 0.4 Domain events and plugin dispatch

- DynamoDB stream to EventBridge publisher; `worker` Lambda calls `PluginRegistry.dispatch` with SQS retries and a dead-letter queue.
- Local dev: in-process bus with the same behaviour.

**Done when:** an integration test books a session locally and the gamification plugin's hook runs exactly once.

### 0.5 Real sign-in

- Cognito managed login with authorisation code + PKCE in the web app; tokens sent by `api.ts`.
- Post-confirmation trigger: create the `USER` record, add to `student` group, set locale from the Google profile.
- Setup wizard step "Google sign-in": shows the redirect URL, takes client ID and secret, a Lambda configures the Cognito Google provider. Email sign-up works until then.

**Done when:** in the sandbox stack, a new Google account signs up, lands on onboarding, and appears as a student; the coach signs in with the emailed temporary password and MFA.

### 0.6 Sandbox deploy

- `pnpm sandbox` deploys `RacketClub-$USER`; fix what real AWS surfaces.
- cdk-nag added to the infra tests; fix or justify every finding.

**Done when:** the sandbox app works end to end over HTTPS, and `pnpm test` includes cdk-nag with no unexplained suppressions.

### 0.7 Release pipeline and Launch Stack

- Public release buckets (start with `ap-southeast-2`), versioned prefixes.
- On a git tag: build web, bundle Lambdas, `pnpm synth:release`, upload assets and the template, publish the quick-create link in the release notes and README.
- Nightly job: deploy the latest template into a clean sandbox account, run a smoke test (setup wizard loads, sign-in works), delete the stack.

**Done when:** someone who has never seen the code deploys from the README link into a fresh account and reaches the setup wizard. That is the Phase 0 gate.

## Not in Phase 0

Bookings UI, attendance, payments screens, notifications, setup wizard beyond sign-in: all Phase 1.
