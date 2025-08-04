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
import type * as constants_errors from "../constants/errors.js";
import type * as constants_rateLimit from "../constants/rateLimit.js";
import type * as http from "../http.js";
import type * as myFunctions from "../myFunctions.js";
import type * as service_clubs_database from "../service/clubs/database.js";
import type * as service_clubs_functions from "../service/clubs/functions.js";
import type * as service_clubs_schemas from "../service/clubs/schemas.js";
import type * as service_users_database from "../service/users/database.js";
import type * as service_users_functions from "../service/users/functions.js";
import type * as service_users_schemas from "../service/users/schemas.js";
import type * as service_utils_database from "../service/utils/database.js";
import type * as service_utils_functions from "../service/utils/functions.js";
import type * as service_utils_pagination from "../service/utils/pagination.js";
import type * as service_utils_rateLimit from "../service/utils/rateLimit.js";
import type * as service_utils_validators_auth from "../service/utils/validators/auth.js";
import type * as service_utils_validators_rateLimit from "../service/utils/validators/rateLimit.js";

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
  "constants/errors": typeof constants_errors;
  "constants/rateLimit": typeof constants_rateLimit;
  http: typeof http;
  myFunctions: typeof myFunctions;
  "service/clubs/database": typeof service_clubs_database;
  "service/clubs/functions": typeof service_clubs_functions;
  "service/clubs/schemas": typeof service_clubs_schemas;
  "service/users/database": typeof service_users_database;
  "service/users/functions": typeof service_users_functions;
  "service/users/schemas": typeof service_users_schemas;
  "service/utils/database": typeof service_utils_database;
  "service/utils/functions": typeof service_utils_functions;
  "service/utils/pagination": typeof service_utils_pagination;
  "service/utils/rateLimit": typeof service_utils_rateLimit;
  "service/utils/validators/auth": typeof service_utils_validators_auth;
  "service/utils/validators/rateLimit": typeof service_utils_validators_rateLimit;
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
};
