import type { z } from 'zod';

import type {
  listingAvailabilitySchema,
  listingPricingSchema,
  listingStatusSchema,
  listingTrustSchema,
  marketplaceListingInputSchema,
  marketplaceListingSchema,
  marketplaceListingUpdateSchema,
} from './schemas.js';

/** Lifecycle status of a marketplace listing. */
export type ListingStatus = z.infer<typeof listingStatusSchema>;

/** Availability of the listed service (informational). */
export type ListingAvailability = z.infer<typeof listingAvailabilitySchema>;

/** Self-reported trust indicators (never treated as verified). */
export type ListingTrust = z.infer<typeof listingTrustSchema>;

/** A pricing model for the listed service. Informational metadata only. */
export type ListingPricing = z.infer<typeof listingPricingSchema>;

/** Input for creating a listing. */
export type MarketplaceListingInput = z.input<typeof marketplaceListingInputSchema>;

/** Input for updating the mutable fields of a listing. */
export type MarketplaceListingUpdateInput = z.input<typeof marketplaceListingUpdateSchema>;

/**
 * A marketplace listing: a registered agent offered as a discoverable service.
 * All fields are readonly; updates produce a new object via the domain
 * functions in `domain.ts`.
 *
 * Immutable fields (set at creation, never change): `id`, `ownerRef`,
 * `agentId`, `createdAt`. Mutable fields: `title`, `description`,
 * `capabilities`, `pricing`, `availability`, `trust`, `status`. `version`
 * increments monotonically on every update and `updatedAt` is bumped with it.
 *
 * Pricing models are informational metadata and are never used for payment;
 * trust indicators are self-reported and are never treated as verified.
 */
export type MarketplaceListing = z.infer<typeof marketplaceListingSchema>;
