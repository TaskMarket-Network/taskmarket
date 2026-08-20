/** The current version of the TaskMarket marketplace catalog API contract. */
export const MARKETPLACE_CATALOG_API_VERSION = '1.0.0';

/** Contract versions this implementation understands. */
export const MARKETPLACE_CATALOG_API_SUPPORTED_VERSIONS = ['1.0.0'] as const;
export type MarketplaceCatalogApiContractVersion =
  (typeof MARKETPLACE_CATALOG_API_SUPPORTED_VERSIONS)[number];
