/**
 * Personal sandbox stacks for developers: `RacketClub-<name>`, where the name comes from
 * SANDBOX_NAME, or the login name (USER on macOS/Linux, USERNAME on Windows).
 */
export function sandboxName(env: Record<string, string | undefined>): string | null {
  const raw = env.SANDBOX_NAME ?? env.USER ?? env.USERNAME ?? '';
  // Stack names allow letters, digits and hyphens; the Cognito domain prefix needs lowercase.
  const name = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  return name || null;
}

export const sandboxStackName = (name: string) => `RacketClub-${name}`;
