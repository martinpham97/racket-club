export const ACTIVITY_TYPES = {
  CLUB_CREATED: "club:created",
  CLUB_UPDATED: "club:updated",
  CLUB_DELETED: "club:deleted",
  CLUB_JOIN_REQUEST: "club:join-request",
  CLUB_JOINED: "club:joined",
  CLUB_LEFT: "club:left",
  CLUB_MEMBERSHIP_REMOVED: "club:membership-removed",
  CLUB_MEMBERSHIP_UPDATED: "club:membership-updated",
  CLUB_MEMBER_BANNED: "club:member-banned",
  CLUB_MEMBER_UNBANNED: "club:member-unbanned",
  USER_CREATED: "user:created",
  USER_PROFILE_CREATED: "user:profile-created",
  USER_PROFILE_UPDATED: "user:profile-updated",
  EVENT_SERIES_CREATED: "eventSeries:created",
  EVENT_SERIES_UPDATED: "eventSeries:updated",
  EVENT_SERIES_DELETED: "eventSeries:deleted",
  EVENT_SERIES_DEACTIVATED: "eventSeries:deactivated",
  EVENT_CREATED: "event:created",
  EVENT_JOINED: "event:joined",
  EVENT_LEFT: "event:left",
  EVENT_NOT_STARTED: "event:not-started",
  EVENT_IN_PROGRESS: "event:in-progress",
  EVENT_COMPLETED: "event:completed",
  EVENT_CANCELLED: "event:cancelled",
} as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[keyof typeof ACTIVITY_TYPES];

export const activityTypes = Object.values(ACTIVITY_TYPES);
