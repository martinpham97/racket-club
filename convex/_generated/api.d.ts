/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as auth from "../auth.js";
import type * as dto_users from "../dto/users.js";
import type * as functions_users from "../functions/users.js";
import type * as http from "../http.js";
import type * as myFunctions from "../myFunctions.js";
import type * as schemas_users from "../schemas/users.js";
import type * as utils_database from "../utils/database.js";

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
  "dto/users": typeof dto_users;
  "functions/users": typeof functions_users;
  http: typeof http;
  myFunctions: typeof myFunctions;
  "schemas/users": typeof schemas_users;
  "utils/database": typeof utils_database;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
