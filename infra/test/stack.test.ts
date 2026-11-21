import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { describe, expect, it } from 'vitest';
import { RacketClubStack } from '../lib/racket-club-stack';

const template = Template.fromStack(
  new RacketClubStack(new App(), 'Test', {
    lambdaCode: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 })'),
  }),
);

describe('deploy form', () => {
  it('asks for app name, coach email and setup mode', () => {
    template.hasParameter('AppName', { Default: 'Racket Club' });
    template.hasParameter('CoachEmail', {});
    template.hasParameter('SetupMode', { AllowedValues: ['Basic', 'Advanced'], Default: 'Basic' });
  });
});

describe('data safety', () => {
  it('keeps the table and uploads when the stack is deleted', () => {
    template.hasResource('AWS::DynamoDB::GlobalTable', { DeletionPolicy: 'Retain' });
    template.hasResource('AWS::S3::Bucket', {
      DeletionPolicy: 'Retain',
      Properties: Match.objectLike({
        PublicAccessBlockConfiguration: Match.objectLike({ BlockPublicAcls: true }),
      }),
    });
  });

  it('expires idempotency claims through TTL on expiresAt', () => {
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
    });
  });

  it('has point-in-time recovery on', () => {
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      Replicas: Match.arrayWith([
        Match.objectLike({
          PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
        }),
      ]),
    });
  });
});

describe('auth', () => {
  it('creates owner, staff and student groups and puts the coach in owner', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolGroup', 3);
    template.hasResourceProperties('AWS::Cognito::UserPoolUserToGroupAttachment', {
      GroupName: 'owner',
    });
  });

  it('requires MFA (authenticator app) for password accounts', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      MfaConfiguration: 'ON',
      EnabledMfas: ['SOFTWARE_TOKEN_MFA'],
    });
  });

  it('runs the sign-up trigger after confirmation', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      LambdaConfig: { PostConfirmation: Match.anyValue() },
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'cognito-idp:AdminAddUserToGroup' }),
        ]),
      },
    });
  });

  it('gives the managed login pages their branding', () => {
    template.hasResourceProperties('AWS::Cognito::ManagedLoginBranding', {
      UseCognitoProvidedValues: true,
    });
  });

  it('lets the API configure Google only for this pool and its own parameters', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['cognito-idp:UpdateUserPoolClient']),
            Resource: { 'Fn::GetAtt': [Match.stringLikeRegexp('^Users'), 'Arn'] },
          }),
          Match.objectLike({
            Action: ['ssm:GetParameters', 'ssm:PutParameter'],
            // Exactly the two parameters, not a wildcard.
            Resource: [
              Match.objectLike({
                'Fn::Join': Match.arrayWith([
                  Match.arrayWith([Match.stringLikeRegexp('/google/client-id$')]),
                ]),
              }),
              Match.objectLike({
                'Fn::Join': Match.arrayWith([
                  Match.arrayWith([Match.stringLikeRegexp('/google/client-secret$')]),
                ]),
              }),
            ],
          }),
        ]),
      },
    });
  });

  it('re-applies Google sign-in on every deploy, after the app client', () => {
    const [id, resource] = Object.entries(
      template.findResources('AWS::CloudFormation::CustomResource'),
    )[0] as [string, { DependsOn?: string[] }];
    expect(id).toMatch(/^ReapplyGoogleSignIn/);
    expect(resource.DependsOn?.some((d) => d.startsWith('UsersWebClient'))).toBe(true);
  });

  it('protects every API route except health, config and theme', () => {
    const routes = template.findResources('AWS::ApiGatewayV2::Route');
    const open = Object.values(routes)
      .filter((r) => !(r as { Properties: { AuthorizerId?: unknown } }).Properties.AuthorizerId)
      .map((r) => (r as { Properties: { RouteKey: string } }).Properties.RouteKey)
      .sort();
    expect(open).toEqual(['GET /api/config', 'GET /api/health', 'GET /api/theme.css']);
  });
});

describe('hosting', () => {
  it('rewrites SPA paths on the web behaviour only, never API errors', () => {
    template.resourceCountIs('AWS::CloudFront::Function', 1);
    const dist = Object.values(template.findResources('AWS::CloudFront::Distribution'))[0] as {
      Properties: { DistributionConfig: { CustomErrorResponses?: unknown } };
    };
    expect(dist.Properties.DistributionConfig.CustomErrorResponses).toBe(undefined);
  });
});

describe('domain events', () => {
  it('publishes the table stream to the bus, retrying and keeping failed batches', () => {
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      EventSourceArn: Match.objectLike({ 'Fn::GetAtt': Match.arrayWith(['StreamArn']) }),
      StartingPosition: 'LATEST',
      BisectBatchOnFunctionError: true,
      MaximumRetryAttempts: 10,
      DestinationConfig: { OnFailure: { Destination: Match.anyValue() } },
    });
  });

  it('routes every racket-club.* event to the worker queue', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: { source: [{ prefix: 'racket-club.' }] },
      Targets: Match.arrayWith([Match.objectLike({ Arn: Match.anyValue() })]),
    });
  });

  it('retries a message five times, then keeps it in a dead-letter queue', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      RedrivePolicy: Match.objectLike({ maxReceiveCount: 5 }),
      VisibilityTimeout: 180,
    });
  });

  it('lets the worker report single failed messages instead of retrying the batch', () => {
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      FunctionResponseTypes: ['ReportBatchItemFailures'],
    });
  });
});

describe('Basic vs Advanced', () => {
  it('only creates alarms and alert topics in Advanced', () => {
    const alarms = Object.values(template.findResources('AWS::CloudWatch::Alarm'));
    expect(alarms.length).toBeGreaterThanOrEqual(2);
    for (const alarm of alarms) {
      expect((alarm as { Condition?: string }).Condition).toBe('IsAdvanced');
    }
    template.hasResource('AWS::SNS::Topic', { Condition: 'IsAdvanced' });
  });
});
