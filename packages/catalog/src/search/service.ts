import { MARKETPLACE_CATALOG_ERROR_CODES, MarketplaceCatalogError } from '../errors.js';
import type { CatalogRepository } from '../repository.js';
import {
  buildMarketplaceCatalogSearchOpenApi,
  type MarketplaceCatalogSearchOpenApiDocument,
  type MarketplaceCatalogSearchOpenApiOptions,
} from './openapi.js';
import { marketplaceSearchQuerySchema } from './schemas.js';
import { searchMarketplaceListings } from './search.js';
import type {
  MarketplaceSearchError,
  MarketplaceSearchParseResult,
  MarketplaceSearchResponse,
  MarketplaceCatalogSearchService,
} from './types.js';
import { MARKETPLACE_CATALOG_SEARCH_API_VERSION } from './version.js';
import type { AgentRegistryRepository } from '@taskmarket/agent-registry';

export interface MarketplaceCatalogSearchOptions {
  /** Service name used as the OpenAPI title. */
  serviceName?: string;
  /** Service version used as the OpenAPI info version. */
  serviceVersion?: string;
  /** OpenAPI info description. */
  serviceDescription?: string;
  /** Base URL of the deployed service, emitted as an OpenAPI server. */
  baseUrl?: string;
  /** Clock used for the explainable freshness signal. Defaults to the current time. */
  now?: () => string;
}

/** Map any thrown error to a structured, secret-free error body. */
function toErrorBody(error: unknown): MarketplaceSearchError {
  if (error instanceof MarketplaceCatalogError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: MARKETPLACE_CATALOG_ERROR_CODES.INTERNAL,
    message: 'Unexpected internal error.',
  };
}

/**
 * Create the transport-agnostic marketplace search service. Queries are
 * validated at the trust boundary, search/rank/pagination run in pure code
 * (no dynamic SQL), only `published` listings are returned through a safe
 * projection, ranking is explainable and deterministic, and `search` always
 * resolves to a structured response (never throws).
 */
export function createMarketplaceCatalogSearchService(
  repository: CatalogRepository,
  agentRepository: AgentRegistryRepository,
  options: MarketplaceCatalogSearchOptions = {},
): MarketplaceCatalogSearchService {
  const parseQuery = (input: unknown): MarketplaceSearchParseResult => {
    const parsed = marketplaceSearchQuerySchema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message);
      return {
        ok: false,
        error: {
          code: MARKETPLACE_CATALOG_ERROR_CODES.REQUEST_INVALID,
          message: `Invalid marketplace search query: ${issues.join('; ')}`,
          issues,
        },
      };
    }
    return { ok: true, query: parsed.data };
  };

  const search = async (input: unknown): Promise<MarketplaceSearchResponse> => {
    const parsed = parseQuery(input);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    try {
      const now = (options.now ?? (() => new Date().toISOString()))();
      const [listings, agents] = await Promise.all([
        repository.listAll(),
        agentRepository.listAll(),
      ]);
      const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
      const result = searchMarketplaceListings(listings, agentNames, parsed.query, now);
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: toErrorBody(error) };
    }
  };

  const openapi = (): MarketplaceCatalogSearchOpenApiDocument => {
    const apiOptions: MarketplaceCatalogSearchOpenApiOptions = {};
    if (options.serviceName !== undefined) {
      apiOptions.serviceName = options.serviceName;
    }
    if (options.serviceVersion !== undefined) {
      apiOptions.serviceVersion = options.serviceVersion;
    }
    if (options.serviceDescription !== undefined) {
      apiOptions.serviceDescription = options.serviceDescription;
    }
    if (options.baseUrl !== undefined) {
      apiOptions.baseUrl = options.baseUrl;
    }
    return buildMarketplaceCatalogSearchOpenApi(apiOptions);
  };

  return {
    repository,
    agentRepository,
    contractVersion: () => MARKETPLACE_CATALOG_SEARCH_API_VERSION,
    parseQuery,
    search,
    openapi,
  };
}
