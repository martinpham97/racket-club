import {
  Aws,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  Validations,
} from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

export interface ReleaseStackProps extends StackProps {
  /** owner/name of the GitHub repo whose version tags may publish. */
  repo: string;
}

/**
 * Where releases live: the public bucket the Launch Stack template and its Lambda bundles are
 * read from (`racket-club-releases-<region>`, the name bin/racket-club.ts builds releases for),
 * and the role GitHub Actions assumes to publish into it. One per region we release to.
 */
export class ReleaseStack extends Stack {
  constructor(scope: Construct, id: string, props: ReleaseStackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'Releases', {
      bucketName: `racket-club-releases-${Aws.REGION}`,
      // Public read through the bucket policy only; ACLs stay off.
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Every coach's stack loads its Lambda code from here, on each update and rollback:
      // deleting a release would break their installs.
      removalPolicy: RemovalPolicy.RETAIN,
    });
    // Anyone may download a release (CloudFormation fetches templates and code as the coach).
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'PublicRead',
        principals: [new iam.AnyPrincipal()],
        actions: ['s3:GetObject'],
        resources: [bucket.arnForObjects('*')],
      }),
    );

    const github = new iam.OidcProviderNative(this, 'GitHub', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });
    const publisher = new iam.Role(this, 'Publisher', {
      roleName: `racket-club-release-publisher-${Aws.REGION}`,
      description: 'Assumed by the release workflow on version tags to upload a release',
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(github.oidcProviderArn, {
        StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
        // Only workflows running for a version tag of this repo; branches and forks can't.
        StringLike: {
          'token.actions.githubusercontent.com:sub': `repo:${props.repo}:ref:refs/tags/v*`,
        },
      }),
    });
    // Upload only: no delete, so a compromised run can't remove releases coaches depend on.
    bucket.grantPut(publisher);
    bucket.grantRead(publisher);

    Validations.of(bucket).acknowledge({
      id: 'AwsSolutions::AwsSolutions-S2',
      reason:
        'Public on purpose: coaches deploy from it with one click. Read-only (s3:GetObject) through the bucket policy; ACLs stay blocked.',
    });
    Validations.of(bucket).acknowledge({
      id: 'AwsSolutions::AwsSolutions-S1',
      reason:
        'Server access logs need a second bucket; downloads of public release files need no audit.',
    });
    Validations.of(publisher).acknowledge(
      ...[
        'Action::s3:GetObject*',
        'Action::s3:GetBucket*',
        'Action::s3:List*',
        'Action::s3:Abort*',
        'Resource::<ReleasesE6BA3EBF.Arn>/*',
      ].map((f) => ({
        id: `AwsSolutions::AwsSolutions-IAM5[${f}]`,
        reason:
          'Read and upload any object of this release bucket only (bucket.grantPut/grantRead).',
      })),
    );

    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'PublisherRoleArn', {
      value: publisher.roleArn,
      description: 'Set as the RELEASE_ROLE_ARN variable of the GitHub repository',
    });
  }
}
