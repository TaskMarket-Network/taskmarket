import { z } from 'zod';

import {
  agentCapabilitySchema,
  agentEndpointTypeSchema,
  agentPricingSchema,
  httpUrlSchema,
} from '../schemas.js';
import { CAPABILITY_DISCOVERY_API_VERSION } from './version.js';

/** A capability namespace, e.g. `wallet` (the `ns` in `ns:name`). */
export const capabilityNamespaceSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9-]*$/, 'namespace must look like "wallet"');

/** Ranking inputs: the sort field and direction used to order results. */
export const capabilityDiscoverySortBySchema = z.enum([
  'relevance',
  'updatedAt',
  'createdAt',
  'name',
  'version',
]);
export const capabilityDiscoverySortDirectionSchema = z.enum(['asc', 'desc']);

/**
 * A validated capability discovery query. All filters combine with AND.
 * - `capabilities`: agents must declare every requested key (exact match).
 * - `namespaces`: agents must declare at least one capability in a requested
 *   namespace (any match within the group).
 * - `query`: case-insensitive substring over name, description, and keys.
 * An empty query returns all active agents (browse), paged by `limit`/`offset`.
 */
export const capabilityDiscoveryQuerySchema = z
  .object({
    capabilities: z.array(agentCapabilitySchema).max(50).optional(),
    namespaces: z.array(capabilityNamespaceSchema).max(50).optional(),
    query: z.string().max(256).optional(),
    sortBy: capabilityDiscoverySortBySchema.default('relevance'),
    sortDirection: capabilityDiscoverySortDirectionSchema.default('desc'),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();

/**
 * A safe discovery projection of a registered agent. Arbitrary endpoint
 * `metadata` is deliberately excluded so untrusted metadata never becomes
 * executable instructions; only `active` agents are ever discoverable.
 */
export const capabilityDiscoveryItemSchema = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(256),
    description: z.string().max(2048),
    capabilities: z.array(agentCapabilitySchema).min(1).max(100),
    endpoints: z
      .array(
        z
          .object({
            id: z.string().min(1).max(128),
            type: agentEndpointTypeSchema,
            url: httpUrlSchema,
          })
          .strict(),
      )
      .max(50),
    status: z.literal('active'),
    pricing: agentPricingSchema.optional(),
    version: z.number().int().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

/** The result of a capability discovery query. */
export const capabilityDiscoveryResultSchema = z
  .object({
    contractVersion: z.literal(CAPABILITY_DISCOVERY_API_VERSION),
    total: z.number().int().min(0),
    limit: z.number().int().min(1),
    offset: z.number().int().min(0),
    items: z.array(capabilityDiscoveryItemSchema),
  })
  .strict();

/** Structured error carried by a failed discovery response. */
export const capabilityDiscoveryErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    issues: z.array(z.string()).optional(),
  })
  .strict();
