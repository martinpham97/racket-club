/** OAuth 2.0 authorisation code flow with PKCE (RFC 7636), for a public client with no secret. */

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** A random value for the code verifier and the state: 32 bytes, 43 characters. */
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** S256 challenge: base64url(SHA-256(verifier)). */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export interface AuthorizeParams {
  domain: string; // https://<prefix>.auth.<region>.amazoncognito.com
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  /** Skip Cognito's own page and go straight to Google. */
  provider?: 'Google';
}

export function authorizeUrl(p: AuthorizeParams): string {
  const url = new URL('/oauth2/authorize', p.domain);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    scope: 'openid email profile',
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    ...(p.provider ? { identity_provider: p.provider } : {}),
  }).toString();
  return url.toString();
}

/** Seconds since epoch at which a JWT expires, or 0 if it can't be read. */
export function jwtExpiry(token: string): number {
  try {
    const payload = token.split('.')[1] ?? '';
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp : 0;
  } catch {
    return 0;
  }
}
