import type { Clock, CoreEventMap, DomainEvent } from '@racket-club/core';
import type { ThemeDefinition } from './theme';

export type Locale = 'en' | 'vi';
export type LocalizedText = Record<Locale, string>;

/** Anything with a `parse` method works, e.g. a Zod schema. */
export interface SettingsSchema<T> {
  parse(input: unknown): T;
}

export type Permission =
  | 'users:read'
  | 'bookings:read'
  | 'bookings:write'
  | 'payments:create-invoice'
  | 'payments:read'
  | 'notifications:send'
  | 'events:emit';

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

/** Key-value store scoped to the plugin's own key namespace (P#<pluginId>#...). */
export interface PluginStore {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface OutboundMessage {
  type: string; // e.g. 'stringing.ready'
  title: LocalizedText | string;
  body: LocalizedText | string;
  url?: string;
  urgent?: boolean;
}

export interface PluginContext<S = unknown> {
  pluginId: string;
  tenantId: string;
  settings: S;
  clock: Clock;
  log: Logger;
  store: PluginStore;
  /** Throws if the plugin did not declare the permission in its manifest. */
  notify(userId: string, message: OutboundMessage): Promise<void>;
  emit(name: string, payload: unknown): Promise<void>;
}

export type CoreEventName = keyof CoreEventMap;

/** Handler for a core event: the payload is fully typed. */
export type ActionHandler<N extends CoreEventName, S> = (
  event: DomainEvent<N, CoreEventMap[N]>,
  ctx: PluginContext<S>,
) => Promise<void>;

/** Handler for an event emitted by another plugin, e.g. 'stringing.order.created'. */
export type PluginEventHandler<S> = (
  event: DomainEvent<string, unknown>,
  ctx: PluginContext<S>,
) => Promise<void>;

export interface FilterMap {
  'booking.price': { cents: number; sessionId: string; userId: string };
  'profile.tabs': Array<{ id: string; labelKey: string }>;
  'admin.dashboard.cards': Array<{ id: string; labelKey: string }>;
  'notification.content': OutboundMessage;
}

export type FilterName = keyof FilterMap;

export interface FilterRegistration<K extends FilterName, S> {
  priority?: number; // lower runs first, default 10
  apply: (value: FilterMap[K], ctx: PluginContext<S>) => FilterMap[K];
}

/** Named UI slots in the React app. Values are React components (kept untyped here so the SDK has no React dependency). */
export type UiSlot =
  | 'profile.tab'
  | 'session.card.footer'
  | 'admin.menu'
  | 'dashboard.widget'
  | 'home.banner';

export type UiComponent = unknown;

export interface PluginUi {
  student?: { routes?: () => Promise<unknown>; slots?: Partial<Record<UiSlot, UiComponent>> };
  admin?: {
    routes?: () => Promise<unknown>;
    menu?: { labelKey: string; icon: string };
    slots?: Partial<Record<UiSlot, UiComponent>>;
  };
}

export interface ScheduledJob<S> {
  /** EventBridge Scheduler expression, e.g. 'cron(0 8 * * ? *)' */
  schedule: string;
  run(ctx: PluginContext<S>): Promise<void>;
}

export interface Migration<S> {
  id: string;
  up(ctx: PluginContext<S>): Promise<void>;
}

export interface PluginDefinition<S = Record<string, never>> {
  id: string;
  name: LocalizedText;
  description?: LocalizedText;
  version: string;
  /** Semver range of core this plugin works with, e.g. '^0.1.0' */
  requiresCore: string;
  dependsOn?: string[];
  permissions?: Permission[];
  settings?: SettingsSchema<S>;
  /** Mounted at /api/p/<id>. Receives the framework router (Hono in apps/api). */
  routes?: (router: unknown) => void;
  /** Core domain events (typed payloads). */
  hooks?: { [N in CoreEventName]?: ActionHandler<N, S> };
  /** Events emitted by other plugins, keyed '<pluginId>.<event>'. */
  on?: Record<`${string}.${string}`, PluginEventHandler<S>>;
  filters?: { [K in FilterName]?: FilterRegistration<K, S> };
  ui?: PluginUi;
  /** A theme plugin restyles the whole app; see theme.ts */
  theme?: ThemeDefinition;
  i18n?: Partial<Record<Locale, () => Promise<Record<string, unknown>>>>;
  jobs?: Record<string, ScheduledJob<S>>;
  migrations?: Migration<S>[];
}
