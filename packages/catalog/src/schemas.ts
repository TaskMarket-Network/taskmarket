import { z } from 'zod';

import { agentCapabilitySchema } from '@taskmarket/agent-registry';

/** Lifecycle status of a marketplace listing. */
export const listingStatusSchema = z.enum(['draft', 'published', 'paused', 'delisted']);

/** Availability of the listed service (informational; no scheduling behavior). */
export const listingAvailabilitySchema = z
  .object({
    status: z.enum(['available', 'limited', 'unavailable']),
    note: z.string().max(512).optional(),
  })
  .strict();

/**
 * Trust indicators attached to a listing. They are **self-reported** and must
 * never be treated as verified reputation: ranking and UI treat them as
 * unverified claims (Phase 3, 03-02).
 */
export const listingTrustSchema = z
  .object({
    selfReported: z.literal(true),
    rating: z
      .string()
      .regex(/^\d+(\.\d+)?$/, 'rating must be a non-negative decimal string')
      .optional(),
    reviews: z.number().int().min(0).optional(),
    completionRate: z
      .string()
      .regex(/^\d+(\.\d+)?$/, 'completionRate must be a non-negative decimal string')
      .optional(),
    completedTasks: z.number().int().min(0).optional(),
  })
  .strict()
  .refine((value) => value.rating === undefined || Number(value.rating) <= 5, {
    message: 'rating must be between 0 and 5',
    path: ['rating'],
  })
  .refine((value) => value.completionRate === undefined || Number(value.completionRate) <= 100, {
    message: 'completionRate must be between 0 and 100',
    path: ['completionRate'],
  });

/** Non-negative decimal amount as a string (avoids float issues). */
const decimalAmountSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'amount must be a non-negative decimal string');

/** A pricing model for the listed service. Informational metadata only — never used for payment. */
export const listingPricingSchema = z
  .object({
    name: z.string().min(1).max(64),
    currency: z.string().min(1).max(16),
    amount: decimalAmountSchema,
    per: z.string().min(1).max(32).optional(),
    description: z.string().min(1).max(256).optional(),
  })
  .strict();

/** Input for creating a listing. `id` and timestamps are domain-owned. */
export const marketplaceListingInputSchema = z
  .object({
    id: z.string().min(1).max(128).optional(),
    ownerRef: z.string().min(1).max(256),
    agentId: z.string().min(1).max(128),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).default(''),
    capabilities: z.array(agentCapabilitySchema).min(1).max(50),
    pricing: z.array(listingPricingSchema).max(20).default([]),
    availability: listingAvailabilitySchema.default({ status: 'available' }),
    trust: listingTrustSchema.default({ selfReported: true }),
    status: listingStatusSchema.default('draft'),
  })
  .strict();

/**
 * Input for updating the mutable fields of a listing. Immutable fields (`id`,
 * `ownerRef`, `agentId`, `createdAt`, `version`) are rejected because the
 * schema is strict and only lists mutable fields.
 */
export const marketplaceListingUpdateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    capabilities: z.array(agentCapabilitySchema).min(1).max(50).optional(),
    pricing: z.array(listingPricingSchema).max(20).optional(),
    availability: listingAvailabilitySchema.optional(),
    trust: listingTrustSchema.optional(),
    status: listingStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one mutable field is required',
  });

/** The full marketplace listing as returned by the catalog API. */
export const marketplaceListingSchema = z
  .object({
    id: z.string().min(1).max(128),
    ownerRef: z.string().min(1).max(256),
    agentId: z.string().min(1).max(128),
    title: z.string().min(1).max(200),
    description: z.string().max(2000),
    capabilities: z.array(agentCapabilitySchema).min(1).max(50),
    pricing: z.array(listingPricingSchema).max(20),
    availability: listingAvailabilitySchema,
    trust: listingTrustSchema,
    status: listingStatusSchema,
    version: z.number().int().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();
