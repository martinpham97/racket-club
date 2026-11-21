import type { Onboarding } from '@racket-club/core';
import type { Role } from './auth';

/** What the app knows about a signed-in person, beyond what their token says. */
export interface UserProfile {
  userId: string;
  email: string;
  name: string;
  roles: Role[];
  locale: 'en' | 'vi';
  onboarding: (Omit<Onboarding, 'name' | 'locale'> & { completedAt: string }) | null;
}

export interface NewUser {
  userId: string;
  email: string;
  name: string;
  roles: Role[];
  locale: 'en' | 'vi';
}

export interface UserStore {
  /**
   * The user's record, created on first sight. Called by the sign-up trigger and by `/api/me`
   * (the coach's account is created at deploy time, so the trigger never runs for it).
   * Idempotent: an existing record is returned unchanged.
   */
  ensure(tenantId: string, user: NewUser, now: string): Promise<UserProfile>;
  completeOnboarding(
    tenantId: string,
    userId: string,
    answers: Onboarding,
    now: string,
  ): Promise<UserProfile>;
}

/** The role a user is listed under: the highest they hold. */
export function primaryRole(roles: Role[]): Role {
  return roles.includes('owner') ? 'owner' : roles.includes('staff') ? 'staff' : 'student';
}

export function memoryUserStore(): UserStore {
  const users = new Map<string, UserProfile>();
  const key = (t: string, id: string) => `${t}#${id}`;
  return {
    async ensure(t, u) {
      const found = users.get(key(t, u.userId));
      if (found) return found;
      const created: UserProfile = { ...u, onboarding: null };
      users.set(key(t, u.userId), created);
      return created;
    },
    async completeOnboarding(t, userId, answers, now) {
      const current = users.get(key(t, userId));
      if (!current) throw new Error(`No user ${userId}`);
      const { name, locale, ...rest } = answers;
      const next: UserProfile = {
        ...current,
        name,
        locale,
        onboarding: { ...rest, completedAt: now },
      };
      users.set(key(t, userId), next);
      return next;
    },
  };
}
