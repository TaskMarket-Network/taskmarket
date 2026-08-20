import { z } from 'zod';

import { agentCapabilitySchema } from '@taskmarket/agent-registry';

import { listingPricingSchema } from '../schemas.js';

/** Lifecycle status of a service offering. */
export const serviceOfferingStatusSchema = z.enum(['active', 'archived']);

/** A single typed input parameter of a service offering. */
export const serviceInputSchema = z
  .object({
    name: z.string().min(1).max(64),
    type: z.string().min(1).max(32),
    description: z.string().max(512).optional(),
    required: z.boolean().default(false),
  })
  .strict();

/** A single typed output value of a service offering. */
export const serviceOutputSchema = z
  .object({
    name: z.string().min(1).max(64),
    type: z.string().min(1).max(32),
    description: z.string().max(512).optional(),
  })
  .strict();

/**
 * Estimated execution time of the offering in milliseconds. Informational
 * metadata used for buyer expectations; it never schedules or times out work
 * (task execution is a later phase).
 */
export const estimatedExecutionTimeSchema = z
  .object({
    averageMs: z
      .number()
      .int()
      .min(0)
      .max(7 * 24 * 60 * 60 * 1000),
    maxMs: z
      .number()
      .int()
      .min(0)
      .max(7 * 24 * 60 * 60 * 1000),
  })
  .strict()
  .refine((value) => value.maxMs >= value.averageMs, {
    message: 'maxMs must be greater than or equal to averageMs',
    path: ['maxMs'],
  });

/** Execution constraints declared by the offering (informational). */
export const serviceConstraintsSchema = z
  .object({
    timeoutMs: z
      .number()
      .int()
      .min(1)
      .max(7 * 24 * 60 * 60 * 1000)
      .optional(),
    maxConcurrency: z.number().int().min(1).max(10_000).optional(),
    maxInputBytes: z
      .number()
      .int()
      .min(1)
      .max(1024 * 1024 * 1024)
      .optional(),
  })
  .strict();

/** Input for creating a service offering. `id` and timestamps are domain-owned. */
export const serviceOfferingInputSchema = z
  .object({
    id: z.string().min(1).max(128).optional(),
    ownerRef: z.string().min(1).max(256),
    agentId: z.string().min(1).max(128),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).default(''),
    capabilities: z.array(agentCapabilitySchema).max(50).default([]),
    inputs: z.array(serviceInputSchema).max(50).default([]),
    outputs: z.array(serviceOutputSchema).max(50).default([]),
    pricing: z.array(listingPricingSchema).max(20).default([]),
    estimatedExecutionTime: estimatedExecutionTimeSchema,
    constraints: serviceConstraintsSchema.default({}),
    status: serviceOfferingStatusSchema.default('active'),
  })
  .strict();

/**
 * Input for updating the mutable fields of a service offering. Immutable fields
 * (`id`, `ownerRef`, `agentId`, `createdAt`, `version`) are rejected because
 * the schema is strict and only lists mutable fields.
 */
export const serviceOfferingUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    capabilities: z.array(agentCapabilitySchema).max(50).optional(),
    inputs: z.array(serviceInputSchema).max(50).optional(),
    outputs: z.array(serviceOutputSchema).max(50).optional(),
    pricing: z.array(listingPricingSchema).max(20).optional(),
    estimatedExecutionTime: estimatedExecutionTimeSchema.optional(),
    constraints: serviceConstraintsSchema.optional(),
    status: serviceOfferingStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one mutable field is required',
  });

/** The full service offering as returned by the offerings API. */
export const serviceOfferingSchema = z
  .object({
    id: z.string().min(1).max(128),
    ownerRef: z.string().min(1).max(256),
    agentId: z.string().min(1).max(128),
    name: z.string().min(1).max(200),
    description: z.string().max(2000),
    capabilities: z.array(agentCapabilitySchema).max(50),
    inputs: z.array(serviceInputSchema).max(50),
    outputs: z.array(serviceOutputSchema).max(50),
    pricing: z.array(listingPricingSchema).max(20),
    estimatedExecutionTime: estimatedExecutionTimeSchema,
    constraints: serviceConstraintsSchema,
    status: serviceOfferingStatusSchema,
    version: z.number().int().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();
