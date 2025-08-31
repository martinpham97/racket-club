import { vi } from "vitest";

export const indexedOperations = vi.fn(() => ({
  paginate: vi.fn(),
  unique: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
}));

export const createMockCtx = <T>(overrides: Partial<T> = {}): T => {
  return {
    db: {
      insert: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      get: vi.fn(),
      query: vi.fn(() => ({
        withIndex: vi.fn(() => ({
          paginate: vi.fn(),
          unique: vi.fn(),
          order: vi.fn(() => ({
            paginate: vi.fn(),
          })),
          eq: indexedOperations,
          gte: indexedOperations,
          lte: indexedOperations,
        })),
      })),
    },
    auth: {
      getUserIdentity: vi.fn(),
    },
    scheduler: {
      runAfter: vi.fn(),
      runAt: vi.fn(),
    },
    ...overrides,
  } as unknown as T;
};
