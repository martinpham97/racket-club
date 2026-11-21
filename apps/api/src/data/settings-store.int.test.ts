import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { localNames } from '../local-aws';
import { createDb } from './client';
import { dynamoSettingsStore } from './settings-store';

const { data } = createDb(localNames.table);
const tenant = () => `test-${randomUUID()}`;

describe('dynamoSettingsStore', () => {
  it('starts from the defaults and keeps what the coach saves', async () => {
    const store = dynamoSettingsStore(data, { activePlugins: ['stringing'] });
    const t = tenant();
    expect(await store.getBranding(t)).toBeUndefined();
    expect(await store.getActivePlugins(t)).toEqual(['stringing']);

    await store.saveBranding(t, { appName: 'Smash Academy' });
    await store.saveBranding(t, { activeThemeId: 'theme-court' });
    await store.setActivePlugins(t, ['gamification']);

    expect(await store.getBranding(t)).toEqual({
      appName: 'Smash Academy',
      activeThemeId: 'theme-court',
    });
    expect(await store.getActivePlugins(t)).toEqual(['gamification']);
  });

  it('keeps tenants apart', async () => {
    const store = dynamoSettingsStore(data);
    const [a, b] = [tenant(), tenant()];
    await store.saveBranding(a, { appName: 'Coach A' });
    expect(await store.getBranding(b)).toBeUndefined();
  });
});
