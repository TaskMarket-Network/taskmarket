export {
  MARKETPLACE_CATALOG_ERROR_CODES,
  MarketplaceCatalogAgentInactiveError,
  MarketplaceCatalogAgentUnknownError,
  MarketplaceCatalogDatabaseError,
  MarketplaceCatalogDuplicateError,
  MarketplaceCatalogError,
  MarketplaceCatalogImmutableFieldError,
  MarketplaceCatalogInputError,
  MarketplaceCatalogNotFoundError,
  MarketplaceCatalogStatusTransitionError,
  MarketplaceCatalogVersionConflictError,
  type MarketplaceCatalogErrorCode,
} from './errors.js';

export {
  LISTING_STATUS_TRANSITIONS,
  applyListingUpdate,
  assertListingStatusTransition,
  createMarketplaceListing,
  type CatalogClock,
  type CatalogDeps,
} from './domain.js';

export { InMemoryCatalogRepository, type CatalogRepository } from './repository.js';

export { PostgresCatalogRepository } from './postgres.js';

export {
  listingAvailabilitySchema,
  listingPricingSchema,
  listingStatusSchema,
  listingTrustSchema,
  marketplaceListingInputSchema,
  marketplaceListingSchema,
  marketplaceListingUpdateSchema,
} from './schemas.js';

export {
  buildMarketplaceCatalogOpenApi,
  createMarketplaceCatalogService,
  MARKETPLACE_CATALOG_API_SUPPORTED_VERSIONS,
  MARKETPLACE_CATALOG_API_VERSION,
  type MarketplaceCatalogAction,
  type MarketplaceCatalogApiContractVersion,
  type MarketplaceCatalogCreatePayload,
  type MarketplaceCatalogErrorBody,
  type MarketplaceCatalogGetPayload,
  type MarketplaceCatalogLifecyclePayload,
  type MarketplaceCatalogListPayload,
  type MarketplaceCatalogOpenApiDocument,
  type MarketplaceCatalogOpenApiOptions,
  type MarketplaceCatalogOptions,
  type MarketplaceCatalogParseResult,
  type MarketplaceCatalogRequest,
  type MarketplaceCatalogRequestId,
  type MarketplaceCatalogResponse,
  type MarketplaceCatalogService,
  type MarketplaceCatalogUpdatePayload,
} from './catalog/index.js';

export {
  buildMarketplaceCatalogSearchOpenApi,
  createMarketplaceCatalogSearchService,
  MARKETPLACE_CATALOG_SEARCH_API_SUPPORTED_VERSIONS,
  MARKETPLACE_CATALOG_SEARCH_API_VERSION,
  MARKETPLACE_SEARCH_FRESHNESS_WINDOW_MS,
  MARKETPLACE_SEARCH_WEIGHTS,
  scoreListing,
  searchMarketplaceListings,
  type MarketplaceCatalogSearchApiContractVersion,
  type MarketplaceCatalogSearchOpenApiDocument,
  type MarketplaceCatalogSearchOpenApiOptions,
  type MarketplaceCatalogSearchOptions,
  type MarketplaceCatalogSearchService,
  type MarketplaceSearchError,
  type MarketplaceSearchItem,
  type MarketplaceSearchParseResult,
  type MarketplaceSearchQuery,
  type MarketplaceSearchRanking,
  type MarketplaceSearchResponse,
  type MarketplaceSearchResult,
  type MarketplaceSearchSignal,
  type MarketplaceSearchSortBy,
  type MarketplaceSearchSortDirection,
} from './search/index.js';

export type {
  ListingAvailability,
  ListingPricing,
  ListingStatus,
  ListingTrust,
  MarketplaceListing,
  MarketplaceListingInput,
  MarketplaceListingUpdateInput,
} from './types.js';
