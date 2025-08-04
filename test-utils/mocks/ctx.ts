import { vi } from "vitest";

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
          eq: vi.fn(),
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
