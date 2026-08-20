import type { z } from 'zod';

import type { MarketplaceListing } from '../types.js';
import type {
  marketplaceCatalogActionSchema,
  marketplaceCatalogCreatePayloadSchema,
  marketplaceCatalogErrorSchema,
  marketplaceCatalogGetPayloadSchema,
  marketplaceCatalogLifecyclePayloadSchema,
  marketplaceCatalogListPayloadSchema,
  marketplaceCatalogRequestIdSchema,
  marketplaceCatalogRequestSchema,
  marketplaceCatalogUpdatePayloadSchema,
} from './schemas.js';
import type { MarketplaceCatalogOpenApiDocument } from './openapi.js';
import type { CatalogRepository } from '../repository.js';
import type { AgentRegistryRepository } from '@taskmarket/agent-registry';

/** An operation exposed by the marketplace catalog API. */
export type MarketplaceCatalogAction = z.infer<typeof marketplaceCatalogActionSchema>;

/** Validator-conformant request id. */
export type MarketplaceCatalogRequestId = z.infer<typeof marketplaceCatalogRequestIdSchema>;

/** The external request envelope (payload is validated per action). */
export type MarketplaceCatalogRequest = z.infer<typeof marketplaceCatalogRequestSchema>;

/** The external response envelope as a discriminated union. */
export type MarketplaceCatalogResponse =
  | {
      contractVersion: string;
      requestId: string;
      action: string;
      ok: true;
      listing: MarketplaceListing;
      listings?: never;
      error?: never;
      timestamp: string;
    }
  | {
      contractVersion: string;
      requestId: string;
      action: string;
      ok: true;
      listings: MarketplaceListing[];
      listing?: never;
      error?: never;
      timestamp: string;
    }
  | {
      contractVersion: string;
      requestId: string;
      action: string;
      ok: false;
      error: MarketplaceCatalogErrorBody;
      listing?: never;
      listings?: never;
      timestamp: string;
    };

/** Structured error carried inside a failed response. */
export type MarketplaceCatalogErrorBody = z.infer<typeof marketplaceCatalogErrorSchema>;

/** Discriminated result of parsing an external payload at the trust boundary. */
export type MarketplaceCatalogParseResult =
  | { ok: true; request: MarketplaceCatalogRequest }
  | { ok: false; error: MarketplaceCatalogErrorBody };

/** Typed per-action payloads (validated by `parseRequest`). */
export type MarketplaceCatalogCreatePayload = z.infer<typeof marketplaceCatalogCreatePayloadSchema>;
export type MarketplaceCatalogUpdatePayload = z.infer<typeof marketplaceCatalogUpdatePayloadSchema>;
export type MarketplaceCatalogGetPayload = z.infer<typeof marketplaceCatalogGetPayloadSchema>;
export type MarketplaceCatalogListPayload = z.infer<typeof marketplaceCatalogListPayloadSchema>;
export type MarketplaceCatalogLifecyclePayload = z.infer<
  typeof marketplaceCatalogLifecyclePayloadSchema
>;

/**
 * The transport-agnostic marketplace catalog boundary: manages marketplace
 * listings over a {@link CatalogRepository}, reading registered agents through
 * an {@link AgentRegistryRepository} to enforce agent ownership and
 * capability-subset rules. Exposes create/update/get/list/publish/pause/delist
 * behind a validated envelope with an ownership authorization boundary,
 * optimistic-concurrency updates, idempotent create, and generated OpenAPI
 * documentation. Discovery/catalog only — never payment or execution.
 */
export interface MarketplaceCatalogService {
  /** The catalog repository the service persists through. */
  readonly repository: CatalogRepository;
  /** The agent registry repository used for agent ownership/capability checks. */
  readonly agentRepository: AgentRegistryRepository;
  /** The API contract version this service speaks. */
  contractVersion(): string;
  /**
   * Validate an external payload against the request envelope and the
   * per-action payload at the trust boundary. Returns a discriminated result;
   * adapters may route on it.
   */
  parseRequest(input: unknown): MarketplaceCatalogParseResult;
  /**
   * Execute an external request end to end. Always resolves to a structured
   * {@link MarketplaceCatalogResponse}; malformed or unauthorized requests
   * produce a structured error response rather than throwing.
   */
  handle(input: unknown): Promise<MarketplaceCatalogResponse>;
  /** Generated OpenAPI 3.1 documentation for the marketplace catalog API. */
  openapi(): MarketplaceCatalogOpenApiDocument;
}
