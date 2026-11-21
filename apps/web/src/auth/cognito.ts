/**
 * Sign-in with Cognito managed login (authorisation code + PKCE). The ID token is what the API
 * receives: API Gateway checks it against the app client, and it carries the email, name,
 * locale and groups the API reads.
 */
import type { AppConfig } from '../config';
import { authorizeUrl, codeChallenge, jwtExpiry, randomToken } from './pkce';

const PENDING = 'rc.auth.pending'; // sessionStorage: { state, verifier } during the redirect
const REFRESH = 'rc.auth.refresh'; // localStorage: keeps the installed app signed in

type Cognito = { domain: string; clientId: string };

let idToken: string | null = null;

function cognitoOf(config: AppConfig): Cognito {
  const { domain, userPoolClientId } = config.auth;
  if (!domain || !userPoolClientId) throw new Error('Sign-in is not configured');
  return { domain, clientId: userPoolClientId };
}

const redirectUri = () => `${window.location.origin}/auth/callback`;

const store = {
  get: (s: Storage, k: string) => {
    try {
      return s.getItem(k);
    } catch {
      return null;
    }
  },
  set: (s: Storage, k: string, v: string | null) => {
    try {
      if (v === null) s.removeItem(k);
      else s.setItem(k, v);
    } catch {
      // storage unavailable (private mode): sign-in lasts for this page only
    }
  },
};

export async function startSignIn(config: AppConfig, provider?: 'Google') {
  const { domain, clientId } = cognitoOf(config);
  const state = randomToken();
  const verifier = randomToken();
  store.set(sessionStorage, PENDING, JSON.stringify({ state, verifier }));
  const challenge = await codeChallenge(verifier);
  window.location.assign(
    authorizeUrl({ domain, clientId, redirectUri: redirectUri(), state, challenge, provider }),
  );
}

async function tokenRequest(c: Cognito, body: Record<string, string>) {
  const res = await fetch(new URL('/oauth2/token', c.domain), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.clientId, ...body }),
  });
  if (!res.ok) throw new Error(`Sign-in failed (${res.status})`);
  return (await res.json()) as { id_token: string; refresh_token?: string };
}

export type CallbackResult = { kind: 'signed-in' } | { kind: 'failed'; reason: string };

/** On /auth/callback: check the state we sent, then trade the code for tokens. */
export async function completeSignIn(config: AppConfig, url: URL): Promise<CallbackResult> {
  const pending = store.get(sessionStorage, PENDING);
  store.set(sessionStorage, PENDING, null);
  const { state, verifier } = pending ? (JSON.parse(pending) as Record<string, string>) : {};
  const code = url.searchParams.get('code');
  if (url.searchParams.get('error')) {
    return { kind: 'failed', reason: url.searchParams.get('error_description') ?? 'error' };
  }
  // A code we didn't ask for (another tab, or someone else's link) is never used.
  if (!code || !state || !verifier || url.searchParams.get('state') !== state) {
    return { kind: 'failed', reason: 'state' };
  }
  try {
    const tokens = await tokenRequest(cognitoOf(config), {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    });
    idToken = tokens.id_token;
    if (tokens.refresh_token) store.set(localStorage, REFRESH, tokens.refresh_token);
    return { kind: 'signed-in' };
  } catch (err) {
    return { kind: 'failed', reason: (err as Error).message };
  }
}

/** A current ID token, refreshed when it is within a minute of expiring; null if signed out. */
export async function currentIdToken(config: AppConfig): Promise<string | null> {
  if (idToken && jwtExpiry(idToken) - 60 > Date.now() / 1000) return idToken;
  const refresh = store.get(localStorage, REFRESH);
  if (!refresh) return null;
  try {
    const tokens = await tokenRequest(cognitoOf(config), {
      grant_type: 'refresh_token',
      refresh_token: refresh,
    });
    idToken = tokens.id_token;
    return idToken;
  } catch {
    // Revoked or expired: sign in again.
    store.set(localStorage, REFRESH, null);
    idToken = null;
    return null;
  }
}

export function signOut(config: AppConfig) {
  idToken = null;
  store.set(localStorage, REFRESH, null);
  const { domain, clientId } = cognitoOf(config);
  const url = new URL('/logout', domain);
  url.search = new URLSearchParams({
    client_id: clientId,
    logout_uri: window.location.origin,
  }).toString();
  window.location.assign(url.toString());
}
