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
- **Resources**: `apps/api/src/testing/local-aws.ts` creates the table (keys, GSIs, stream as in
  the CDK stack), event bus, queues and uploads bucket through the SDK, before every integration
  run. Keep it in step with `infra/lib/racket-club-stack.ts`. CloudFormation is not used locally;
  it is the emulator's weakest area.
- **Guard**: integration helpers throw unless `AWS_ENDPOINT_URL` is `127.0.0.1` or `localhost`.

### What it covers

`apps/api/src/testing/event-path.int.test.ts`:

- DynamoDB put/get and a query on `gsi1`.
- The event path: a table write appears on the DynamoDB stream (`INSERT` with the new image), is
  published to the event bus with `PutEvents` (the test plays the publisher Lambda from task 0.4),
  and an EventBridge rule delivers it to an SQS queue.

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

## DynamoDB Local (fallback)

`docker-compose.yml` still has DynamoDB Local (`pnpm db:up`, port from `DYNAMODB_PORT`) until
every integration test passes on the emulator. Nothing uses it by default.
