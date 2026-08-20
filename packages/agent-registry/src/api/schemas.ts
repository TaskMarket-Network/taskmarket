import { z } from 'zod';

import {
  agentUpdateInputSchema,
  registeredAgentInputSchema,
  registeredAgentSchema,
} from '../schemas.js';
import { AGENT_REGISTRATION_API_VERSION } from './version.js';

/** Operations exposed by the agent registration API. */
export const agentRegistrationActionSchema = z.enum([
  'register',
  'update',
  'get',
  'disable',
  'validate',
]);

/**
 * Validator for caller-supplied request identifiers: 1-128 chars drawn from a
 * URL-safe alphabet so IDs survive logging, headers, and keys safely.
 */
export const agentRegistrationRequestIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/, 'requestId must be 1-128 characters of [A-Za-z0-9._-]');

/**
 * Authenticated principal placeholder. In the real transport an adapter sets
 * this from verified credentials; until then callers supply it directly and
 * the service enforces the ownership boundary against it. Never sent raw
 * credentials through.
 */
export const agentRegistrationPrincipalSchema = z.string().min(1).max(256);

/** External request envelope for one agent registration operation. */
export const agentRegistrationRequestSchema = z
  .object({
    contractVersion: z.string().min(1),
    requestId: agentRegistrationRequestIdSchema,
    action: agentRegistrationActionSchema,
    principal: agentRegistrationPrincipalSchema,
    payload: z.unknown(),
  })
  .strict();

/** Payload for `register`: the profile input (id optional; domain-owned). */
export const agentRegisterPayloadSchema = registeredAgentInputSchema;

/** Payload for `update`: id + expected version + mutable-field changes. */
export const agentUpdatePayloadSchema = z
  .object({
    agentId: z.string().min(1).max(128),
    version: z.number().int().min(1),
    update: agentUpdateInputSchema,
  })
  .strict();

/** Payload for `get`: the agent id to read. */
export const agentGetPayloadSchema = z
  .object({
    agentId: z.string().min(1).max(128),
  })
  .strict();

/** Payload for `disable`: id + expected version for optimistic concurrency. */
export const agentDisablePayloadSchema = z
  .object({
    agentId: z.string().min(1).max(128),
    version: z.number().int().min(1),
  })
  .strict();

/**
 * Payload for `validate`: a candidate profile to dry-run validate. The
 * candidate is intentionally untyped here so the operation itself reports
 * validation issues as `INPUT_INVALID` (the handler validates it). The refine
 * keeps `candidate` required (zod treats `z.unknown()` properties as optional).
 */
export const agentValidatePayloadSchema = z
  .object({
    candidate: z.unknown(),
  })
  .strict()
  .refine((value) => value.candidate !== undefined, {
    message: 'candidate is required',
    path: ['candidate'],
  });

/** Per-action payload schemas, keyed by action (used by `parseRequest`). */
export const agentRegistrationPayloadSchemas = {
  register: agentRegisterPayloadSchema,
  update: agentUpdatePayloadSchema,
  get: agentGetPayloadSchema,
  disable: agentDisablePayloadSchema,
  validate: agentValidatePayloadSchema,
} as const;

/** Structured error carried inside a failed response. */
export const agentRegistrationErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    issues: z.array(z.string()).optional(),
  })
  .strict();

/**
 * External response envelope for one agent registration operation. `agent` is
 * present for successful register/update/get/disable; `candidate` (the
 * normalized input) is present for successful validate.
 */
export const agentRegistrationResponseSchema = z
  .object({
    contractVersion: z.literal(AGENT_REGISTRATION_API_VERSION),
    requestId: agentRegistrationRequestIdSchema,
    action: z.string().min(1),
    ok: z.boolean(),
    agent: registeredAgentSchema.optional(),
    candidate: z.unknown().optional(),
    error: agentRegistrationErrorSchema.optional(),
    timestamp: z.string().min(1),
  })
  .strict();
