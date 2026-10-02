/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as gameConfig from "../gameConfig.js";
import type * as mutations_champions from "../mutations/champions.js";
import type * as mutations_seed from "../mutations/seed.js";
import type * as optimizer from "../optimizer.js";
import type * as optimizerMissFortune from "../optimizerMissFortune.js";
import type * as optimizerRoles from "../optimizerRoles.js";
import type * as optimizerSetBonuses from "../optimizerSetBonuses.js";
import type * as queries from "../queries.js";
import type * as riot from "../riot.js";
import type * as typesafe from "../typesafe.js";
import type * as typesafeCritique from "../typesafeCritique.js";
import type * as typesafeItems from "../typesafeItems.js";
import type * as typesafeOptimizer from "../typesafeOptimizer.js";
import type * as typesafeRoles from "../typesafeRoles.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  gameConfig: typeof gameConfig;
  "mutations/champions": typeof mutations_champions;
  "mutations/seed": typeof mutations_seed;
  optimizer: typeof optimizer;
  optimizerMissFortune: typeof optimizerMissFortune;
  optimizerRoles: typeof optimizerRoles;
  optimizerSetBonuses: typeof optimizerSetBonuses;
  queries: typeof queries;
  riot: typeof riot;
  typesafe: typeof typesafe;
  typesafeCritique: typeof typesafeCritique;
  typesafeItems: typeof typesafeItems;
  typesafeOptimizer: typeof typesafeOptimizer;
  typesafeRoles: typeof typesafeRoles;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
