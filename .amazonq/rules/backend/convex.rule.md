# Convex Backend Development Rules

You are working on a Convex backend for a racket sports club management application. Follow these specific rules for consistent, maintainable code.

## File Organization

### Directory Structure

```
convex/
├── service/
│   ├── events/
│   │   ├── functions.ts          # Public API functions
│   │   ├── database.ts           # Database operations
│   │   ├── validators.ts         # Input validation
│   │   ├── helpers/              # Helper functions
│   │   │   ├── scheduling.ts
│   │   │   ├── timeslots.ts
│   │   │   └── __tests__/        # Helper tests
│   │   └── __tests__/            # Function tests
│   ├── users/
│   └── clubs/
├── constants/
└── _generated/
```

### Import Rules

- ALWAYS use `@/convex/...` for imports from convex directory
- Use `./` or `../` ONLY for same directory or subdirectories
- NEVER use `../` to import from upper level directories - use `@/convex/...` instead
- Import types: `import { Id } from "@/convex/_generated/dataModel"`
- Import constants: `import { EVENT_STATUS } from "@/convex/constants/events"`
- Import validators: `import { validateEventAccess } from "@/convex/service/utils/validators/events"`
- Import database functions: `import { getClubOrThrow } from "@/convex/service/clubs/database"`

## Documentation Requirements

### JSDoc for ALL Functions

Every function MUST have JSDoc with:

- Brief description of what it does
- `@param` for each parameter with type and description
- `@returns` with type and description
- `@throws` for error conditions

```typescript
/**
 * Joins a user to an event timeslot with waitlist support
 * @param ctx Mutation context
 * @param eventId ID of the event to join
 * @param timeslotId ID of the specific timeslot
 * @returns Participation record ID
 * @throws {ConvexError} When event is full or user is banned
 */
export const joinEvent = authenticatedMutationWithRLS()({ ... });
```

## Function Implementation Standards

### Convex Function Syntax

ALWAYS use this exact pattern:

```typescript
// Public functions (no authentication required)
export const functionName = publicQuery()({
  args: { clubId: zid("clubs") },
  returns: z.object(withSystemFields("clubs", clubSchema.shape)),
  handler: async (ctx, args) => {
    return await dtoGetClubOrThrow(ctx, args.clubId);
  },
});

// Authenticated query functions
export const functionName = authenticatedQuery()({
  args: {
    userId: zid("users"),
    pagination: convexToZod(paginationOptsValidator),
  },
  returns: paginatedResult(z.object(withSystemFields("clubs", clubSchema.shape))),
  handler: async (ctx, args) => {
    // Implementation here
  },
});

// Authenticated mutation functions
export const functionName = authenticatedMutation()({
  args: {
    clubId: zid("clubs"),
    input: clubUpdateInputSchema,
  },
  returns: z.object(withSystemFields("clubs", clubSchema.shape)),
  handler: async (ctx, args) => {
    const club = await dtoGetClubOrThrow(ctx, args.clubId);
    // Implementation here
  },
});

// Authenticated mutation with profile not required
export const functionName = authenticatedMutation({ profileRequired: false })({
  args: {
    input: userProfileCreateSchema,
  },
  returns: z.object(withSystemFields("userProfiles", userProfileSchema.shape)),
  handler: async (ctx, args) => {
    const { currentUser } = ctx;
    const { input } = args;
    // Implementation here
  },
});
```

### Error Handling Pattern

```typescript
// 1. Import error constants
import { CLUB_NOT_FOUND_ERROR } from "@/convex/constants/errors";

// 2. Create helper functions for common lookups
export const getClubOrThrow = async (ctx: QueryCtx, clubId: Id<"clubs">): Promise<Club> => {
  const club = await ctx.table("clubs").get(clubId);
  if (!club) {
    throw new ConvexError(CLUB_NOT_FOUND_ERROR);
  }
  return club;
};

// 3. Use helper functions in API functions
const club = await getClubOrThrow(ctx, clubId);

// 4. Throw ConvexError with constants for business logic
if (club.numMembers >= club.maxMembers) {
  throw new ConvexError(CLUB_FULL_ERROR);
}
```

