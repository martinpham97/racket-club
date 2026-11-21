import type { EntityItem } from 'electrodb';
import type { Role } from '../auth';
import { primaryRole, type UserProfile, type UserStore } from '../users';
import type { DataService } from './entities';

type Row = EntityItem<DataService['entities']['user']>;

function toProfile(row: Row): UserProfile {
  const done = row.onboardedAt && row.phone && row.skillLevel && row.emergencyContact;
  return {
    userId: row.userId,
    email: row.email,
    name: row.name,
    roles: row.roles as Role[],
    locale: row.locale,
    onboarding: done
      ? {
          phone: row.phone as string,
          skillLevel: row.skillLevel as NonNullable<typeof row.skillLevel>,
          emergencyContact: {
            name: row.emergencyContact?.name ?? '',
            phone: row.emergencyContact?.phone ?? '',
          },
          junior: row.junior === true,
          guardian: row.guardian?.name
            ? {
                name: row.guardian.name,
                phone: row.guardian.phone ?? '',
                email: row.guardian.email ?? '',
              }
            : null,
          completedAt: row.onboardedAt as string,
        }
      : null,
  };
}

const isConditionFailure = (err: unknown) =>
  /ConditionalCheckFailed/.test(
    `${(err as { cause?: { name?: string } })?.cause?.name ?? ''} ${String(err)}`,
  );

export function dynamoUserStore(data: DataService): UserStore {
  const users = data.entities.user;
  const get = async (tenantId: string, userId: string) =>
    (await users.get({ tenantId, userId }).go()).data;

  return {
    async ensure(tenantId, u, now) {
      const found = await get(tenantId, u.userId);
      if (found) return toProfile(found);
      try {
        await users
          .create({ tenantId, ...u, primaryRole: primaryRole(u.roles), createdAt: now })
          .go();
      } catch (err) {
        // Two first requests at once (the trigger and /api/me): the other one created it.
        if (!isConditionFailure(err)) throw err;
      }
      const created = await get(tenantId, u.userId);
      if (!created) throw new Error(`User ${u.userId} missing after create`);
      return toProfile(created);
    },

    async completeOnboarding(tenantId, userId, answers, now) {
      const { name, locale, guardian, ...rest } = answers;
      const update = users.patch({ tenantId, userId }).set({
        name,
        locale,
        phone: rest.phone,
        skillLevel: rest.skillLevel,
        emergencyContact: rest.emergencyContact,
        junior: rest.junior,
        onboardedAt: now,
      });
      // A guardian is stored only for juniors; an adult who was marked junior by mistake loses it.
      await (guardian ? update.set({ guardian }) : update.remove(['guardian'])).go();
      const row = await get(tenantId, userId);
      if (!row) throw new Error(`No user ${userId}`);
      return toProfile(row);
    },
  };
}
