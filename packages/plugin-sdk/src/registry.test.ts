import { describe, expect, it } from 'vitest';
import { definePlugin, PluginDefinitionError, satisfiesCore } from './define';
import { PluginRegistry } from './registry';
import { createTestContext, makeEvent, memoryIdempotencyStore } from './testing';
import type { PluginDefinition } from './types';

const name = { en: 'Test', vi: 'Thử' };
const base = { name, version: '0.1.0', requiresCore: '^0.1.0' } as const;

const ctxFor = (p: PluginDefinition<unknown>) => createTestContext(p);

describe('definePlugin', () => {
  it('accepts a valid manifest', () => {
    expect(definePlugin({ id: 'ok-plugin', ...base }).id).toBe('ok-plugin');
  });

  it.each([
    [{ id: 'Bad_Id', ...base }, /id must be/],
    [{ id: 'no-vi', ...base, name: { en: 'x', vi: '' } }, /"en" and "vi"/],
    [{ id: 'bad-ver', ...base, version: 'one' }, /not semver/],
    [{ id: 'bad-range', ...base, requiresCore: '>=1' }, /requiresCore/],
  ])('rejects an invalid manifest %#', (def, message) => {
    expect(() => definePlugin(def as PluginDefinition)).toThrow(message);
  });
});

describe('satisfiesCore', () => {
  it.each([
    ['^0.1.0', '0.1.5', true],
    ['^0.1.0', '0.2.0', false],
    ['^1.2.0', '1.9.0', true],
    ['^1.2.0', '2.0.0', false],
    ['~1.2.0', '1.2.9', true],
    ['~1.2.0', '1.3.0', false],
    ['1.2.3', '1.2.3', true],
    ['^1.2.3', '1.2.2', false],
  ])('%s with core %s -> %s', (range, core, ok) => {
    expect(satisfiesCore(range, core)).toBe(ok);
  });
});

describe('PluginRegistry', () => {
  it('refuses incompatible core versions, duplicates and missing dependencies', () => {
    expect(() => new PluginRegistry([definePlugin({ id: 'old-one', ...base })], '0.2.0')).toThrow(
      PluginDefinitionError,
    );
    const dup = definePlugin({ id: 'dup', ...base });
    expect(() => new PluginRegistry([dup, dup], '0.1.0')).toThrow(/installed twice/);
    expect(
      () =>
        new PluginRegistry([definePlugin({ id: 'needy', ...base, dependsOn: ['gone'] })], '0.1.0'),
    ).toThrow(/missing plugin/);
  });

  it('enforces dependency order on activate and deactivate', () => {
    const gam = definePlugin({ id: 'gamification', ...base });
    const tourn = definePlugin({ id: 'tournaments', ...base, dependsOn: ['gamification'] });
    const reg = new PluginRegistry([gam, tourn], '0.1.0');
    expect(() => reg.activate('tournaments')).toThrow(/activate "gamification" first/);
    reg.activate('gamification');
    reg.activate('tournaments');
    expect(() => reg.deactivate('gamification')).toThrow(/still needed by tournaments/);
  });

  it('runs hooks only for active plugins, once per event, and isolates failures', async () => {
    const calls: string[] = [];
    const good = definePlugin({
      id: 'good',
      ...base,
      hooks: {
        'booking.created': async (e) => {
          calls.push(`good:${e.payload.sessionId}`);
        },
      },
    });
    const broken = definePlugin({
      id: 'broken',
      ...base,
      hooks: {
        'booking.created': async () => {
          throw new Error('boom');
        },
      },
    });
    const off = definePlugin({
      id: 'off',
      ...base,
      hooks: { 'booking.created': async () => void calls.push('off') },
    });
    const reg = new PluginRegistry([good, broken, off], '0.1.0');
    reg.activate('good');
    reg.activate('broken');

    const idem = memoryIdempotencyStore();
    const evt = makeEvent(
      'booking.created',
      { bookingId: 'b1', sessionId: 's1', userId: 'u1' },
      'e1',
    );
    const failures = await reg.dispatch(evt, ctxFor, idem);
    await reg.dispatch(evt, ctxFor, idem); // retried delivery

    expect(calls).toEqual(['good:s1']);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.pluginId).toBe('broken');
  });

  it('applies filters in priority order', () => {
    const add = definePlugin({
      id: 'add-tab',
      ...base,
      filters: {
        'profile.tabs': { priority: 20, apply: (tabs) => [...tabs, { id: 'b', labelKey: 'b' }] },
      },
    });
    const first = definePlugin({
      id: 'first-tab',
      ...base,
      filters: {
        'profile.tabs': { priority: 1, apply: (tabs) => [...tabs, { id: 'a', labelKey: 'a' }] },
      },
    });
    const reg = new PluginRegistry([add, first], '0.1.0');
    reg.activate('add-tab');
    reg.activate('first-tab');
    const tabs = reg.applyFilters('profile.tabs', [], ctxFor);
    expect(tabs.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('collects UI slots and themes from active plugins only', () => {
    const Tab = () => null;
    const withSlot = definePlugin({
      id: 'slotty',
      ...base,
      ui: { student: { slots: { 'profile.tab': Tab } } },
    });
    const reg = new PluginRegistry([withSlot], '0.1.0');
    expect(reg.slot('profile.tab', 'student')).toEqual([]);
    reg.activate('slotty');
    expect(reg.slot('profile.tab', 'student')).toEqual([{ pluginId: 'slotty', component: Tab }]);
    expect(reg.themes()).toEqual([]);
  });
});

describe('test context', () => {
  it('blocks notifications without the permission', async () => {
    const ctx = createTestContext({ id: 'quiet', permissions: [] });
    await expect(ctx.notify('u1', { type: 't', title: 'x', body: 'y' })).rejects.toThrow(
      /notifications:send/,
    );
  });
});