### Access Control Pattern

```typescript
// 1. Get resources
const event = await getOrThrow(ctx, eventId);
const club = await getOrThrow(ctx, event.clubId);

// 2. Check permissions
enforceClubOwnershipOrAdmin(ctx, club);
// OR
await validateEventAccess(ctx, event, ctx.currentUser._id);
```

## Testing Requirements

### Test Structure (MANDATORY)

```typescript
// File: convex/service/clubs/__tests__/functions.test.ts
describe("Club Functions", () => {
  let t: ReturnType<typeof convexTest>;
  let userHelpers: UserTestHelpers;
  let clubHelpers: ClubTestHelpers;
  let activityHelpers: ActivityTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    userHelpers = new UserTestHelpers(t);
    clubHelpers = new ClubTestHelpers(t);
    activityHelpers = new ActivityTestHelpers(t);
  });

  it("creates club and adds creator as admin", async () => {
    // 1. Setup real data
    const user = await userHelpers.insertUser();
    const userId = user._id;
    await userHelpers.insertProfile(createTestProfile(userId));

    // 2. Execute function
    const input = createTestClubInput();
    const asUser = t.withIdentity({ subject: userId });
    const club = await asUser.mutation(api.service.clubs.functions.createClub, { input });

    // 3. Verify results
    expect(club).toEqual(
      expect.objectContaining({
        createdBy: userId,
        isApproved: false,
        numMembers: 1,
      }),
    );
  });
});
```

### Testing Scheduled Functions

For functions that use scheduling (mutations/actions with `ctx.scheduler.runAfter` or `ctx.scheduler.runAt`):

```typescript
import { vi } from "vitest";

// Test scheduled mutations/actions
it("schedules event status updates", async () => {
  // Enable fake timers
  vi.useFakeTimers();

  const t = convexTest(schema);

  // Call function that schedules something
  const scheduledFunctionId = await t.mutation(api.service.events.functions.scheduleStatusUpdate, {
    eventId,
    delayMs: 10000,
  });

  // Advance time past scheduled time
  vi.advanceTimersByTime(11000);
  vi.runAllTimers(); // Execute timers
  await t.finishInProgressScheduledFunctions(); // Wait for completion

  // Verify scheduled function succeeded
  const status = await t.run(async (ctx) => {
    return await ctx.db.get(scheduledFunctionId);
  });
  expect(status).toMatchObject({ state: { kind: "success" } });

  vi.useRealTimers();
});

// Test complex scheduling chains with batched generation
it("generates events when series is activated", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1704067200000); // Fixed Monday date

  const t = convexTest(schema);

  // Create event series that schedules batch generation
  const eventSeries = await t.mutation(api.service.events.functions.createEventSeries, {
    input: {
      isActive: true,
      schedule: {
        startDate: Date.now() + TIME_MS.MINUTE,
        endDate: Date.now() + 90 * TIME_MS.DAY,
        daysOfWeek: [1, 2, 3, 4, 5], // Weekdays
        interval: 1,
      },
      // ... other fields
    },
  });

  // Verify initial batch (immediate generation)
  {
    const events = await eventHelpers.listEventsBySeries(eventSeries._id);
    expect(events.length).toBe(10); // 2 weeks × 5 weekdays
  }

  // Advance time and trigger next batch
  vi.advanceTimersByTime(9 * TIME_MS.DAY);
  vi.runAllTimers(); // Execute scheduled functions
  await t.finishInProgressScheduledFunctions(); // Wait for completion

  {
    const events = await eventHelpers.listEventsBySeries(eventSeries._id);
    expect(events.length).toBe(20); // Next batch generated
  }

  // Complete all remaining scheduled functions in chain
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  {
    const events = await eventHelpers.listEventsBySeries(eventSeries._id);
    expect(events.length).toBe(65); // Full series generated
  }

  vi.useRealTimers();
});
```

