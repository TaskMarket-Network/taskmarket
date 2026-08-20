import { randomUUID } from 'node:crypto';

import { MarketplaceCatalogInputError, MarketplaceCatalogStatusTransitionError } from './errors.js';
import { marketplaceListingInputSchema, marketplaceListingUpdateSchema } from './schemas.js';
import type {
  ListingStatus,
  MarketplaceListing,
  MarketplaceListingInput,
  MarketplaceListingUpdateInput,
} from './types.js';

/** Injectable clock returning epoch milliseconds (deterministic tests). */
export type CatalogClock = () => number;

/** Injectable id factories (deterministic tests). */
export interface CatalogDeps {
  /** Clock returning epoch milliseconds. Defaults to `Date.now`. */
  clock?: CatalogClock;
  /** Factory for listing ids. Defaults to `randomUUID`. */
  listingIdFactory?: () => string;
}

/** Allowed status transitions. `draft -> published -> paused -> delisted`. */
export const LISTING_STATUS_TRANSITIONS: Readonly<Record<ListingStatus, readonly ListingStatus[]>> =
  {
    draft: ['published', 'delisted'],
    published: ['paused', 'delisted'],
    paused: ['published', 'delisted'],
    delisted: [],
  };

/** Throw when `from -> to` is not an allowed listing status transition. */
export function assertListingStatusTransition(from: ListingStatus, to: ListingStatus): void {
  if (from === to) {
    return;
  }
  if (!LISTING_STATUS_TRANSITIONS[from].includes(to)) {
    throw new MarketplaceCatalogStatusTransitionError(from, to);
  }
}

function epochIso(now: number): string {
  return new Date(now).toISOString();
}

/**
 * Create a marketplace listing from validated input. Immutable fields (`id`,
 * `ownerRef`, `agentId`, `createdAt`) are set here and never change; `version`
 * starts at 1. Returns a new readonly domain object.
 *
 * The caller (the catalog service) is responsible for enforcing ownership of
 * the referenced agent and that `capabilities` is a subset of the agent's
 * declared capabilities; this function only validates the shape of the input.
 */
export function createMarketplaceListing(
  input: MarketplaceListingInput,
  deps: CatalogDeps = {},
): MarketplaceListing {
  const parsed = marketplaceListingInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new MarketplaceCatalogInputError(parsed.error.issues.map((issue) => issue.message));
  }

  const clock = deps.clock ?? Date.now;
  const listingIdFactory = deps.listingIdFactory ?? randomUUID;
  const now = epochIso(clock());

  return {
    id: parsed.data.id ?? listingIdFactory(),
    ownerRef: parsed.data.ownerRef,
    agentId: parsed.data.agentId,
    title: parsed.data.title,
    description: parsed.data.description,
    capabilities: [...parsed.data.capabilities],
    pricing: parsed.data.pricing.map((pricing) => ({ ...pricing })),
    availability: { ...parsed.data.availability },
    trust: { ...parsed.data.trust },
    status: parsed.data.status,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Apply an update to a listing's mutable fields. Immutable fields are rejected
 * at the input boundary (the schema only admits mutable fields). Status changes
 * are validated against the allowed transitions. Returns a new domain object
 * with `version` incremented and `updatedAt` bumped; the input object is never
 * mutated.
 */
export function applyListingUpdate(
  listing: MarketplaceListing,
  input: MarketplaceListingUpdateInput,
  deps: CatalogDeps = {},
): MarketplaceListing {
  const parsed = marketplaceListingUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new MarketplaceCatalogInputError(parsed.error.issues.map((issue) => issue.message));
  }

  if (parsed.data.status !== undefined) {
    assertListingStatusTransition(listing.status, parsed.data.status);
  }

  const clock = deps.clock ?? Date.now;
  const now = epochIso(clock());

  const next: MarketplaceListing = {
    id: listing.id,
    ownerRef: listing.ownerRef,
    agentId: listing.agentId,
    title: parsed.data.title ?? listing.title,
    description: parsed.data.description ?? listing.description,
    capabilities: parsed.data.capabilities
      ? [...parsed.data.capabilities]
      : [...listing.capabilities],
    pricing: parsed.data.pricing
      ? parsed.data.pricing.map((pricing) => ({ ...pricing }))
      : listing.pricing.map((pricing) => ({ ...pricing })),
    availability: parsed.data.availability
      ? { ...parsed.data.availability }
      : { ...listing.availability },
    trust: parsed.data.trust ? { ...parsed.data.trust } : { ...listing.trust },
    status: parsed.data.status ?? listing.status,
    version: listing.version + 1,
    createdAt: listing.createdAt,
    updatedAt: now,
  };

  return next;
}
