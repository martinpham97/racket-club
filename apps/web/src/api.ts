import { currentIdToken } from './auth/cognito';
import type { AppConfig } from './config';

/** A failed API call; `body` carries details such as the fields to fix. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { error?: string; fields?: string[]; message?: string },
  ) {
    super(body.error ?? `Request failed (${status})`);
  }
}

let config: AppConfig | null = null;
export function configureApi(c: AppConfig) {
  config = c;
}

/**
 * Fetch wrapper for /api. Local dev (mock auth) sends the chosen mock user; in AWS it sends the
 * Cognito ID token, which API Gateway verifies before the request reaches the API.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (config?.auth.mode === 'cognito') {
    const token = await currentIdToken(config);
    if (token) headers.set('authorization', `Bearer ${token}`);
  } else {
    const mock = sessionStorage.getItem('rc.mockUser');
    if (mock) headers.set('x-mock-user', mock);
  }
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
  return (await res.json()) as T;
}