### Test Sample Pattern

```typescript
// File: test-utils/samples/users.ts
export const createTestProfile = (
  userId: Id<"users">,
  overrides?: Partial<UserProfile>,
): WithoutSystemFields<UserProfile> => {
  return {
    userId,
    firstName: `User ${userId}`,
    lastName: "(Test Generated)",
    isAdmin: false,
    ...overrides,
  };
};

export const generateTestEmail = (prefix = "test"): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}@example.com`;
};

export class UserTestHelpers {
  constructor(private t: ReturnType<typeof convexTest>) {}

  async insertUser(email = generateTestEmail()) {
    return await this.t.runWithCtx((ctx) => ctx.table("users").insert({ email }).get());
  }

  async insertProfile(profile: WithoutSystemFields<UserProfile>) {
    return await this.t.runWithCtx((ctx) => ctx.table("userProfiles").insert(profile).get());
  }

  async getProfile(profileId: Id<"userProfiles">) {
    return await this.t.runWithCtx((ctx) => ctx.table("userProfiles").getX(profileId));
  }
}

// File: test-utils/samples/clubs.ts
export const createTestClub = (
  createdBy: Id<"users">,
  overrides?: Partial<Club>,
): WithoutSystemFields<Club> => {
  return {
    name: `Test Club ${Date.now()}`,
    description: "A test club",
    createdBy,
    isPublic: false,
    isApproved: true,
    maxMembers: 100,
    numMembers: 0,
    ...overrides,
  };
};

export class ClubTestHelpers {
  constructor(private t: ReturnType<typeof convexTest>) {}

  async insertClub(club: WithoutSystemFields<Club>) {
    return await this.t.runWithCtx((ctx) => ctx.table("clubs").insert(club).get());
  }

  async getClubRecord(clubId: Id<"clubs">) {
    return await this.t.runWithCtx((ctx) => ctx.table("clubs").get(clubId));
  }

  async insertMembership(membership: WithoutSystemFields<ClubMembership>) {
    return await this.t.runWithCtx((ctx) => ctx.table("clubMemberships").insert(membership).get());
  }

  async getMembership(membershipId: Id<"clubMemberships">) {
    return await this.t.runWithCtx((ctx) => ctx.table("clubMemberships").get(membershipId));
  }
}
```

### Testing Rules

- NO mocks - use real database operations
- Test both success AND error cases
- Use descriptive test names: "should [action] when [condition]"
- Place tests in `__tests__/` directories

## Code Quality Rules

### Function Design

- Single responsibility per function
- Clear, descriptive names
- Strict TypeScript typing

```typescript
// GOOD: Focused, well-typed function
export const validateEventAccess = async (
  ctx: QueryCtx,
  event: Event,
  userId: Id<"users">,
): Promise<void> => {
  // Single purpose: check if user can access event
};

// BAD: Multiple responsibilities
export const handleEventStuff = async (ctx: any, data: any) => {
  // Validates, creates, sends emails - too much!
};
```

### Helper Functions

- Place in `helpers/` subdirectories
- Document with JSDoc
- Test independently
- Use for reusable logic only

### Security Requirements

- ALWAYS validate inputs with Zod schemas
- Check permissions before database operations
- Use `getOrThrow` for required lookups
- Throw `ConvexError` with meaningful messages

## Database Operations

### Mixed API Pattern (REQUIRED)

```typescript
// For Ents tables (userProfiles, etc.) - use ctx.table()
const profile = await ctx.table("userProfiles").get("userId", userId);
const user = await ctx.table("users").get(userId);
const profile = await user.edge("profile");

// Indexed queries with conditions
const membership = await ctx
  .table("clubMemberships", "userClub", (q) => q.eq("userId", userId).eq("clubId", clubId))
  .unique();

