import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { authorizeUrl, codeChallenge, jwtExpiry, randomToken } from './pkce';

describe('PKCE', () => {
  it('derives the S256 challenge: base64url(SHA-256(verifier)), checked against node:crypto', async () => {
    for (const verifier of ['dBjftJeZ4CVP-mJ92K9QD9oo3kJz87BUjIaoD0hExgs', randomToken()]) {
      const expected = createHash('sha256').update(verifier).digest('base64url');
      expect(await codeChallenge(verifier)).toBe(expected);
    }
  });

  it('makes random, URL-safe verifiers of 43 characters', () => {
    const a = randomToken();
    expect(a).toMatch(/^[\w-]{43}$/);
    expect(randomToken()).not.toBe(a);
  });

  it('builds the Cognito authorize URL, optionally straight to Google', () => {
    const url = new URL(
      authorizeUrl({
        domain: 'https://rc-1.auth.ap-southeast-2.amazoncognito.com',
        clientId: 'abc',
        redirectUri: 'https://app.example/auth/callback',
        state: 'st',
        challenge: 'ch',
        provider: 'Google',
      }),
    );
    expect(url.origin + url.pathname).toBe(
      'https://rc-1.auth.ap-southeast-2.amazoncognito.com/oauth2/authorize',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'abc',
      redirect_uri: 'https://app.example/auth/callback',
      scope: 'openid email profile',
      state: 'st',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
      identity_provider: 'Google',
    });
    const email = new URL(
      authorizeUrl({
        domain: 'https://d',
        clientId: 'c',
        redirectUri: 'r',
        state: 's',
        challenge: 'x',
      }),
    );
    expect(email.searchParams.has('identity_provider')).toBe(false);
  });

  it('reads a JWT expiry, and treats garbage as expired', () => {
    const payload = btoa(JSON.stringify({ exp: 1_796_000_000 })).replace(/=+$/, '');
    expect(jwtExpiry(`h.${payload}.s`)).toBe(1_796_000_000);
    expect(jwtExpiry('not-a-jwt')).toBe(0);
  });
});
