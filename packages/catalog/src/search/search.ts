import { capabilityNamespace } from '@taskmarket/agent-registry';

import type { MarketplaceListing } from '../types.js';
import { scoreListing } from './ranking.js';
import type {
  MarketplaceSearchItem,
  MarketplaceSearchQuery,
  MarketplaceSearchResult,
} from './types.js';
import { MARKETPLACE_CATALOG_SEARCH_API_VERSION } from './version.js';

/** Filtering, ranking, and pagination are pure and unit-testable. */

interface ScoredListing {
  item: MarketplaceSearchItem;
  score: number;
  rating: number;
}

/** Only `published` listings are discoverable. */
function isDiscoverable(listing: MarketplaceListing): boolean {
  return listing.status === 'published';
}

/** A listing matches the query when all filter groups agree (AND). */
function matches(
  listing: MarketplaceListing,
  agentName: string,
  query: MarketplaceSearchQuery,
): boolean {
  const requestedCapabilities = query.capabilities ?? [];
  if (requestedCapabilities.length > 0) {
    for (const key of requestedCapabilities) {
      if (!listing.capabilities.includes(key)) {
        return false;
      }
    }
  }

  const requestedNamespaces = query.namespaces ?? [];
  if (requestedNamespaces.length > 0) {
    const offeredNamespaces = new Set(
      listing.capabilities
        .map((key) => capabilityNamespace(key))
        .filter((namespace): namespace is string => namespace !== null),
    );
    if (!requestedNamespaces.some((namespace) => offeredNamespaces.has(namespace))) {
      return false;
    }
  }

  if (query.agentId !== undefined && listing.agentId !== query.agentId) {
    return false;
  }

  if (query.availability !== undefined && listing.availability.status !== query.availability) {
    return false;
  }

  if (query.pricingCurrency !== undefined) {
    if (!listing.pricing.some((model) => model.currency === query.pricingCurrency)) {
      return false;
    }
  }

  const needle = query.query ?? '';
  if (needle.length > 0) {
    const haystack = [
      listing.title,
      listing.description,
      agentName,
      ...listing.capabilities,
    ]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(needle.toLowerCase())) {
      return false;
    }
  }

  return true;
}

/** Self-reported rating used by the `rating` sort (0 when absent). */
function selfReportedRating(listing: MarketplaceListing): number {
  const rating = listing.trust.rating;
  if (rating === undefined) {
    return 0;
  }
  const parsed = Number(rating);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Build the safe search projection for one listing. */
function toSearchItem(
  listing: MarketplaceListing,
  agentName: string,
  query: MarketplaceSearchQuery,
  now: string,
): MarketplaceSearchItem {
  const ranking = scoreListing(listing, agentName, query, now);
  return {
    id: listing.id,
    agentId: listing.agentId,
    agentName,
    title: listing.title,
    description: listing.description,
    capabilities: [...listing.capabilities],
    pricing: listing.pricing.map((model) => ({ ...model })),
    availability: { ...listing.availability },
    trust: { ...listing.trust },
    status: 'published',
    version: listing.version,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    ranking,
  };
}

/** Compare two scored listings by the requested sort field and direction. */
function compareScored(a: ScoredListing, b: ScoredListing, query: MarketplaceSearchQuery): number {
  const direction = query.sortDirection;
  let comparison: number;
  switch (query.sortBy) {
    case 'relevance':
      comparison = a.score - b.score;
      break;
    case 'updatedAt':
      comparison = a.item.updatedAt.localeCompare(b.item.updatedAt);
      break;
    case 'createdAt':
      comparison = a.item.createdAt.localeCompare(b.item.createdAt);
      break;
    case 'rating':
      comparison = a.rating - b.rating;
      break;
    case 'name':
      comparison = a.item.title.localeCompare(b.item.title);
      break;
  }
  if (comparison !== 0) {
    return direction === 'asc' ? comparison : -comparison;
  }
  // Deterministic tiebreak: stable id ordering regardless of direction.
  return a.item.id.localeCompare(b.item.id);
}

/**
 * Search, rank, and paginate marketplace listings. Only `published` listings
 * are candidates, ranking is explainable and deterministic for a fixed `now`,
 * and the caller is responsible for validating the query at the trust boundary
 * first (see `marketplaceSearchQuerySchema`).
 */
export function searchMarketplaceListings(
  listings: readonly MarketplaceListing[],
  agentNames: ReadonlyMap<string, string>,
  query: MarketplaceSearchQuery,
  now: string,
): MarketplaceSearchResult {
  const scored: ScoredListing[] = [];
  for (const listing of listings) {
    if (!isDiscoverable(listing)) {
      continue;
    }
    const agentName = agentNames.get(listing.agentId) ?? listing.agentId;
    if (!matches(listing, agentName, query)) {
      continue;
    }
    const item = toSearchItem(listing, agentName, query, now);
    scored.push({ item, score: item.ranking.score, rating: selfReportedRating(listing) });
  }
  scored.sort((a, b) => compareScored(a, b, query));

  const total = scored.length;
  const items = scored
    .slice(query.offset, query.offset + query.limit)
    .map((entry) => entry.item);

  return {
    contractVersion: MARKETPLACE_CATALOG_SEARCH_API_VERSION,
    total,
    limit: query.limit,
    offset: query.offset,
    items,
  };
}