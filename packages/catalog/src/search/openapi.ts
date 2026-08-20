import { zodToJsonSchema } from '@taskmarket/agent-registry';

import {
  marketplaceSearchErrorSchema,
  marketplaceSearchItemSchema,
  marketplaceSearchQuerySchema,
  marketplaceSearchResultSchema,
} from './schemas.js';
import { MARKETPLACE_CATALOG_SEARCH_API_VERSION } from './version.js';

/** OpenAPI 3.1 document describing the marketplace search API. */
export interface MarketplaceCatalogSearchOpenApiDocument {
  openapi: '3.1.0';
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers?: { url: string; description?: string }[];
  paths: Record<string, unknown>;
  components: { schemas: Record<string, unknown> };
}

export interface MarketplaceCatalogSearchOpenApiOptions {
  /** Service name used as the OpenAPI title. Defaults to `TaskMarket Marketplace Search`. */
  serviceName?: string;
  /** Service version used as the OpenAPI info version. Defaults to the contract version. */
  serviceVersion?: string;
  /** OpenAPI info description. */
  serviceDescription?: string;
  /** Base URL of the deployed service, emitted as an OpenAPI server. */
  baseUrl?: string;
}

const jsonSchemaRef = (name: string): Record<string, unknown> => ({
  $ref: `#/components/schemas/${name}`,
});

/**
 * Build a clear, transport-agnostic OpenAPI 3.1 document for marketplace
 * search: a single search operation whose query/result schemas are derived
 * from the same Zod schemas the service validates against, so the docs never
 * drift from the validated contract.
 */
export function buildMarketplaceCatalogSearchOpenApi(
  options: MarketplaceCatalogSearchOpenApiOptions = {},
): MarketplaceCatalogSearchOpenApiDocument {
  const document: MarketplaceCatalogSearchOpenApiDocument = {
    openapi: '3.1.0',
    info: {
      title: options.serviceName ?? 'TaskMarket Marketplace Search',
      version: options.serviceVersion ?? MARKETPLACE_CATALOG_SEARCH_API_VERSION,
      description:
        options.serviceDescription ??
        'Searchable, filterable, ranked, paginated discovery of published marketplace listings (read-only). Ranking is explainable and never trusts self-reported reputation or price blindly.',
    },
    paths: {
      '/listings/search': {
        post: {
          operationId: 'searchListings',
          summary: 'Search published marketplace listings.',
          description:
            'Returns a safe projection of published listings matching the requested capabilities (AND), namespaces (any), free-text query, agent, availability, and pricing currency, ranked and paginated. Each item carries an explainable ranking breakdown; price is excluded from the score and self-reported signals are down-weighted.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: jsonSchemaRef('MarketplaceSearchQuery'),
              },
            },
          },
          responses: {
            '200': {
              description: 'Structured marketplace search result.',
              content: {
                'application/json': {
                  schema: jsonSchemaRef('MarketplaceSearchResult'),
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        MarketplaceSearchQuery: zodToJsonSchema(marketplaceSearchQuerySchema),
        MarketplaceSearchResult: zodToJsonSchema(marketplaceSearchResultSchema),
        MarketplaceSearchItem: zodToJsonSchema(marketplaceSearchItemSchema),
        MarketplaceSearchError: zodToJsonSchema(marketplaceSearchErrorSchema),
      },
    },
  };

  if (options.baseUrl !== undefined && options.baseUrl.length > 0) {
    document.servers = [{ url: options.baseUrl }];
  }

  return document;
}