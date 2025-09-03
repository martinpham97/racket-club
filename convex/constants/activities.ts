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
  EVENT_SERIES_DEACTIVATION_SCHEDULED: "eventSeries:deactivation-scheduled",
  EVENT_IN_PROGRESS_SCHEDULED: "event:in_progress-scheduled",
  EVENT_COMPLETED_SCHEDULED: "event:completed-scheduled",
} as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[keyof typeof ACTIVITY_TYPES];

export const CLUB_JOINED_MESSAGE = "";

export const activityTypes = Object.values(ACTIVITY_TYPES);