// Paginated queries
const clubs = await ctx
  .table("clubs", "publicApprovedName", (q) => q.eq("isPublic", true).eq("isApproved", true))
  .order("asc")
  .paginate(paginationOpts);

// Creating with Ents
const profile = await ctx
  .table("userProfiles")
  .insert({
    ...input,
    userId,
    isAdmin: false,
  })
  .get();

// Updating with Ents
const updatedProfile = await ctx
  .table("userProfiles")
  .getX(profileId)
  .patch({
    ...input,
  })
  .get();

// Deleting with Ents
await ctx.table("clubMemberships").getX(membershipId).delete();
```

### Schema Requirements

```typescript
// Include proper indexes for all queries
export default defineSchema({
  events: defineTable({
    name: v.string(),
    clubId: v.id("clubs"),
    date: v.number(),
    status: v.union(v.literal("NOT_STARTED"), v.literal("IN_PROGRESS"), v.literal("COMPLETED")),
  })
    .index("by_club", ["clubId"])
    .index("by_date", ["date"])
    .index("by_club_and_date", ["clubId", "date"]),
});
```

### Database Rules

- Use `ctx.table("tableName").getX(id)` for required lookups (throws if not found)
- Use `ctx.table("tableName").get(id)` for optional lookups (returns null if not found)
- Use `ctx.table("tableName").get("fieldName", value)` for unique field lookups
- Use `ctx.table("tableName", "indexName", (q) => q.eq("field", value))` for indexed queries
- Use `.edge("relationName")` for accessing related entities
- Use `.unique()` for single result from indexed queries
- Use `.paginate(paginationOpts)` for paginated results
- Handle null cases explicitly with proper TypeScript types

## Specific Patterns for This Project

### User Management Functions

```typescript
// Pattern for user operations
export const createUserProfile = authenticatedMutation({ profileRequired: false })({
  args: {
    input: userProfileCreateSchema,
  },
  returns: z.object(withSystemFields("userProfiles", userProfileSchema.shape)),
  handler: async (ctx, args) => {
    const { currentUser } = ctx;
    const { input } = args;

    // 1. Check permissions
    enforceOwnershipOrAdmin(currentUser, input.userId);

    // 2. Validate input
    if (input.dob) {
      validateDateOfBirth(input.dob);
    }

    // 3. Check business rules
    const existingProfile = await dtoGetProfileByUserId(ctx, input.userId);
    if (existingProfile) {
      throw new ConvexError(USER_PROFILE_ALREADY_EXISTS_ERROR);
    }

    // 4. Database operation
    const profile = await dtoCreateUserProfile(ctx, input.userId, input);

    // 5. Create activity log
    await dtoCreateActivity(ctx, {
      resourceId: profile._id,
      relatedId: currentUser._id,
      type: ACTIVITY_TYPES.USER_PROFILE_CREATED,
    });

    return profile;
  },
});

// Pattern for club operations with rate limiting
export const updateClub = authenticatedMutation()({
  args: {
    clubId: zid("clubs"),
    input: clubUpdateInputSchema,
  },
  returns: z.object(withSystemFields("clubs", clubSchema.shape)),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "updateClub", ctx.currentUser._id + args.clubId);
    const club = await dtoGetClubOrThrow(ctx, args.clubId);
    await enforceClubOwnershipOrAdmin(ctx, club);
    await validateClubUpdateInput(ctx, args.input, club);

    const updatedClub = await dtoUpdateClub(ctx, args.clubId, {
      ...args.input,
      // Business logic for approval status
      isApproved: args.input.isPublic ? false : club.isApproved,
    });

    await dtoCreateActivity(ctx, {
      resourceId: args.clubId,
      relatedId: ctx.currentUser._id,
      type: ACTIVITY_TYPES.CLUB_UPDATED,
      metadata: getMetadata(club, args.input),
    });

    return updatedClub;
  },
});
```

### Database Function Pattern

```typescript
/**
 * Gets the current authenticated user with their profile.
 * @param ctx Query context
 * @returns User details with profile if authenticated, null otherwise
 */
