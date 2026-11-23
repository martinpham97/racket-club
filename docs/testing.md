# Testing

| Layer       | Command         | Runs against                                     | Where             |
| ----------- | --------------- | ------------------------------------------------ | ----------------- |
| Unit        | `pnpm test`     | Pure code, no I/O (coverage thresholds enforced) | Local, CI `check` |
| Integration | `pnpm test:int` | [AWS Emulator](#aws-emulator) (`*.int.test.ts`)  | Local, CI         |
| End-to-end  | `pnpm test:e2e` | Web app + API with mock sign-in (Playwright)     | Local, CI         |
| Infra       | `pnpm test`     | CDK template assertions (`infra/test`)           | Local, CI `check` |
| Real AWS    | `pnpm sandbox`  | A personal stack in the dev account (task 0.6)   | Manual, nightly   |

## AWS Emulator

[AWS Emulator](https://docs.aws.amazon.com/emulator/latest/userguide/what-is-service.html) serves
AWS APIs over HTTPS on `127.0.0.1:9297`. It backs `pnpm dev` and `pnpm test:int`.

- **Version**: pinned in `tools/aws-emulator/VERSION` and used by both the local Docker image and
  CI. Upgrade on purpose: change the file, run `pnpm aws:down && pnpm aws:up`, run the
  integration tests.
- **Local (macOS, Windows)**: `pnpm aws:up` builds `tools/aws-emulator/Dockerfile` on first use
  (AWS publishes no image), starts it on `127.0.0.1:9297` and waits on `/__admin/health`.
  `pnpm aws:down` stops it. State lives in memory only: restarting gives an empty account.
- **CI and Linux**: the pinned `.deb`/`.rpm`, run natively (see `.github/workflows/ci.yml`).
- **Environment**: `pnpm aws:env -- <command>` runs a command against the emulator. `pnpm dev`
  and `pnpm test:int` use it. It sets `AWS_ENDPOINT_URL`, the emulator's per-run keys, region
  `us-east-1` and `NODE_EXTRA_CA_CERTS` (the certificate is new on every start), and removes
  `AWS_PROFILE`/session variables and the real `~/.aws` files from view. Don't put `AWS_*`
  variables in `.env`.
- **Resources**: `apps/api/src/local-aws.ts` creates the table (keys, GSIs, stream as in
  the CDK stack), event bus, queues and uploads bucket through the SDK, before every integration
  run. Keep it in step with `infra/lib/racket-club-stack.ts`. CloudFormation is not used locally;
  it is the emulator's weakest area.
- **Guard**: integration helpers throw unless `AWS_ENDPOINT_URL` is `127.0.0.1` or `localhost`.

### What it covers

- `apps/api/src/testing/event-path.int.test.ts`: DynamoDB put/get and a `gsi1` query; the event
  path: a table write appears on the DynamoDB stream (`INSERT` with the new image), is published
  with `PutEvents` (the test plays the publisher Lambda from task 0.4), and an EventBridge rule
  delivers it to SQS.
- `apps/api/src/data/bookings.int.test.ts`: 20 parallel bookings for the last seat give exactly
  one booking; 20 parallel bookings for an empty 5-seat session give exactly five; a double tap
  books once; cancelled and missing sessions take no seat. Removing the `booked < capacity`
  condition makes the first two fail.
- `apps/api/src/data/idempotency.int.test.ts`: an event delivered again, in sequence and five at
  once, runs each plugin's hook once; claims carry a TTL.
- `apps/api/src/data/plugin-store.int.test.ts`: a plugin can't read another plugin's records
  (whatever key it asks for, including prefix tricks), nor its own in another tenant.
- `apps/api/src/data/settings-store.int.test.ts` and `apps/api/src/seed-data.int.test.ts`.

- `apps/api/src/events/pipeline.int.test.ts` (task 0.4): a booking is read from the stream,
  published twice (a retried Lambda batch), routed by an EventBridge rule to SQS, and each copy
  is processed twice (redelivery); the real gamification hook runs exactly once and its ledger
  has one entry. With idempotency switched off the hook runs four times and the test fails.
  Also: a failed hook is retried on redelivery (and only that hook), and a plugin can't emit
  events outside its own name.

- `apps/api/src/sign-in.int.test.ts` (task 0.5): the user store creates a record once even when
  the sign-up trigger and `/api/me` race, and saves onboarding (a guardian only for juniors); the
  post-confirmation trigger creates the student and adds them to the `student` group (run twice,
  as Cognito may); Google setup creates the identity provider, adds Google to the app client
  while keeping its other settings, stores the secret as a SecureString, and puts Google back
  after a simulated stack update. All of it runs on the emulator's Cognito and SSM.

### Sign-in: what only the sandbox proves

Real Google, Cognito managed login (the pages, MFA setup, the code-for-token exchange) and API
Gateway's JWT check don't run locally: `pnpm dev` and e2e use mock sign-in. They are task 0.5's
done-when, checked in the sandbox stack: a new Google account signs up, lands on onboarding and
appears as a student; the coach signs in with the emailed temporary password and sets up MFA.
The web app's PKCE helpers are unit-tested (`apps/web/src/auth/pkce.test.ts`).

### E2E and the Vite cache

`apps/web/vite.config.ts` lists the app's dependencies in `optimizeDeps.include`. Without it,
Vite discovers them during the first page load, re-bundles and reloads the page, and on a cold
cache (every CI run, or after a lockfile change) tests lost half-filled forms or saw a blank
page: two cold runs without it failed 2 and 3 tests; three cold runs with it passed every test.
Add new browser dependencies there too.

### Domain events locally

The emulator doesn't run our Lambdas, so `pnpm dev` runs a local event loop
(`apps/api/src/events/local-loop.ts`): it polls the table's stream and the worker queue and calls
the same `publishStreamRecords` and `processQueueMessage` the Lambdas call. The bus, the rule
(`racket-club-local-worker`, every `racket-club.*` source), the queue policy and the
dead-letter queue (after five receives) are real emulator resources, so redelivery behaves as in
AWS. `pnpm seed` with `pnpm dev` running gives every seeded booking its gamification reward.

### Lambda bundles

`cdk synth` bundles each function as an ES module with the AWS SDK included, and a banner that
defines `require` for the CommonJS dependencies. Without the banner every function failed on
load (`Dynamic require of "node:https" is not supported`); without bundling the SDK they ran on
the runtime's SDK version rather than the tested one.

`pnpm --filter @racket-club/infra check:bundles` (also in CI's `check` job) synthesizes the stack
and loads every Lambda bundle in Node, checking each exports `handler`. Removing the banner makes
it fail on all five bundles with exactly that error.

### cdk-nag

`infra/test/nag.test.ts` runs cdk-nag's AWS Solutions rules on the stack and fails on any finding
that is neither fixed nor acknowledged. Acknowledgements live next to the resources at the end of
`infra/lib/racket-club-stack.ts`, each with its reason: mostly things that cost money every month
(WAF, access logs, Cognito Plus) and so belong behind `SetupMode=Advanced`, the three public
routes, standard CDK grants, and functions CDK itself creates. cdk-nag v3 acknowledges through
CDK's `Validations.of(construct).acknowledge()`; for IAM4/IAM5 use the granular ids it prints.

**Not proven here:** real DynamoDB cancels concurrent transactions on one item with
`TransactionConflict`; `bookSeat` retries those with backoff. Whether the emulator produces that
code under contention isn't known, so the retry path gets its proof from the sandbox (task 0.6).

### Emulator behaviour to know

- **SQS queue URLs look real** (`https://sqs.us-east-1.amazonaws.com/000000000000/<name>`). The
  SDK's default is to send SQS calls to the queue URL's host, which is real AWS. Always create
  SQS clients with `useQueueUrlAsEndpoint: false` locally (`localClients()` does). Found when a
  first run sent one request, with throwaway emulator keys, to real AWS, which rejected it.
- **Resource policies are enforced**: EventBridge does not deliver to an SQS queue unless the
  queue policy allows `events.amazonaws.com` to `sqs:SendMessage`, as in AWS. The emulator logs
  `an EventBridge delivery was withheld` and `NO_PERMISSIONS` when it is missing. IAM identity
  policies are not evaluated, so a passing test never proves a Lambda's permissions: cdk-nag and
  the sandbox deploy cover that.
- **S3 needs path-style addressing** (`forcePathStyle: true`).
- **Unimplemented operations** return HTTP 501 `NotImplemented`.

### Operations that returned 501 Not Implemented

None so far. When one does: note it here with the operation, the emulator version, and the
sandbox test that covers that path instead. Don't mock around it.

| Operation | Emulator version | Covered instead by |
| --------- | ---------------- | ------------------ |
