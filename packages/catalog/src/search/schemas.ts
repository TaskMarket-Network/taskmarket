import { z } from 'zod';

import { agentCapabilitySchema } from '@taskmarket/agent-registry';

import {
  listingAvailabilitySchema,
  listingPricingSchema,
  listingTrustSchema,
} from '../schemas.js';
import { MARKETPLACE_CATALOG_SEARCH_API_VERSION } from './version.js';

/** Ranking inputs: the sort field and direction used to order results. */
export const marketplaceSearchSortBySchema = z.enum([
  'relevance',
  'updatedAt',
  'createdAt',
  'rating',
  'name',
]);
export const marketplaceSearchSortDirectionSchema = z.enum(['asc', 'desc']);

/**
 * A validated marketplace search query. All filters combine with AND:
 * - `query`: case-insensitive substring over title, description, capabilities,
 *   and agent name.
 * - `capabilities`: listings must offer every requested key (exact match).
 * - `namespaces`: listings must offer at least one capability in a requested
 *   namespace (any match within the group).
 * - `agentId`: only listings referencing this agent.
 * - `availability`: only listings with this availability status.
 * - `pricingCurrency`: only listings with a pricing model in this currency.
 *
 * Only `published` listings are discoverable. An empty query returns all
 * published listings (browse), paged by `limit`/`offset`.
 */
export const marketplaceSearchQuerySchema = z
  .object({
    query: z.string().max(256).optional(),
    capabilities: z.array(agentCapabilitySchema).max(50).optional(),
    namespaces: z.array(agentCapabilitySchema).max(50).optional(),
    agentId: z.string().min(1).max(128).optional(),
    availability: listingAvailabilitySchema.shape.status.optional(),
    pricingCurrency: z.string().min(1).max(16).optional(),
    sortBy: marketplaceSearchSortBySchema.default('relevance'),
    sortDirection: marketplaceSearchSortDirectionSchema.default('desc'),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();

/**
 * One ranked signal behind a listing's score: `contribution = value * weight`.
 * Values are normalized to 0..1 so contributions are comparable. Signal names
 * identify self-reported inputs (`selfReportedRating`, `selfReportedCompletion`)
 * so callers can see exactly which signals were down-weighted.
 */
export const marketplaceSearchSignalSchema = z
  .object({
    name: z.string().min(1),
    value: z.number().min(0).max(1),
    weight: z.number().min(0),
    contribution: z.number().min(0),
    note: z.string().max(256).optional(),
  })
  .strict();

/**
 * The explainable ranking for one listing. `score` is the sum of signal
 * contributions; `signals` lists every signal that contributed; `explanation`
 * is a short, human/agent-readable account of why the listing ranked where it
 * did. Ranking never trusts self-reported reputation or price blindly: price
 * is excluded from the score entirely and self-reported signals carry small
 * fixed weights.
 */
export const marketplaceSearchRankingSchema = z
  .object({
    score: z.number().min(0),
    signals: z.array(marketplaceSearchSignalSchema).max(16),
    explanation: z.string().min(1).max(1024),
  })
  .strict();

/**
 * A safe search projection of a published listing. Endpoint/agent metadata is
 * not exposed here, and trust indicators remain explicitly self-reported. The
 * `ranking` block makes the ordering transparent.
 */
export const marketplaceSearchItemSchema = z
  .object({
    id: z.string().min(1).max(128),
    agentId: z.string().min(1).max(128),
    agentName: z.string().min(1).max(256),
    title: z.string().min(1).max(200),
    description: z.string().max(2000),
    capabilities: z.array(agentCapabilitySchema).min(1).max(50),
    pricing: z.array(listingPricingSchema).max(20),
    availability: listingAvailabilitySchema,
    trust: listingTrustSchema,
    status: z.literal('published'),
    version: z.number().int().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    ranking: marketplaceSearchRankingSchema,
  })
  .strict();

/** The result of a marketplace search query. */
export const marketplaceSearchResultSchema = z
  .object({
    contractVersion: z.literal(MARKETPLACE_CATALOG_SEARCH_API_VERSION),
    total: z.number().int().min(0),
    limit: z.number().int().min(1),
    offset: z.number().int().min(0),
    items: z.array(marketplaceSearchItemSchema),
  })
  .strict();

/** Structured error carried by a failed search response. */
export const marketplaceSearchErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    issues: z.array(z.string()).optional(),
  })
  .strict();