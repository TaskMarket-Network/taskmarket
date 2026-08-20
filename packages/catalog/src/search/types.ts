import type { z } from 'zod';

import type {
  marketplaceSearchErrorSchema,
  marketplaceSearchItemSchema,
  marketplaceSearchQuerySchema,
  marketplaceSearchRankingSchema,
  marketplaceSearchResultSchema,
  marketplaceSearchSignalSchema,
  marketplaceSearchSortBySchema,
  marketplaceSearchSortDirectionSchema,
} from './schemas.js';
import type { MarketplaceCatalogSearchOpenApiDocument } from './openapi.js';
import type { CatalogRepository } from '../repository.js';
import type { AgentRegistryRepository } from '@taskmarket/agent-registry';

/** A validated marketplace search query. */
export type MarketplaceSearchQuery = z.infer<typeof marketplaceSearchQuerySchema>;

/** Ranking inputs: the sort field and direction used to order results. */
export type MarketplaceSearchSortBy = z.infer<typeof marketplaceSearchSortBySchema>;
export type MarketplaceSearchSortDirection = z.infer<typeof marketplaceSearchSortDirectionSchema>;

/** One ranked signal behind a listing's score. */
export type MarketplaceSearchSignal = z.infer<typeof marketplaceSearchSignalSchema>;

/** The explainable ranking for one listing. */
export type MarketplaceSearchRanking = z.infer<typeof marketplaceSearchRankingSchema>;

/** Safe search projection of a published listing. */
export type MarketplaceSearchItem = z.infer<typeof marketplaceSearchItemSchema>;

/** The result of a marketplace search query. */
export type MarketplaceSearchResult = z.infer<typeof marketplaceSearchResultSchema>;

/** Structured error carried by a failed search response. */
export type MarketplaceSearchError = z.infer<typeof marketplaceSearchErrorSchema>;

/** Discriminated result of parsing a search query at the trust boundary. */
export type MarketplaceSearchParseResult =
  { ok: true; query: MarketplaceSearchQuery } | { ok: false; error: MarketplaceSearchError };

/** Discriminated response of a search query (never throws). */
export type MarketplaceSearchResponse =
  { ok: true; result: MarketplaceSearchResult } | { ok: false; error: MarketplaceSearchError };

/**
 * The transport-agnostic marketplace search service: searchable, filterable,
 * ranked, paginated discovery of published listings with an explainable,
 * deterministic ranking that never trusts self-reported reputation or price
 * blindly. Read-only and public.
 */
export interface MarketplaceCatalogSearchService {
  /** The catalog repository the service searches through. */
  readonly repository: CatalogRepository;
  /** The agent registry repository used to join agent names. */
  readonly agentRepository: AgentRegistryRepository;
  /** The search contract version this service speaks. */
  contractVersion(): string;
  /**
   * Validate an external search query at the trust boundary. Returns a
   * discriminated result; adapters may route on it.
   */
  parseQuery(input: unknown): MarketplaceSearchParseResult;
  /**
   * Execute a search query end to end. Always resolves to a structured
   * {@link MarketplaceSearchResponse}; malformed queries produce a structured
   * error response rather than throwing.
   */
  search(input: unknown): Promise<MarketplaceSearchResponse>;
  /** Generated OpenAPI 3.1 documentation for marketplace search. */
  openapi(): MarketplaceCatalogSearchOpenApiDocument;
}
