import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Aws,
  CfnCondition,
  CfnOutput,
  CfnParameter,
  type CfnResource,
  CustomResource,
  Duration,
  Fn,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource, SqsDlq, SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cr from 'aws-cdk-lib/custom-resources';
import type { Construct } from 'constructs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

export interface RacketClubStackProps extends StackProps {
  /** Tests pass inline code for every function to avoid bundling; deploys bundle apps/api. */
  lambdaCode?: lambda.Code;
}

/**
 * One stack per coach. Basic setup = core only (near-zero cost).
 * Advanced setup adds monitoring and alerting now; SES, SMS, WAF and backups follow.
 */
export class RacketClubStack extends Stack {
  constructor(scope: Construct, id: string, props: RacketClubStackProps = {}) {
    super(scope, id, props);

    // ---- Deploy form (CloudFormation parameters) ---------------------------------
    const appName = new CfnParameter(this, 'AppName', {
      type: 'String',
      default: 'Racket Club',
      minLength: 1,
      maxLength: 40,
      description: 'The name your students see. You can change it later in the app.',
    });
    const coachEmail = new CfnParameter(this, 'CoachEmail', {
      type: 'String',
      allowedPattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
      constraintDescription: 'Must be an email address',
      description: 'Your email. Your admin login and temporary password are sent here.',
    });
    const setupMode = new CfnParameter(this, 'SetupMode', {
      type: 'String',
      allowedValues: ['Basic', 'Advanced'],
      default: 'Basic',
      description: 'Basic: core app, about US$1/month. Advanced: adds monitoring and alerts.',
    });
    const alertEmail = new CfnParameter(this, 'AlertEmail', {
      type: 'String',
      default: '',
      description: 'Advanced only: where error alerts are sent (leave empty to use CoachEmail).',
    });

    const isAdvanced = new CfnCondition(this, 'IsAdvanced', {
      expression: Fn.conditionEquals(setupMode.valueAsString, 'Advanced'),
    });
    this.templateOptions.metadata = {
      'AWS::CloudFormation::Interface': {
        ParameterGroups: [
          { Label: { default: 'Your app' }, Parameters: ['AppName', 'CoachEmail'] },
          { Label: { default: 'Setup' }, Parameters: ['SetupMode', 'AlertEmail'] },
        ],
      },
    };

    // ---- Data -----------------------------------------------------------------------
    const table = new dynamodb.TableV2(this, 'Table', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      dynamoStream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      timeToLiveAttribute: 'expiresAt', // idempotency claims expire
      removalPolicy: RemovalPolicy.RETAIN, // deleting the app never deletes student data
      globalSecondaryIndexes: [
        {
          indexName: 'gsi1',
          partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
        },
        {
          indexName: 'gsi2',
          partitionKey: { name: 'gsi2pk', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'gsi2sk', type: dynamodb.AttributeType.STRING },
        },
      ],
    });

