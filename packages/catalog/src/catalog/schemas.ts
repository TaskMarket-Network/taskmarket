import { z } from 'zod';

import {
  marketplaceListingInputSchema,
  marketplaceListingSchema,
  marketplaceListingUpdateSchema,
} from '../schemas.js';
import { MARKETPLACE_CATALOG_API_VERSION } from './version.js';

/** Operations exposed by the marketplace catalog API. */
export const marketplaceCatalogActionSchema = z.enum([
  'create',
  'update',
  'get',
  'list',
  'publish',
  'pause',
  'delist',
]);

/** Validator-conformant caller-supplied request identifiers. */
export const marketplaceCatalogRequestIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/, 'requestId must be 1-128 characters of [A-Za-z0-9._-]');

/**
 * Authenticated principal placeholder. In the real transport an adapter sets
 * this from verified credentials; until then callers supply it directly and
 * the service enforces the ownership boundary against it. Never send raw
 * credentials through.
 */
export const marketplaceCatalogPrincipalSchema = z.string().min(1).max(256);

/** External request envelope for one marketplace catalog operation. */
export const marketplaceCatalogRequestSchema = z
  .object({
    contractVersion: z.string().min(1),
    requestId: marketplaceCatalogRequestIdSchema,
    action: marketplaceCatalogActionSchema,
    principal: marketplaceCatalogPrincipalSchema,
    payload: z.unknown(),
  })
  .strict();

/** Payload for `create`: the listing input (ownerRef is checked against principal). */
export const marketplaceCatalogCreatePayloadSchema = z
  .object({
    input: marketplaceListingInputSchema,
  })
  .strict();

/** Payload for `update`: id + expected version + mutable-field changes. */
export const marketplaceCatalogUpdatePayloadSchema = z
  .object({
    listingId: z.string().min(1).max(128),
    version: z.number().int().min(1),
    update: marketplaceListingUpdateSchema,
  })
  .strict();

/** Payload for `get`: the listing id to read. */
export const marketplaceCatalogGetPayloadSchema = z
  .object({
    listingId: z.string().min(1).max(128),
  })
  .strict();

/** Payload for `list`: owner-scoped listing of the caller's own listings. */
export const marketplaceCatalogListPayloadSchema = z.object({}).strict();

/** Payload for lifecycle operations: id + expected version. */
export const marketplaceCatalogLifecyclePayloadSchema = z
  .object({
    listingId: z.string().min(1).max(128),
    version: z.number().int().min(1),
  })
  .strict();

/** Per-action payload schemas, keyed by action (used by `parseRequest`). */
export const marketplaceCatalogPayloadSchemas = {
  create: marketplaceCatalogCreatePayloadSchema,
  update: marketplaceCatalogUpdatePayloadSchema,
  get: marketplaceCatalogGetPayloadSchema,
  list: marketplaceCatalogListPayloadSchema,
  publish: marketplaceCatalogLifecyclePayloadSchema,
  pause: marketplaceCatalogLifecyclePayloadSchema,
  delist: marketplaceCatalogLifecyclePayloadSchema,
} as const;

/** Structured error carried inside a failed response. */
export const marketplaceCatalogErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    issues: z.array(z.string()).optional(),
  })
  .strict();

/**
 * External response envelope for one marketplace catalog operation. `listing`
 * is present for successful create/update/get/publish/pause/delist; `listings`
 * is present for a successful list.
 */
export const marketplaceCatalogResponseSchema = z
  .object({
    contractVersion: z.literal(MARKETPLACE_CATALOG_API_VERSION),
    requestId: marketplaceCatalogRequestIdSchema,
    action: z.string().min(1),
    ok: z.boolean(),
    listing: marketplaceListingSchema.optional(),
    listings: z.array(marketplaceListingSchema).optional(),
    error: marketplaceCatalogErrorSchema.optional(),
    timestamp: z.string().min(1),
  })
  .strict();
