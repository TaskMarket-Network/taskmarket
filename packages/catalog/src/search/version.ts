/** The current version of the TaskMarket marketplace catalog search contract. */
export const MARKETPLACE_CATALOG_SEARCH_API_VERSION = '1.0.0';

/** Contract versions this implementation understands. */
export const MARKETPLACE_CATALOG_SEARCH_API_SUPPORTED_VERSIONS = ['1.0.0'] as const;
export type MarketplaceCatalogSearchApiContractVersion =
  (typeof MARKETPLACE_CATALOG_SEARCH_API_SUPPORTED_VERSIONS)[number];