export const getCurrentUser = async (ctx: QueryCtx): Promise<UserDetails | null> => {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;

  const user = await ctx.table("users").get(userId);
  if (!user) return null;

  const profile = await user.edge("profile");
  return { ...user, profile };
};

/**
 * Gets a club by its ID or throw if does not exist
 * @param ctx Query context
 * @param clubId Club ID to retrieve
 * @returns Club document if found
 * @throws {ConvexError} When club is not found
 */
export const getClubOrThrow = async (ctx: QueryCtx, clubId: Id<"clubs">): Promise<Club> => {
  const club = await ctx.table("clubs").get(clubId);
  if (!club) {
    throw new ConvexError(CLUB_NOT_FOUND_ERROR);
  }
  return club;
};

/**
 * Creates a new user profile.
 * @param ctx Mutation context
 * @param userId User ID to associate with the profile
 * @param input User profile creation data
 * @returns User profile
 */
export const createUserProfile = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  input: UserProfileCreateInput,
): Promise<UserProfile> => {
  return await ctx
    .table("userProfiles")
    .insert({
      ...input,
      userId,
      isAdmin: false,
    })
    .get();
};

/**
 * Lists all public and approved clubs with pagination.
 * @param ctx Query context
 * @param paginationOpts Pagination options (cursor, numItems)
 * @returns Paginated result of public clubs
 */
export const listPublicClubs = async (
  ctx: QueryCtx,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<Club>> => {
  return await ctx
    .table("clubs", "publicApprovedName", (q) => q.eq("isPublic", true).eq("isApproved", true))
    .order("asc")
    .paginate(paginationOpts);
};
```

## Convex Ents Edge Rules

### Edge Definition Requirements

ALWAYS use fully specified edge syntax, never shortcuts:

```typescript
// REQUIRED: Fully specified 1:1 edge
defineEntSchema({
  users: defineEnt({
    name: v.string(),
  }).edge("profile", { to: "profiles", ref: "userId" }),
  profiles: defineEnt({
    bio: v.string(),
  }).edge("user", { to: "users", field: "userId" }),
});

// REQUIRED: Fully specified 1:many edge
defineEntSchema({
  users: defineEnt({
    name: v.string(),
  }).edges("messages", { to: "messages", ref: "userId" }),
  messages: defineEnt({
    text: v.string(),
  }).edge("user", { to: "users", field: "userId" }),
});

// REQUIRED: Fully specified many:many edge
defineEntSchema({
  messages: defineEnt({
    name: v.string(),
  }).edges("tags", {
    to: "tags",
    table: "messages_to_tags",
    field: "messagesId",
  }),
  tags: defineEnt({
    text: v.string(),
  }).edges("messages", {
    to: "messages",
    table: "messages_to_tags",
    field: "tagsId",
  }),
});
```

### Edge Types

- **1:1 edges**:
  - One entity uses `edge()` with `ref` option
  - Other entity uses `edge()` with `field` option
- **1:many edges**:
  - "One" side uses `edges()` with `ref` option
  - "Many" side uses `edge()` with `field` option
- **many:many edges**:
  - Both entities use `edges()` with `table` and `field` options
  - Both must reference the same junction table
- **Optional edges**: Add `optional: true` and specify `field` name

### Edge Storage Rules

- Field edges (1:1, 1:many): Stored as foreign key in one table
- Table edges (many:many): Stored in separate junction table
- Always specify `to`, `ref`/`table`, and `field` explicitly
- Use descriptive table names for many:many edges

## Testing Requirements

### Test Setup Pattern (MANDATORY)

```typescript
import { convexTest } from "@/convex/setup.testing";
import schema from "@/convex/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/convex/service/utils/validators/rateLimit", () => ({
  enforceRateLimit: vi.fn(),
}));