    const uploads = new s3.Bucket(this, 'Uploads', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const bus = new events.EventBus(this, 'Bus');

    // ---- Auth -------------------------------------------------------------------------
    const userPool = new cognito.UserPool(this, 'Users', {
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: true, // email sign-up is the fallback until Google is configured
      signInAliases: { email: true },
      autoVerify: { email: true },
      // Required, because managed login only offers MFA setup when it is: the coach and staff
      // must use it (docs/design.md). It applies to password accounts only; Cognito doesn't
      // apply MFA to Google sign-ins, so it only affects students using the email fallback.
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: { sms: false, otp: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    for (const group of ['owner', 'staff', 'student']) {
      new cognito.CfnUserPoolGroup(this, `Group-${group}`, {
        userPoolId: userPool.userPoolId,
        groupName: group,
      });
    }
    const ownerUser = new cognito.CfnUserPoolUser(this, 'OwnerUser', {
      userPoolId: userPool.userPoolId,
      username: coachEmail.valueAsString,
      desiredDeliveryMediums: ['EMAIL'],
      userAttributes: [
        { name: 'email', value: coachEmail.valueAsString },
        { name: 'email_verified', value: 'true' },
      ],
    });
    const ownerGroup = new cognito.CfnUserPoolUserToGroupAttachment(this, 'OwnerIsOwner', {
      userPoolId: userPool.userPoolId,
      groupName: 'owner',
      username: coachEmail.valueAsString,
    });
    ownerGroup.addResourceDependency(ownerUser);
    ownerGroup.addResourceDependency(this.node.findChild('Group-owner') as CfnResource);

    // ---- Web hosting --------------------------------------------------------------
    const web = new s3.Bucket(this, 'Web', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ---- API ------------------------------------------------------------------------
    const lambdaFn = (id: string, entry: string, timeout: Duration) => {
      const common = {
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 512,
        timeout,
      };
      return props.lambdaCode
        ? new lambda.Function(this, id, {
            ...common,
            handler: 'index.handler',
            code: props.lambdaCode,
          })
        : new NodejsFunction(this, id, {
            ...common,
            entry: join(repoRoot, 'apps/api/src', entry),
            bundling: {
              format: OutputFormat.ESM,
              minify: true,
              sourceMap: true,
              // Bundle the AWS SDK too: the runtime's copy is a different version from the one tested.
              externalModules: [],
              // CommonJS dependencies call require(), which an ES module lacks; without this the
              // function fails on load ("Dynamic require of node:https is not supported").
              banner:
                "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
            },
          });
    };
    const apiFn = lambdaFn('Api', 'lambda.ts', Duration.seconds(10));
    table.grantReadWriteData(apiFn);
    uploads.grantReadWrite(apiFn);
    bus.grantPutEventsTo(apiFn);

    // ---- Domain events: table stream -> publisher -> bus -> rule -> queue -> worker ----------
    // Free at this scale (Lambda reading its own stream, SQS and EventBridge free tiers).
    const publisher = lambdaFn('Publisher', 'lambda-publisher.ts', Duration.seconds(30));
    const streamFailures = new sqs.Queue(this, 'StreamFailures', {
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });
    publisher.addEventSource(
      new DynamoEventSource(table, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 100,
        bisectBatchOnError: true,
        retryAttempts: 10,
        onFailure: new SqsDlq(streamFailures),
      }),
    );
    bus.grantPutEventsTo(publisher);

    const workerTimeout = Duration.seconds(30);
    const deadLetters = new sqs.Queue(this, 'WorkerDeadLetters', {
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });
    const workQueue = new sqs.Queue(this, 'WorkerQueue', {
      // AWS recommends six times the function timeout for a queue that feeds a Lambda.
      visibilityTimeout: Duration.seconds(workerTimeout.toSeconds() * 6),
      deadLetterQueue: { queue: deadLetters, maxReceiveCount: 5 },
      enforceSSL: true,
    });
    new events.Rule(this, 'EventsToWorker', {
      eventBus: bus,
      eventPattern: { source: events.Match.prefix('racket-club.') },
      targets: [new targets.SqsQueue(workQueue)],
    });
    const worker = lambdaFn('Worker', 'lambda-worker.ts', workerTimeout);
    worker.addEventSource(
      new SqsEventSource(workQueue, { batchSize: 10, reportBatchItemFailures: true }),
    );
    table.grantReadWriteData(worker); // plugin stores and idempotency claims
    bus.grantPutEventsTo(worker); // plugins emit their own events
    for (const fn of [publisher, worker]) {
      fn.addEnvironment('TABLE_NAME', table.tableName);
      fn.addEnvironment('EVENT_BUS_NAME', bus.eventBusName);
    }

    const httpApi = new HttpApi(this, 'HttpApi', { createDefaultStage: true });
    const integration = new HttpLambdaIntegration('ApiIntegration', apiFn);

    // Single-page app routing for the web behaviour only: paths without a file extension
    // serve index.html. (Distribution-wide error responses would also rewrite API 403/404s.)
    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        "function handler(event) { var r = event.request; if (!r.uri.includes('.')) { r.uri = '/index.html'; } return r; }",
      ),
    });

    const distribution = new cloudfront.Distribution(this, 'Cdn', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(web),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [
          { function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        // Same origin for the API: no CORS, and the PWA works behind one domain.
        '/api/*': {
          origin: new origins.HttpOrigin(
            `${httpApi.apiId}.execute-api.${Aws.REGION}.amazonaws.com`,
          ),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });
    const appUrl = `https://${distribution.distributionDomainName}`;

    const client = userPool.addClient('WebClient', {
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [`${appUrl}/auth/callback`, 'http://localhost:5173/auth/callback'],
        logoutUrls: [appUrl, 'http://localhost:5173'],
      },
    });
    const domain = userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: `rc-${Aws.ACCOUNT_ID}-${Aws.REGION}` },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });
    // The newer managed login shows "login pages unavailable" for a client without branding.
    new cognito.CfnManagedLoginBranding(this, 'LoginBranding', {
      userPoolId: userPool.userPoolId,
      clientId: client.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    // ---- Sign-up: a confirmed account gets its USER record and the student group ----------
    const postConfirmation = lambdaFn(
      'PostConfirmation',
      'lambda-post-confirmation.ts',
      Duration.seconds(10),
    );
    postConfirmation.addEnvironment('TABLE_NAME', table.tableName);
    table.grantReadWriteData(postConfirmation);
    // The pool ARN can't be referenced here: the pool already depends on this function.
    postConfirmation.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cognito-idp:AdminAddUserToGroup'],
        resources: [
          this.formatArn({ service: 'cognito-idp', resource: 'userpool', resourceName: '*' }),
        ],
      }),
    );
    userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, postConfirmation);

    // ---- Setup wizard, Google sign-in (apps/api/src/google-sign-in.ts) -------------------
    const ssmPrefix = `/racket-club/${this.stackName}`;
    const googleParameters = this.formatArn({
      service: 'ssm',
      resource: 'parameter',
      resourceName: `racket-club/${this.stackName}/google/*`,
    });
    const configureGoogle = new iam.PolicyStatement({
      actions: [
        'cognito-idp:DescribeIdentityProvider',
        'cognito-idp:CreateIdentityProvider',
        'cognito-idp:UpdateIdentityProvider',
        'cognito-idp:DescribeUserPoolClient',
        'cognito-idp:UpdateUserPoolClient',
      ],
      resources: [userPool.userPoolArn],
    });
    const googleEnv = {
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT_ID: client.userPoolClientId,
      SSM_PREFIX: ssmPrefix,
    };

    // A stack update resets the app client to email-only sign-in; this puts Google back.
    const reapplyGoogle = lambdaFn(
      'ReapplyGoogle',
      'lambda-reapply-google.ts',
      Duration.seconds(30),
    );
    for (const [k, v] of Object.entries(googleEnv)) reapplyGoogle.addEnvironment(k, v);
    reapplyGoogle.addToRolePolicy(configureGoogle);
    reapplyGoogle.addToRolePolicy(
      new iam.PolicyStatement({ actions: ['ssm:GetParameters'], resources: [googleParameters] }),
    );
    const reapply = new CustomResource(this, 'ReapplyGoogleSignIn', {
      serviceToken: new cr.Provider(this, 'ReapplyGoogleProvider', {
        onEventHandler: reapplyGoogle,
      }).serviceToken,
      // Changes on every synth, so it runs on every deploy (the handler is idempotent).
      properties: { DeployedAt: new Date().toISOString() },
    });
    reapply.node.addDependency(client);

    const authorizer = new HttpJwtAuthorizer(
      'Jwt',
      `https://cognito-idp.${Aws.REGION}.amazonaws.com/${userPool.userPoolId}`,
      { jwtAudience: [client.userPoolClientId] },
    );
    // Public routes (no sign-in): health, config, theme
    for (const path of ['/api/health', '/api/config', '/api/theme.css']) {
      httpApi.addRoutes({ path, methods: [HttpMethod.GET], integration });
    }
    // Everything else requires a valid Cognito token; roles are checked in the app.
    httpApi.addRoutes({
      path: '/api/{proxy+}',
      methods: [HttpMethod.ANY],
      integration,
      authorizer,
    });

    apiFn.addEnvironment('TABLE_NAME', table.tableName);
    apiFn.addEnvironment('UPLOADS_BUCKET', uploads.bucketName);
    apiFn.addEnvironment('EVENT_BUS_NAME', bus.eventBusName);
    apiFn.addEnvironment('APP_NAME', appName.valueAsString);
    apiFn.addEnvironment('AUTH_MODE', 'cognito');
    apiFn.addEnvironment('USER_POOL_CLIENT_ID', client.userPoolClientId);
    apiFn.addEnvironment('COGNITO_DOMAIN', domain.baseUrl());
    for (const [k, v] of Object.entries(googleEnv)) apiFn.addEnvironment(k, v);
    apiFn.addToRolePolicy(configureGoogle);
    apiFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameters', 'ssm:PutParameter'],
        resources: [googleParameters],
      }),
    );

    // Web assets: deployed when apps/web has been built (always true in the release pipeline).
    const webDist = join(repoRoot, 'apps/web/dist');
    if (existsSync(webDist)) {
      new s3deploy.BucketDeployment(this, 'WebDeploy', {
        sources: [s3deploy.Source.asset(webDist)],
        destinationBucket: web,
        distribution,
      });
    }

    // ---- Advanced: monitoring and alerts -------------------------------------------
    const alerts = new sns.Topic(this, 'Alerts');
    (alerts.node.defaultChild as CfnResource).cfnOptions.condition = isAdvanced;
    const subscription = new sns.CfnSubscription(this, 'AlertsEmail', {
      topicArn: alerts.topicArn,
      protocol: 'email',
      endpoint: Fn.conditionIf(
        new CfnCondition(this, 'HasAlertEmail', {
          expression: Fn.conditionNot(Fn.conditionEquals(alertEmail.valueAsString, '')),
        }).logicalId,
        alertEmail.valueAsString,
        coachEmail.valueAsString,
      ).toString(),
    });
    subscription.cfnOptions.condition = isAdvanced;

    const errors = new cloudwatch.Alarm(this, 'ApiErrors', {
      metric: apiFn.metricErrors({ period: Duration.minutes(5) }),
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: 'The Racket Club API is failing',
    });
    const cfnAlarm = errors.node.defaultChild as cloudwatch.CfnAlarm;
    cfnAlarm.cfnOptions.condition = isAdvanced;
    cfnAlarm.alarmActions = [alerts.topicArn];

    const deadLettered = new cloudwatch.Alarm(this, 'EventsDeadLettered', {
      metric: deadLetters.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'A plugin hook keeps failing: events are waiting in the dead-letter queue',
    });
    const cfnDeadLettered = deadLettered.node.defaultChild as cloudwatch.CfnAlarm;
    cfnDeadLettered.cfnOptions.condition = isAdvanced;
    cfnDeadLettered.alarmActions = [alerts.topicArn];

    // ---- Outputs ----------------------------------------------------------------------
    new CfnOutput(this, 'AppUrl', { value: appUrl, description: 'Open this to finish setup' });
    new CfnOutput(this, 'GoogleRedirectUrl', {
      value: `${domain.baseUrl()}/oauth2/idpresponse`,
      description: 'Paste this into Google Cloud Console when the setup wizard asks',
    });
  }
}
