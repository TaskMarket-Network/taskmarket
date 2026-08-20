import { z } from 'zod';

/** Lifecycle status of a registered agent. */
export const agentStatusSchema = z.enum(['draft', 'active', 'suspended', 'retired']);

/** How an agent endpoint is reached. */
export const agentEndpointTypeSchema = z.enum(['mcp', 'http', 'webhook']);

/**
 * Capability key format shared with the agent runtime (`agent:meta`,
 * `wallet:read`). Defined here so the registry stays a standalone domain
 * package; a shared vocabulary package may own it in a later phase.
 */
export const agentCapabilitySchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9-]*:[a-z0-9-]+$/, 'capabilities must look like "agent:meta"');

/** URL validator: absolute http(s) only (SSRF guard at the trust boundary). */
export const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'endpoint URL must use http or https');

/** A reachable endpoint a registered agent declares (id required). */
export const agentEndpointSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: agentEndpointTypeSchema,
    url: httpUrlSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/** Endpoint input at the trust boundary (id optional; the domain fills it). */
export const agentEndpointInputSchema = z
  .object({
    id: z.string().min(1).max(128).optional(),
    type: agentEndpointTypeSchema,
    url: httpUrlSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/** Non-negative decimal amount as a string (avoids float issues for metadata). */
const decimalAmountSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'amount must be a non-negative decimal string');

/** Pricing metadata for discovery/matching only (never used for payment). */
export const agentPricingSchema = z
  .object({
    currency: z.string().min(1).max(16),
    minAmount: decimalAmountSchema.optional(),
    maxAmount: decimalAmountSchema.optional(),
    description: z.string().min(1).max(512).optional(),
  })
  .strict()
  .refine(
    (value) => {
      if (value.minAmount === undefined || value.maxAmount === undefined) {
        return true;
      }
      return Number(value.maxAmount) >= Number(value.minAmount);
    },
    { message: 'maxAmount must be greater than or equal to minAmount', path: ['maxAmount'] },
  );

/** Input for registering a new agent. `id` and timestamps are domain-owned. */
export const registeredAgentInputSchema = z
  .object({
    id: z.string().min(1).max(128).optional(),
    ownerRef: z.string().min(1).max(256),
    name: z.string().min(1).max(256),
    description: z.string().max(2048).default(''),
    capabilities: z.array(agentCapabilitySchema).min(1).max(100),
    endpoints: z.array(agentEndpointInputSchema).max(50).default([]),
    status: agentStatusSchema.default('draft'),
    pricing: agentPricingSchema.optional(),
  })
  .strict();

/**
 * Input for updating the mutable fields of a registered agent. Immutable
 * fields (`id`, `ownerRef`, `createdAt`, `version`) are rejected because the
 * schema is strict and only lists mutable fields.
 */
export const agentUpdateInputSchema = z
  .object({
    name: z.string().min(1).max(256).optional(),
    description: z.string().max(2048).optional(),
    capabilities: z.array(agentCapabilitySchema).min(1).max(100).optional(),
    endpoints: z.array(agentEndpointInputSchema).max(50).optional(),
    status: agentStatusSchema.optional(),
    pricing: agentPricingSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one mutable field is required',
  });

/**
 * The full registered agent as returned by the registration API. Mirrors the
 * domain model (see `types.ts`); `pricing` is optional.
 */
export const registeredAgentSchema = z
  .object({
    id: z.string().min(1).max(128),
    ownerRef: z.string().min(1).max(256),
    name: z.string().min(1).max(256),
    description: z.string().max(2048),
    capabilities: z.array(agentCapabilitySchema).min(1).max(100),
    endpoints: z.array(agentEndpointSchema).max(50),
    status: agentStatusSchema,
    pricing: agentPricingSchema.optional(),
    version: z.number().int().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();