describe("Service Tests", () => {
  let t: ReturnType<typeof convexTest>;
  let helpers: ServiceTestHelpers;

  beforeEach(() => {
    t = convexTest(schema);
    helpers = new ServiceTestHelpers(t);
  });
});
```

### Test Patterns by Type

#### Database Function Tests (use runWithCtx)

```typescript
// For testing database layer functions - NEVER nest runWithCtx calls
it("gets user by email", async () => {
  // 1. Setup data using helpers (they use runWithCtx internally)
  const user = await helpers.insertUser("test@example.com");

  // 2. Test the function in separate runWithCtx call
  const result = await t.runWithCtx((ctx) => findUserByEmail(ctx, "test@example.com"));

  expect(result).toEqual(user);
});

// WRONG: Never use helpers inside runWithCtx
it("wrong pattern", async () => {
  await t.runWithCtx(async (ctx) => {
    // DON'T DO THIS - helpers use runWithCtx internally
    const user = await helpers.insertUser("test@example.com");
    return findUserByEmail(ctx, "test@example.com");
  });
});
```

#### API Function Tests (use direct t.query/t.mutation)

```typescript
// For testing API functions
it("creates user profile", async () => {
  const user = await helpers.insertUser();
  const userId = user._id;
  const input = { userId, firstName: "test", lastName: "profile" };

  const asUser = t.withIdentity({ subject: userId });
  const profile = await asUser.mutation(api.service.users.functions.createUserProfile, {
    input,
  });

  expect(profile).toEqual(expect.objectContaining(input));
});

it("returns null when not authenticated", async () => {
  const result = await t.query(api.service.users.functions.getCurrentUser, {});
  expect(result).toBeNull();
});
```

### Test Helper Class Pattern

**CRITICAL**: All insert operations in test helpers return the full object, NOT just the ID. Always extract the ID using `object._id`:

```typescript
// CORRECT: Extract ID from returned object
const user = await userHelpers.insertUser();
const userId = user._id;

const club = await clubHelpers.insertClub(createTestClub(userId));
const clubId = club._id;

const activity = await activityHelpers.insertActivity(createTestActivity(clubId));
const activityId = activity._id;

// WRONG: Assuming helpers return IDs directly
const userId = await userHelpers.insertUser(); // This is the full user object!
```

### Scheduled Function Testing Patterns

**Key Methods for Scheduled Functions:**

- `vi.useFakeTimers()` / `vi.useRealTimers()` - Control time
- `vi.setSystemTime(timestamp)` - Set fixed time for consistent tests
- `vi.advanceTimersByTime(ms)` - Move time forward
- `vi.runAllTimers()` - Execute all pending timers (REQUIRED before finishInProgressScheduledFunctions)
- `t.finishInProgressScheduledFunctions()` - Wait for scheduled functions to complete
- `t.finishAllScheduledFunctions(vi.runAllTimers)` - Complete entire scheduling chains

**Critical Pattern for Scheduled Functions:**

```typescript
// ALWAYS use this sequence:
vi.advanceTimersByTime(delayMs);
vi.runAllTimers(); // ✅ Execute timers first
await t.finishInProgressScheduledFunctions(); // ✅ Then wait for completion

// For scheduling chains:
await t.finishAllScheduledFunctions(vi.runAllTimers);
```

**Testing Batched Generation:**

```typescript
// Use block scoping to verify state at each step
{
  const events = await eventHelpers.listEventsBySeries(seriesId);
  expect(events.length).toBe(10); // Initial batch
}

vi.advanceTimersByTime(9 * TIME_MS.DAY);
vi.runAllTimers();
await t.finishInProgressScheduledFunctions();

{
  const events = await eventHelpers.listEventsBySeries(seriesId);
  expect(events.length).toBe(20); // Next batch
}
```

**Testing Internal Mutations:**

```typescript
// Test internal mutations directly
const result = await t.runMutation(api.service.events.functions._updateEventStatus, {
  eventId,
  status: EVENT_STATUS.COMPLETED,
});
```

```typescript
export class UserTestHelpers {
  constructor(private t: ReturnType<typeof convexTest>) {}

