import type { DomainEvent } from '@racket-club/core';
import { PluginDefinitionError, satisfiesCore } from './define';
import type {
  FilterMap,
  FilterName,
  PluginContext,
  PluginDefinition,
  UiComponent,
  UiSlot,
} from './types';

/** Records which (plugin, event id) pairs were handled, so a retried event never runs twice. */
export interface IdempotencyStore {
  claim(key: string): Promise<boolean>; // true if this is the first claim
  /** Undo a claim whose handler failed, so the next delivery runs it again. */
  release(key: string): Promise<void>;
}

export type ContextFactory = (plugin: PluginDefinition<unknown>) => PluginContext<unknown>;

export interface HookFailure {
  pluginId: string;
  eventId: string;
  error: unknown;
}

// biome-ignore lint/suspicious/noExplicitAny: plugins carry their own settings types
type AnyPlugin = PluginDefinition<any>;

/**
 * Holds the plugins compiled into this deployment and which ones the coach has switched on.
 * Installed-but-inactive plugins contribute nothing: no hooks, filters, slots or theme.
 */
export class PluginRegistry {
  private readonly plugins = new Map<string, AnyPlugin>();
  private readonly active = new Set<string>();

  constructor(
    plugins: AnyPlugin[],
    private readonly coreVersion: string,
  ) {
    for (const p of plugins) {
      if (this.plugins.has(p.id)) throw new PluginDefinitionError(p.id, 'installed twice');
      if (!satisfiesCore(p.requiresCore, coreVersion)) {
        throw new PluginDefinitionError(
          p.id,
          `requires core ${p.requiresCore}, but this is core ${coreVersion}`,
        );
      }
      this.plugins.set(p.id, p);
    }
    for (const p of plugins) {
      for (const dep of p.dependsOn ?? []) {
        if (!this.plugins.has(dep))
          throw new PluginDefinitionError(p.id, `depends on missing plugin "${dep}"`);
      }
    }
  }

  installed(): AnyPlugin[] {
    return [...this.plugins.values()];
  }

  isActive(id: string): boolean {
    return this.active.has(id);
  }

  activate(id: string): void {
    const p = this.require(id);
    for (const dep of p.dependsOn ?? []) {
      if (!this.active.has(dep)) throw new PluginDefinitionError(id, `activate "${dep}" first`);
    }
    this.active.add(id);
  }

  deactivate(id: string): void {
    this.require(id);
    const dependents = this.activePlugins().filter((p) => p.dependsOn?.includes(id));
    if (dependents.length > 0) {
      throw new PluginDefinitionError(
        id,
        `still needed by ${dependents.map((p) => p.id).join(', ')}`,
      );
    }
    this.active.delete(id);
  }

  activePlugins(): AnyPlugin[] {
    return this.installed().filter((p) => this.active.has(p.id));
  }

  /**
   * Run every active plugin's hook for an event. A failing hook is reported, never thrown,
   * so it can't fail the student's booking. Each (plugin, event) pair succeeds at most once:
   * a failed hook gives its claim back, so the queue's next delivery retries just that hook.
   */
  async dispatch(
    event: DomainEvent,
    makeContext: ContextFactory,
    idempotency: IdempotencyStore,
  ): Promise<HookFailure[]> {
    const failures: HookFailure[] = [];
    for (const plugin of this.activePlugins()) {
      const handler = ((plugin.hooks as Record<string, unknown> | undefined)?.[event.name] ??
        (plugin.on as Record<string, unknown> | undefined)?.[event.name]) as
        | ((e: DomainEvent, c: PluginContext<unknown>) => Promise<void>)
        | undefined;
      if (!handler) continue;
      const key = `${plugin.id}#${event.id}`;
      if (!(await idempotency.claim(key))) continue;
      try {
        await handler(event, makeContext(plugin));
      } catch (error) {
        failures.push({ pluginId: plugin.id, eventId: event.id, error });
        await idempotency.release(key);
      }
    }
    return failures;
  }

  /** Pass a value through every active plugin's filter, lowest priority first. */
  applyFilters<K extends FilterName>(
    name: K,
    value: FilterMap[K],
    makeContext: ContextFactory,
  ): FilterMap[K] {
    const regs = this.activePlugins()
      .map((p) => ({ p, reg: p.filters?.[name] }))
      .filter((x): x is { p: AnyPlugin; reg: NonNullable<typeof x.reg> } => x.reg !== undefined)
      .sort((a, b) => (a.reg.priority ?? 10) - (b.reg.priority ?? 10));
    return regs.reduce(
      (acc, { p, reg }) =>
        (reg.apply as (v: FilterMap[K], c: PluginContext<unknown>) => FilterMap[K])(
          acc,
          makeContext(p),
        ),
      value,
    );
  }

  /** Components that active plugins put into a named UI slot. */
  slot(
    name: UiSlot,
    area: 'student' | 'admin',
  ): Array<{ pluginId: string; component: UiComponent }> {
    return this.activePlugins().flatMap((p) => {
      const component = p.ui?.[area]?.slots?.[name];
      return component ? [{ pluginId: p.id, component }] : [];
    });
  }

  /** Installed plugins that are themes (a theme is usable once its plugin is active). */
  themes(): AnyPlugin[] {
    return this.activePlugins().filter((p) => p.theme !== undefined);
  }

  private require(id: string): AnyPlugin {
    const p = this.plugins.get(id);
    if (!p) throw new PluginDefinitionError(id, 'not installed');
    return p;
  }
}
