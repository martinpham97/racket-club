import { describe, expect, it } from 'vitest';
import { parseOnboarding } from './onboarding';

const adult = {
  name: '  Linh Nguyen ',
  phone: '0412 345 678',
  skillLevel: 'improver',
  locale: 'vi',
  emergencyContact: { name: 'Minh Nguyen', phone: '+61 412 000 111' },
  junior: false,
};

describe('parseOnboarding', () => {
  it('accepts an adult and trims what they typed', () => {
    expect(parseOnboarding(adult)).toEqual({
      kind: 'valid',
      value: {
        name: 'Linh Nguyen',
        phone: '0412 345 678',
        skillLevel: 'improver',
        locale: 'vi',
        emergencyContact: { name: 'Minh Nguyen', phone: '+61 412 000 111' },
        junior: false,
        guardian: null,
      },
    });
  });

  it('ignores guardian details for adults', () => {
    const r = parseOnboarding({ ...adult, guardian: { name: 'x' } });
    expect(r.kind === 'valid' && r.value.guardian).toBe(null);
  });

  it('requires a guardian with a phone and email for juniors', () => {
    expect(parseOnboarding({ ...adult, junior: true })).toEqual({
      kind: 'invalid',
      fields: ['guardian.name', 'guardian.phone', 'guardian.email'],
    });
    const ok = parseOnboarding({
      ...adult,
      junior: true,
      guardian: { name: 'Hoa Nguyen', phone: '(02) 9876 5432', email: 'hoa@example.com' },
    });
    expect(ok.kind === 'valid' && ok.value.guardian).toEqual({
      name: 'Hoa Nguyen',
      phone: '(02) 9876 5432',
      email: 'hoa@example.com',
    });
  });

  it('names every field that is missing or wrong', () => {
    expect(parseOnboarding({ phone: 'call me', skillLevel: 'pro', locale: 'fr' })).toEqual({
      kind: 'invalid',
      fields: [
        'name',
        'phone',
        'skillLevel',
        'locale',
        'emergencyContact.name',
        'emergencyContact.phone',
      ],
    });
    expect(parseOnboarding(null).kind).toBe('invalid');
    expect(parseOnboarding({ ...adult, phone: '12345' })).toMatchObject({ fields: ['phone'] });
    expect(parseOnboarding({ ...adult, name: 'x'.repeat(81) })).toMatchObject({ fields: ['name'] });
  });
});
