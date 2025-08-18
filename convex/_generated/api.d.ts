/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as constants_activities from "../constants/activities.js";
import type * as constants_errors from "../constants/errors.js";
import type * as constants_rateLimitConfig from "../constants/rateLimitConfig.js";
import type * as constants_sessions from "../constants/sessions.js";
import type * as http from "../http.js";
import type * as migrations from "../migrations.js";
import type * as myFunctions from "../myFunctions.js";
import type * as service_activities_database from "../service/activities/database.js";
import type * as service_activities_schemas from "../service/activities/schemas.js";
import type * as service_clubs_database from "../service/clubs/database.js";
import type * as service_clubs_functions from "../service/clubs/functions.js";
import type * as service_clubs_schemas from "../service/clubs/schemas.js";
import type * as service_sessions_database from "../service/sessions/database.js";
import type * as service_sessions_functions from "../service/sessions/functions.js";
import type * as service_sessions_schemas from "../service/sessions/schemas.js";
import type * as service_users_database from "../service/users/database.js";
import type * as service_users_functions from "../service/users/functions.js";
import type * as service_users_schemas from "../service/users/schemas.js";
import type * as service_utils_database from "../service/utils/database.js";
import type * as service_utils_functions from "../service/utils/functions.js";
import type * as service_utils_metadata from "../service/utils/metadata.js";
import type * as service_utils_pagination from "../service/utils/pagination.js";
import type * as service_utils_rateLimit from "../service/utils/rateLimit.js";
import type * as service_utils_time from "../service/utils/time.js";
import type * as service_utils_validators_auth from "../service/utils/validators/auth.js";
import type * as service_utils_validators_clubs from "../service/utils/validators/clubs.js";
import type * as service_utils_validators_profile from "../service/utils/validators/profile.js";
import type * as service_utils_validators_rateLimit from "../service/utils/validators/rateLimit.js";
import type * as service_utils_validators_sessions from "../service/utils/validators/sessions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "constants/activities": typeof constants_activities;
  "constants/errors": typeof constants_errors;
  "constants/rateLimitConfig": typeof constants_rateLimitConfig;
  "constants/sessions": typeof constants_sessions;
  http: typeof http;
  migrations: typeof migrations;
  myFunctions: typeof myFunctions;
  "service/activities/database": typeof service_activities_database;
  "service/activities/schemas": typeof service_activities_schemas;
  "service/clubs/database": typeof service_clubs_database;
  "service/clubs/functions": typeof service_clubs_functions;
  "service/clubs/schemas": typeof service_clubs_schemas;
  "service/sessions/database": typeof service_sessions_database;
  "service/sessions/functions": typeof service_sessions_functions;
  "service/sessions/schemas": typeof service_sessions_schemas;
  "service/users/database": typeof service_users_database;
  "service/users/functions": typeof service_users_functions;
  "service/users/schemas": typeof service_users_schemas;
  "service/utils/database": typeof service_utils_database;
  "service/utils/functions": typeof service_utils_functions;
  "service/utils/metadata": typeof service_utils_metadata;
  "service/utils/pagination": typeof service_utils_pagination;
  "service/utils/rateLimit": typeof service_utils_rateLimit;
  "service/utils/time": typeof service_utils_time;
  "service/utils/validators/auth": typeof service_utils_validators_auth;
  "service/utils/validators/clubs": typeof service_utils_validators_clubs;
  "service/utils/validators/profile": typeof service_utils_validators_profile;
  "service/utils/validators/rateLimit": typeof service_utils_validators_rateLimit;
  "service/utils/validators/sessions": typeof service_utils_validators_sessions;
}>;
declare const fullApiWithMounts: typeof fullApi;

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: {
    lib: {
      checkRateLimit: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      clearAll: FunctionReference<
        "mutation",
        "internal",
        { before?: number },
        null
      >;
      getServerTime: FunctionReference<"mutation", "internal", {}, number>;
      getValue: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          key?: string;
          name: string;
          sampleShards?: number;
        },
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          shard: number;
          ts: number;
          value: number;
        }
      >;
      rateLimit: FunctionReference<
        "mutation",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      resetRateLimit: FunctionReference<
        "mutation",
        "internal",
        { key?: string; name: string },
        null
      >;
    };
    time: {
      getServerTime: FunctionReference<"mutation", "internal", {}, number>;
    };
  };
  migrations: {
    lib: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        { name: string },
        {
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }
      >;
      cancelAll: FunctionReference<
        "mutation",
        "internal",
        { sinceTs?: number },
        Array<{
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }>
      >;
      clearAll: FunctionReference<
        "mutation",
        "internal",
        { before?: number },
        null
      >;
      getStatus: FunctionReference<
        "query",
        "internal",
        { limit?: number; names?: Array<string> },
        Array<{
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }>
      >;
      migrate: FunctionReference<
        "mutation",
        "internal",
        {
          batchSize?: number;
          cursor?: string | null;
          dryRun: boolean;
          fnHandle: string;
          name: string;
          next?: Array<{ fnHandle: string; name: string }>;
        },
        {
          batchSize?: number;
          cursor?: string | null;
          error?: string;
          isDone: boolean;
          latestEnd?: number;
          latestStart: number;
          name: string;
          next?: Array<string>;
          processed: number;
          state: "inProgress" | "success" | "failed" | "canceled" | "unknown";
        }
      >;
    };
  };
};
