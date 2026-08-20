import type { z } from 'zod';

import type { AgentEndpointType } from '../types.js';
import type {
  capabilityDiscoveryErrorSchema,
  capabilityDiscoveryItemSchema,
  capabilityDiscoveryQuerySchema,
  capabilityDiscoveryResultSchema,
} from './schemas.js';
import type { CapabilityDiscoveryOpenApiDocument } from './openapi.js';
import type { AgentRegistryRepository } from '../repository.js';

/** A validated capability discovery query. */
export type CapabilityDiscoveryQuery = z.infer<typeof capabilityDiscoveryQuerySchema>;

/** Safe discovery projection of an active registered agent. */
export type CapabilityDiscoveryItem = z.infer<typeof capabilityDiscoveryItemSchema>;

/** The result of a capability discovery query. */
export type CapabilityDiscoveryResult = z.infer<typeof capabilityDiscoveryResultSchema>;

/** Structured error carried by a failed discovery response. */
export type CapabilityDiscoveryError = z.infer<typeof capabilityDiscoveryErrorSchema>;

/** Discriminated result of parsing a discovery query at the trust boundary. */
export type CapabilityDiscoveryParseResult =
  { ok: true; query: CapabilityDiscoveryQuery } | { ok: false; error: CapabilityDiscoveryError };

/** Discriminated response of a discovery query (never throws). */
export type CapabilityDiscoveryResponse =
  { ok: true; result: CapabilityDiscoveryResult } | { ok: false; error: CapabilityDiscoveryError };

/** Safe projection of an endpoint (metadata stripped). */
export interface CapabilityEndpoint {
  readonly id: string;
  readonly type: AgentEndpointType;
  readonly url: string;
}

/**
 * The transport-agnostic capability discovery service: searchable, ranked,
 * paginated agent capabilities for public use. Read-only; only `active`
 * agents are discoverable and only a safe projection is returned.
 */
export interface CapabilityDiscoveryService {
  /** The repository the service searches through. */
  readonly repository: AgentRegistryRepository;
  /** The discovery contract version this service speaks. */
  contractVersion(): string;
  /**
   * Validate an external discovery query at the trust boundary. Returns a
   * discriminated result; adapters may route on it.
   */
  parseQuery(input: unknown): CapabilityDiscoveryParseResult;
  /**
   * Execute a discovery query end to end. Always resolves to a structured
   * {@link CapabilityDiscoveryResponse}; malformed queries produce a
   * structured error response rather than throwing.
   */
  query(input: unknown): Promise<CapabilityDiscoveryResponse>;
  /** Generated OpenAPI 3.1 documentation for capability discovery. */
  openapi(): CapabilityDiscoveryOpenApiDocument;
}
