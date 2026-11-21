/**
 * The short form a student fills in on first sign-in (docs/design.md, "Student sign-up").
 * Juniors (under 18) sign in themselves; their guardian's details are required.
 */
export const SKILL_LEVELS = ['beginner', 'improver', 'intermediate', 'advanced'] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export interface Contact {
  name: string;
  phone: string;
}

export interface Onboarding {
  name: string;
  phone: string;
  skillLevel: SkillLevel;
  locale: 'en' | 'vi';
  emergencyContact: Contact;
  junior: boolean;
  guardian: (Contact & { email: string }) | null;
}

/** Field paths that failed, e.g. `guardian.email`; the UI turns them into messages. */
export type OnboardingResult =
  | { kind: 'valid'; value: Onboarding }
  | { kind: 'invalid'; fields: string[] };

const text = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null;

/** Digits with optional +, spaces, dashes and brackets: local and international numbers. */
const phone = (v: unknown) => {
  const s = text(v, 30);
  if (!s || !/^\+?[\d\s()-]+$/.test(s)) return null;
  const digits = s.replace(/\D/g, '').length;
  return digits >= 6 && digits <= 15 ? s : null;
};

const email = (v: unknown) => {
  const s = text(v, 254);
  return s && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : null;
};

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

export function parseOnboarding(input: unknown): OnboardingResult {
  const i = record(input);
  const fields: string[] = [];
  const need = <T>(path: string, value: T | null): T => {
    if (value === null) fields.push(path);
    return value as T;
  };

  const ec = record(i.emergencyContact);
  const junior = i.junior === true;
  const g = record(i.guardian);
  const value: Onboarding = {
    name: need('name', text(i.name, 80)),
    phone: need('phone', phone(i.phone)),
    skillLevel: need(
      'skillLevel',
      SKILL_LEVELS.includes(i.skillLevel as SkillLevel) ? (i.skillLevel as SkillLevel) : null,
    ),
    locale: need('locale', i.locale === 'en' || i.locale === 'vi' ? i.locale : null),
    emergencyContact: {
      name: need('emergencyContact.name', text(ec.name, 80)),
      phone: need('emergencyContact.phone', phone(ec.phone)),
    },
    junior,
    guardian: junior
      ? {
          name: need('guardian.name', text(g.name, 80)),
          phone: need('guardian.phone', phone(g.phone)),
          email: need('guardian.email', email(g.email)),
        }
      : null,
  };
  return fields.length ? { kind: 'invalid', fields } : { kind: 'valid', value };
}
