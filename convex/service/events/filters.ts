import { Id } from "@/convex/_generated/dataModel";
import { EVENT_VISIBILITY } from "@/convex/constants/events";
import { Event, EventFilters } from "./schemas";

/**
 * Determines if a user has permission to view an event based on its visibility settings
 * 
 * @param event - The event to check access for
 * @param userMemberClubIds - Array of club IDs where the user has membership
 * @returns true if user can access the event, false otherwise
 * 
 * **Access Rules:**
 * - PUBLIC events: Always accessible to all users
 * - MEMBERS_ONLY events: Only accessible to club members
 * 
 * @example
 * ```typescript
 * const publicEvent = { visibility: EVENT_VISIBILITY.PUBLIC, clubId: "club1" };
 * hasEventAccess(publicEvent, []); // returns true
 * 
 * const membersEvent = { visibility: EVENT_VISIBILITY.MEMBERS_ONLY, clubId: "club1" };
 * hasEventAccess(membersEvent, ["club1"]); // returns true
 * hasEventAccess(membersEvent, []); // returns false
 * ```
 */
export const hasEventAccess = (event: Event, userMemberClubIds: Id<"clubs">[]): boolean => {
  return !(
    event.visibility === EVENT_VISIBILITY.MEMBERS_ONLY && !userMemberClubIds.includes(event.clubId)
  );
};

/**
 * Filters events by club membership
 * 
 * @param event - The event to check
 * @param clubIds - Optional array of club IDs to filter by
 * @returns true if event matches club filter or no filter provided, false otherwise
 * 
 * **Filter Logic:**
 * - If no clubIds provided: Returns true (no filtering)
 * - If clubIds provided: Returns true only if event's club is in the list
 * 
 * @example
 * ```typescript
 * const event = { clubId: "club1" };
 * matchesClubFilter(event); // returns true (no filter)
 * matchesClubFilter(event, ["club1", "club2"]); // returns true
 * matchesClubFilter(event, ["club3"]); // returns false
 * ```
 */
export const matchesClubFilter = (event: Event, clubIds?: Id<"clubs">[]): boolean => {
  return !clubIds || clubIds.includes(event.clubId);
};

/**
 * Filters events by skill level range overlap
 * 
 * @param event - The event to check with its levelRange property
 * @param levelRange - Optional skill level filter with min/max bounds
 * @returns true if event's level range overlaps with filter or no filter provided
 * 
 * **Overlap Logic:**
 * - No filter: Always returns true
 * - With min: Event's max level must be >= filter's min
 * - With max: Event's min level must be <= filter's max
 * - Both: Event range must overlap with filter range
 * 
 * @example
 * ```typescript
 * const event = { levelRange: { min: 3, max: 7 } };
 * matchesLevelRange(event); // returns true (no filter)
 * matchesLevelRange(event, { min: 5 }); // returns true (7 >= 5)
 * matchesLevelRange(event, { max: 5 }); // returns true (3 <= 5)
 * matchesLevelRange(event, { min: 8 }); // returns false (7 < 8)
 * ```
 */
export const matchesLevelRange = (
  event: Event,
  levelRange?: { min?: number; max?: number },
): boolean => {
  if (levelRange?.min !== undefined && event.levelRange.max < levelRange.min) {
    return false;
  }
  if (levelRange?.max !== undefined && event.levelRange.min > levelRange.max) {
    return false;
  }
  return true;
};

/**
 * Filters events by location using place ID matching
 * 
 * @param event - The event to check with its location.placeId property
 * @param placeId - Optional place ID to filter by (case-insensitive)
 * @returns true if event's place ID matches filter or no filter provided
 * 
 * **Matching Logic:**
 * - No placeId: Always returns true
 * - With placeId: Case-insensitive comparison with event's location.placeId
 * 
 * @example
 * ```typescript
 * const event = { location: { placeId: "Place123" } };
 * matchesLocationFilter(event); // returns true (no filter)
 * matchesLocationFilter(event, "place123"); // returns true (case-insensitive)
 * matchesLocationFilter(event, "Place456"); // returns false
 * ```
 */
export const matchesLocationFilter = (event: Event, placeId?: string): boolean => {
  return !placeId || event.location.placeId.toLowerCase() === placeId.toLowerCase();
};

/**
 * Performs text search across event name and description
 * 
 * @param event - The event to search with name and optional description
 * @param query - Optional search query string (case-insensitive)
 * @returns true if query matches event name/description or no query provided
 * 
 * **Search Logic:**
 * - No query: Always returns true
 * - With query: Case-insensitive substring search in:
 *   - Event name (required field)
 *   - Event description (optional field, ignored if undefined)
 * 
 * @example
 * ```typescript
 * const event = { name: "Tennis Match", description: "Indoor court" };
 * matchesTextSearch(event); // returns true (no query)
 * matchesTextSearch(event, "tennis"); // returns true (matches name)
 * matchesTextSearch(event, "indoor"); // returns true (matches description)
 * matchesTextSearch(event, "basketball"); // returns false
 * ```
 */
export const matchesTextSearch = (event: Event, query?: string): boolean => {
  if (!query) return true;
  const searchText = query.toLowerCase();
  return (
    event.name.toLowerCase().includes(searchText) ||
    (event.description?.toLowerCase().includes(searchText) ?? false)
  );
};

/**
 * Creates a composite filter function that combines all event filtering criteria
 * 
 * @param query - Optional text search query for event name/description
 * @param filters - Event filtering criteria (date range, clubs, level, location)
 * @param userMemberClubIds - Club IDs where user has membership for access control
 * @returns Filter predicate function that takes an Event and returns boolean
 * 
 * **Combined Filtering:**
 * The returned function applies ALL filters in sequence:
 * 1. Access control (visibility + membership)
 * 2. Club membership filter
 * 3. Skill level range overlap
 * 4. Location place ID matching
 * 5. Text search in name/description
 * 
 * @example
 * ```typescript
 * const filterFn = createEventFilter(
 *   "tennis",
 *   { clubIds: ["club1"], levelRange: { min: 3, max: 7 } },
 *   ["club1"]
 * );
 * 
 * const event = {
 *   name: "Tennis Tournament",
 *   clubId: "club1",
 *   visibility: EVENT_VISIBILITY.PUBLIC,
 *   levelRange: { min: 4, max: 6 }
 * };
 * 
 * filterFn(event); // returns true (passes all filters)
 * ```
 */
export const createEventFilter =
  (query: string | undefined, filters: EventFilters, userMemberClubIds: Id<"clubs">[]) =>
  (event: Event): boolean => {
    return (
      hasEventAccess(event, userMemberClubIds) &&
      matchesClubFilter(event, filters.clubIds) &&
      matchesLevelRange(event, filters.levelRange) &&
      matchesLocationFilter(event, filters.placeId) &&
      matchesTextSearch(event, query)
    );
  };
