import { describe, expect, it } from 'vitest';
import { sandboxName, sandboxStackName } from '../bin/sandbox';

describe('sandboxName', () => {
  it('uses SANDBOX_NAME, then USER (macOS, Linux), then USERNAME (Windows)', () => {
    expect(sandboxName({ SANDBOX_NAME: 'demo', USER: 'u', USERNAME: 'w' })).toBe('demo');
    expect(sandboxName({ USER: 'martin', USERNAME: 'w' })).toBe('martin');
    expect(sandboxName({ USERNAME: 'tutin' })).toBe('tutin');
    expect(sandboxName({})).toBeNull();
  });

  it('makes a valid stack name and lowercase Cognito domain prefix', () => {
    expect(sandboxName({ USERNAME: 'Martin Pham.97' })).toBe('martin-pham-97');
    expect(sandboxName({ USER: '__' })).toBeNull();
    expect(sandboxName({ USER: 'a'.repeat(40) })).toHaveLength(20);
    expect(sandboxStackName('tutin')).toBe('RacketClub-tutin');
  });
});