  async getUser(userId: Id<"users">) {
    return await this.t.runWithCtx((ctx) => ctx.table("users").getX(userId));
  }

  async insertUser(email = generateTestEmail()) {
    return await this.t.runWithCtx((ctx) => ctx.table("users").insert({ email }).get());
  }

  async deleteUser(userId: Id<"users">) {
    return await this.t.runWithCtx((ctx) => ctx.table("users").getX(userId).delete());
  }

  async insertProfile(profile: WithoutSystemFields<UserProfile>) {
    return await this.t.runWithCtx((ctx) => ctx.table("userProfiles").insert(profile).get());
  }

  async getProfile(profileId: Id<"userProfiles">) {
    return await this.t.runWithCtx((ctx) => ctx.table("userProfiles").getX(profileId));
  }
}
```

### Assertion Patterns

```typescript
// Primitives - use toBe()
expect(result._id).toBe(expectedId);
expect(result.email).toBe("test@example.com");
expect(result).toBe(null);

// Objects/Arrays - use toEqual()
expect(result.profile).toEqual(expectedProfile);
expect(result).toEqual(expectedObject);

// Existence checks
expect(result).not.toBeNull();
expect(result).toBeNull();
```

### Data Setup Patterns

#### For Database Tests

```typescript
// 1. Create test data using helpers (separate from runWithCtx)
const user = await helpers.insertUser("test@example.com");
const userId = user._id;

// 2. Execute database function in runWithCtx
const result = await t.runWithCtx((ctx) => findUserByEmail(ctx, "test@example.com"));

// 3. Verify results
expect(result).toEqual(user);

// CRITICAL: Never mix helpers with runWithCtx
// WRONG:
// const result = await t.runWithCtx(async (ctx) => {
//   const user = await helpers.insertUser(); // DON'T DO THIS
//   return findUserByEmail(ctx, user.email);
// });
```

#### For API Function Tests

```typescript
// 1. Create test data
const user = await userHelpers.insertUser();
const userId = user._id;
const profile = createTestProfile(userId);
await userHelpers.insertProfile(profile);

// 2. Execute API function
const asUser = t.withIdentity({ subject: userId });
const result = await asUser.query(api.service.users.functions.getCurrentUser, {});

// 3. Verify results
expect(result).not.toBeNull();
expect(result?.profile).toEqual(profile);
```

#### For Mutation Tests with Input Validation

```typescript
// 1. Create test data
const user = await userHelpers.insertUser();
const userId = user._id;
const input = { userId, firstName: "test", lastName: "profile" };

// 2. Execute API function
const asUser = t.withIdentity({ subject: userId });
const profile = await asUser.mutation(api.service.users.functions.createUserProfile, {
  input,
});

// 3. Verify results
expect(profile).toEqual(expect.objectContaining(input));

// 4. Verify in database
const createdProfile = await userHelpers.getProfile(profile._id);
expect(createdProfile).toEqual(expect.objectContaining(profile));
```

### Authentication Testing

#### Database Layer Authentication

```typescript
// Test with user ID (database functions handle auth via getAuthUserId)
const result = await t.runWithCtx((ctx) => getCurrentUser(ctx));
expect(result).toBeNull();
```

#### API Layer Authentication

```typescript
// Test authenticated API calls
const user = await userHelpers.insertUser();
const userId = user._id;
const profile = await userHelpers.insertProfile(createTestProfile(userId));

const asUser = t.withIdentity({ subject: userId });
const result = await asUser.query(api.service.users.functions.getCurrentUser, {});
expect(result).not.toBeNull();
expect(result?.profile).toEqual(profile);

// Test unauthenticated API calls
const result = await t.query(api.service.users.functions.getCurrentUser, {});
expect(result).toBeNull();

