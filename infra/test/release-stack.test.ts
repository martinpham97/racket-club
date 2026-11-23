import { App, Validations } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';
import { ReleaseStack } from '../lib/release-stack';

const make = () => {
  const app = new App();
  const stack = new ReleaseStack(app, 'Releases', { repo: 'martinpham97/racket-club' });
  return { app, stack, template: Template.fromStack(stack) };
};

describe('release stack', () => {
  const { template } = make();

  it('keeps releases when the stack is deleted, and serves them publicly read-only', () => {
    template.hasResource('AWS::S3::Bucket', {
      DeletionPolicy: 'Retain',
      Properties: Match.objectLike({
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: false,
          RestrictPublicBuckets: false,
        },
      }),
    });
    const policy = Object.values(template.findResources('AWS::S3::BucketPolicy'))[0] as {
      Properties: { PolicyDocument: { Statement: Array<Record<string, unknown>> } };
    };
    const publicStatements = policy.Properties.PolicyDocument.Statement.filter(
      (s) => s.Effect === 'Allow' && JSON.stringify(s.Principal) === '{"AWS":"*"}',
    );
    expect(publicStatements.map((s) => s.Action)).toEqual(['s3:GetObject']);
  });

  it('lets only version tags of the repo publish, through GitHub OIDC', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
              StringLike: {
                'token.actions.githubusercontent.com:sub':
                  'repo:martinpham97/racket-club:ref:refs/tags/v*',
              },
            },
          }),
        ],
      },
    });
  });

  it('never lets the publisher delete a release', () => {
    expect(JSON.stringify(template.findResources('AWS::IAM::Policy'))).not.toMatch(
      /s3:DeleteObject/,
    );
  });

  it('passes cdk-nag (AwsSolutions)', () => {
    const app = new App();
    new ReleaseStack(app, 'Releases', { repo: 'martinpham97/racket-club' });
    Validations.of(app).addPlugins(new AwsSolutionsChecks(app));
    expect(() => app.synth()).not.toThrow();
  });
});
