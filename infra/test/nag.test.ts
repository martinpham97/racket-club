import { App, Validations } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';
import { RacketClubStack } from '../lib/racket-club-stack';

/**
 * cdk-nag's AWS Solutions rules on the whole stack. A new finding fails this test: fix it, or
 * acknowledge it next to the resource in racket-club-stack.ts with the reason (see "cdk-nag").
 */
function synthWithNag(): string | null {
  const app = new App();
  new RacketClubStack(app, 'Nag', {
    lambdaCode: lambda.Code.fromInline('exports.handler = async () => ({})'),
  });
  Validations.of(app).addPlugins(new AwsSolutionsChecks(app));
  try {
    app.synth();
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

describe('cdk-nag (AwsSolutions)', () => {
  it('has no findings that are neither fixed nor acknowledged with a reason', () => {
    const report = synthWithNag();
    // Only the findings themselves, so a failure lists exactly what to fix or justify.
    const findings = (report ?? '')
      .split('\n')
      .filter((l) => /Acknowledge with|^ERROR|^\s+Nag\//.test(l))
      .join('\n');
    expect(findings).toBe('');
    expect(report).toBeNull();
  }, 60_000);
});