// Test access control for other users' resources
const otherUser = await userHelpers.insertUser("other@example.com");
const otherUserId = otherUser._id;
const asOtherUser = t.withIdentity({ subject: otherUserId });
await expect(
  asOtherUser.query(api.service.users.functions.listUserActivities, {
    userId,
    pagination: { cursor: null, numItems: 10 },
  }),
).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
```

### Error Testing

#### Database Function Errors

```typescript
// Setup data first, then test in separate runWithCtx
const user = await helpers.insertUser();
const userId = user._id;

await expect(t.runWithCtx((ctx) => databaseFunctionThatThrows(ctx, args))).rejects.toThrow(
  EXPECTED_ERROR,
);
```

#### API Function Errors

```typescript
// Test for specific error conditions
const user = await userHelpers.insertUser();
const userId = user._id;
const profile = createTestProfile(userId);
await userHelpers.insertProfile(profile);

const input = { firstName: "New", lastName: "Name", userId };
const asUser = t.withIdentity({ subject: userId });
await expect(
  asUser.mutation(api.service.users.functions.createUserProfile, { input }),
).rejects.toThrow(USER_PROFILE_ALREADY_EXISTS_ERROR);

// Test for access denied errors
const otherUser = await userHelpers.insertUser("other@example.com");
const otherUserId = otherUser._id;
const asOtherUser = t.withIdentity({ subject: otherUserId });
await expect(
  asOtherUser.mutation(api.service.clubs.functions.updateClub, { clubId, input }),
).rejects.toThrow(AUTH_ACCESS_DENIED_ERROR);
```

## Test Update Requirements

### MANDATORY: Always Check and Update Tests When Modifying Files

When modifying ANY file in the Convex backend:

1. **ALWAYS check for existing tests** in the corresponding `__tests__/` directory
2. **ALWAYS update tests** to reflect changes made to:
   - Function signatures
   - Input/output schemas
   - Business logic
   - Error conditions
   - Database operations
3. **ALWAYS run tests** after modifications to ensure they pass
4. **ALWAYS add new tests** for new functionality
5. **NEVER leave tests in a broken state** - fix them immediately

### Test Location Pattern

- Functions: `convex/service/{domain}/functions.ts` → `convex/service/{domain}/__tests__/functions.test.ts`
- Database: `convex/service/{domain}/database.ts` → `convex/service/{domain}/__tests__/database.test.ts`
- Helpers: `convex/service/{domain}/helpers/{helper}.ts` → `convex/service/{domain}/helpers/__tests__/{helper}.test.ts`
- Validators: `convex/service/utils/validators/{validator}.ts` → `convex/service/utils/validators/__tests__/{validator}.test.ts`

## Key Requirements Summary

1. **MANDATORY**: Check and update existing tests when modifying files
2. JSDoc on ALL functions
3. Use real data in tests, no mocks (except rate limiting)
4. Absolute imports with `@/convex/...`
5. Strict TypeScript typing
6. **Mixed API**: `ctx.table()` for Ents tables, `ctx.db` for legacy auth tables
7. Test helpers in `test-utils/samples/`
8. Error constants from `@/convex/constants/`
9. `ctx.table("tableName").getX(id)` for required lookups
10. **Fully specified edge syntax only**
11. **Different test patterns**: `t.runWithCtx()` for database tests, `t.query/t.mutation()` for API tests
12. **Helper class typing**: `ReturnType<typeof convexTest>`
13. **Function structure**: `publicQuery()`, `authenticatedQuery()`, `authenticatedMutation()`
14. **Proper assertions**: `toBe()` for primitives, `toEqual()` for objects
15. **Input structure**: Use `{ input: schema }` for mutations with `userId` in input
16. **Return types**: Use `z.object(withSystemFields())` for entity returns
17. **Test Helper Insert Pattern**: All `insert*()` methods return full objects, requiring ID extraction with `object._id`
18. **CRITICAL**: NEVER use test helpers inside `t.runWithCtx()` - helpers use `runWithCtx` internally
19. **CRITICAL**: NEVER nest `t.runWithCtx()` calls - always separate data setup from function testing
