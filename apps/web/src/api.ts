/**
 * Fetch wrapper for /api. In local dev (mock auth) it sends the chosen mock user;
 * in AWS it will send the Cognito access token (added with the real sign-in flow in Phase 0).
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  const mock = sessionStorage.getItem('rc.mockUser');
  if (mock) headers.set('x-mock-user', mock);
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}
