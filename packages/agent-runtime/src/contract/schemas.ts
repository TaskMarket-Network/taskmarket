import { z } from 'zod';

import { AGENT_SERVICE_CONTRACT_VERSION } from './version.js';

/**
 * Validator for caller-supplied request identifiers: 1-128 chars drawn from a
 * URL-safe alphabet so IDs survive logging, headers, and keys safely.
 */
export const agentServiceRequestIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/, 'requestId must be 1-128 characters of [A-Za-z0-9._-]');

/** Authentication placeholder. Not enforced; documented for the auth phase. */
export const agentServiceAuthSchema = z
  .object({
    scheme: z.enum(['bearer', 'api-key']),
    principal: z.string().min(1).max(256).optional(),
  })
  .strict();

/** External request envelope for executing one agent tool. */
export const agentServiceRequestSchema = z
  .object({
    contractVersion: z.string().min(1),
    requestId: agentServiceRequestIdSchema,
    tool: z.string().min(1).max(128),
    input: z.unknown().optional(),
    idempotencyKey: z.string().min(1).max(128).optional(),
    timeoutMs: z.number().int().positive().max(60_000).optional(),
    confirmed: z.boolean().optional(),
    caller: z.string().min(1).max(256).optional(),
    auth: agentServiceAuthSchema.optional(),
  })
  .strict();

/** Structured error carried inside a failed response. */
export const agentServiceErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();

/** External response envelope for one tool execution. */
export const agentServiceResponseSchema = z
  .object({
    contractVersion: z.literal(AGENT_SERVICE_CONTRACT_VERSION),
    requestId: agentServiceRequestIdSchema,
    traceId: z.string().min(1),
    tool: z.string().min(1),
    ok: z.boolean(),
    output: z.unknown().optional(),
    error: agentServiceErrorSchema.optional(),
    latencyMs: z.number().int().nonnegative(),
    attempts: z.number().int().nonnegative(),
    timestamp: z.string().min(1),
  })
  .strict();

/** Capability snapshot returned by the `/capabilities` endpoint. */
export const agentServiceCapabilitiesResponseSchema = z
  .object({
    contractVersion: z.literal(AGENT_SERVICE_CONTRACT_VERSION),
    agentId: z.string().min(1),
    version: z.string().min(1),
    capabilities: z.array(z.string().min(1)),
    tools: z.array(z.string().min(1)),
  })
  .strict();

/** Liveness and identity snapshot returned by the `/health` endpoint. */
export const agentServiceHealthResponseSchema = z
  .object({
    contractVersion: z.literal(AGENT_SERVICE_CONTRACT_VERSION),
    ok: z.boolean(),
    agentId: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    capabilities: z.array(z.string().min(1)),
    tools: z.array(z.string().min(1)),
    network: z.string().min(1),
    checkedAt: z.string().min(1),
  })
  .strict();
