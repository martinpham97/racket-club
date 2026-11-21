import { pickLocale } from '@racket-club/i18n';
import type { MiddlewareHandler } from 'hono';

export type Role = 'owner' | 'staff' | 'student';

export interface AuthUser {
  id: string;
  email: string;
  /** From the token (Google profile) or the mock user; the stored profile can override it. */
  name: string;
  locale: 'en' | 'vi';
  roles: Role[];
}

const nameFromEmail = (email: string) => email.split('@')[0] || email;

export type AuthVariables = { user: AuthUser | null };

/**
 * Local development only: the web app's mock sign-in page sends `x-mock-user`
 * (e.g. {"id":"coach","email":"coach@example.com","roles":["owner"]}). Never enabled in AWS:
 * the CDK stack sets AUTH_MODE=cognito.
 */
export const mockAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const raw = c.req.header('x-mock-user');
  let user: AuthUser | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<AuthUser>;
      if (parsed.id && parsed.email) {
        user = {
          id: parsed.id,
          email: parsed.email,
          name: parsed.name ?? nameFromEmail(parsed.email),
          locale: pickLocale(parsed.locale, 'en'),
          roles: parsed.roles ?? ['student'],
        };
      }
    } catch {
      return c.json({ error: 'bad x-mock-user header' }, 400);
    }
  }
  c.set('user', user);
  await next();
};

interface LambdaEnv {
  event?: {
    requestContext?: {
      authorizer?: { jwt?: { claims?: Record<string, string | undefined> } };
    };
  };
}

/**
 * In AWS, API Gateway's JWT authorizer has already verified the Cognito token;
 * the claims arrive on the Lambda event. Groups map to roles.
 */
export const cognitoAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  // hono/aws-lambda passes { event, requestContext, lambdaContext } as the env; typed loosely
  // here so the same middleware slot accepts mockAuth on Node.
  const claims = (c.env as LambdaEnv | undefined)?.event?.requestContext?.authorizer?.jwt?.claims;
  let user: AuthUser | null = null;
  if (claims?.sub) {
    const groups = (claims['cognito:groups'] ?? '').replace(/^\[|\]$/g, '').split(/[\s,]+/);
    const roles = groups.filter(
      (g): g is Role => g === 'owner' || g === 'staff' || g === 'student',
    );
    const email = claims.email ?? '';
    user = {
      id: claims.sub,
      email,
      name: claims.name ?? nameFromEmail(email),
      // Google sends its profile language (e.g. "vi" or "en-AU") through the `locale` attribute.
      locale: pickLocale(claims.locale, 'en'),
      roles: roles.length ? roles : ['student'],
    };
  }
  c.set('user', user);
  await next();
};

export function requireRole(...allowed: Role[]): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'sign in required' }, 401);
    if (!user.roles.some((r) => allowed.includes(r))) return c.json({ error: 'forbidden' }, 403);
    await next();
  };
}
