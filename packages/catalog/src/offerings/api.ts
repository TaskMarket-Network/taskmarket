import { z } from 'zod';

import {
  serviceOfferingInputSchema,
  serviceOfferingSchema,
  serviceOfferingUpdateSchema,
} from './schemas.js';
import { SERVICE_OFFERING_API_VERSION } from './version.js';

/** Operations exposed by the service offerings API. */
export const serviceOfferingActionSchema = z.enum([
  'create',
  'update',
  'get',
  'list',
  'archive',
  'activate',
]);

/** Validator-conformant caller-supplied request identifiers. */
export const serviceOfferingRequestIdSchema = z
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
export const serviceOfferingPrincipalSchema = z.string().min(1).max(256);

/** External request envelope for one service offering operation. */
export const serviceOfferingRequestSchema = z
  .object({
    contractVersion: z.string().min(1),
    requestId: serviceOfferingRequestIdSchema,
    action: serviceOfferingActionSchema,
    principal: serviceOfferingPrincipalSchema,
    payload: z.unknown(),
  })
  .strict();

/** Payload for `create`: the offering input (ownerRef is checked against principal). */
export const serviceOfferingCreatePayloadSchema = z
  .object({
    input: serviceOfferingInputSchema,
  })
  .strict();

/** Payload for `update`: id + expected version + mutable-field changes. */
export const serviceOfferingUpdatePayloadSchema = z
  .object({
    offeringId: z.string().min(1).max(128),
    version: z.number().int().min(1),
    update: serviceOfferingUpdateSchema,
  })
  .strict();

/** Payload for `get`: the offering id to read. */
export const serviceOfferingGetPayloadSchema = z
  .object({
    offeringId: z.string().min(1).max(128),
  })
  .strict();

/** Payload for `list`: owner-scoped listing of the caller's own offerings. */
export const serviceOfferingListPayloadSchema = z.object({}).strict();

/** Payload for lifecycle operations: id + expected version. */
export const serviceOfferingLifecyclePayloadSchema = z
  .object({
    offeringId: z.string().min(1).max(128),
    version: z.number().int().min(1),
  })
  .strict();

/** Per-action payload schemas, keyed by action (used by `parseRequest`). */
export const serviceOfferingPayloadSchemas = {
  create: serviceOfferingCreatePayloadSchema,
  update: serviceOfferingUpdatePayloadSchema,
  get: serviceOfferingGetPayloadSchema,
  list: serviceOfferingListPayloadSchema,
  archive: serviceOfferingLifecyclePayloadSchema,
  activate: serviceOfferingLifecyclePayloadSchema,
} as const;

/** Structured error carried inside a failed response. */
export const serviceOfferingErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    issues: z.array(z.string()).optional(),
  })
  .strict();

/**
 * External response envelope for one service offering operation. `offering`
 * is present for successful create/update/get/archive/activate; `offerings`
 * is present for a successful list.
 */
export const serviceOfferingResponseSchema = z
  .object({
    contractVersion: z.literal(SERVICE_OFFERING_API_VERSION),
    requestId: serviceOfferingRequestIdSchema,
    action: z.string().min(1),
    ok: z.boolean(),
    offering: serviceOfferingSchema.optional(),
    offerings: z.array(serviceOfferingSchema).optional(),
    error: serviceOfferingErrorSchema.optional(),
    timestamp: z.string().min(1),
  })
  .strict();
