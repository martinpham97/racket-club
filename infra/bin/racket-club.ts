import { App, Aws, CliCredentialsStackSynthesizer } from 'aws-cdk-lib';
import { RacketClubStack } from '../lib/racket-club-stack';
import { sandboxName, sandboxStackName } from './sandbox';

const app = new App();
const release = app.node.tryGetContext('release') === 'true';
const version = process.env.RELEASE_VERSION ?? '0.1.0';

// Release build: the template behind the "Launch Stack" button. Lambda code and web assets
// point at the project's public release bucket, so coaches never need `cdk bootstrap`.
const synthesizer = release
  ? new CliCredentialsStackSynthesizer({
      // biome-ignore lint/suspicious/noTemplateCurlyInString: CDK substitutes ${AWS::Region} at deploy time
      fileAssetsBucketName: 'racket-club-releases-${AWS::Region}',
      bucketPrefix: `v${version}/`,
    })
  : undefined;

new RacketClubStack(app, 'RacketClub', {
  synthesizer,
  description: `Racket Club ${version}: badminton class booking (https://github.com/racket-club/racket-club)`,
});

// Developer sandbox stacks: `pnpm sandbox` deploys RacketClub-<your name> (see sandbox.ts).
const sandbox = sandboxName(process.env);
if (sandbox && !release) {
  new RacketClubStack(app, sandboxStackName(sandbox), {
    // Cognito domain prefixes are unique per region; a sandbox must not take the one a real
    // install in the same account would use.
    authDomainPrefix: `rc-${sandbox}-${Aws.ACCOUNT_ID}`,
  });
}
