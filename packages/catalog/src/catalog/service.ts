import {
  MARKETPLACE_CATALOG_ERROR_CODES,
  MarketplaceCatalogAgentInactiveError,
  MarketplaceCatalogAgentUnknownError,
  MarketplaceCatalogDuplicateError,
  MarketplaceCatalogError,
  MarketplaceCatalogInputError,
  MarketplaceCatalogNotFoundError,
  MarketplaceCatalogVersionConflictError,
} from '../errors.js';
import { applyListingUpdate, createMarketplaceListing, type CatalogDeps } from '../domain.js';
import type { CatalogRepository } from '../repository.js';
import type { MarketplaceListing } from '../types.js';
import type { AgentRegistryRepository, RegisteredAgent } from '@taskmarket/agent-registry';
import {
  buildMarketplaceCatalogOpenApi,
  type MarketplaceCatalogOpenApiDocument,
  type MarketplaceCatalogOpenApiOptions,
} from './openapi.js';
import { marketplaceCatalogPayloadSchemas, marketplaceCatalogRequestSchema } from './schemas.js';
import type {
  MarketplaceCatalogCreatePayload,
  MarketplaceCatalogErrorBody,
  MarketplaceCatalogGetPayload,
  MarketplaceCatalogLifecyclePayload,
  MarketplaceCatalogParseResult,
  MarketplaceCatalogRequest,
  MarketplaceCatalogResponse,
  MarketplaceCatalogService,
  MarketplaceCatalogUpdatePayload,
} from './types.js';
import { MARKETPLACE_CATALOG_API_VERSION } from './version.js';

export interface MarketplaceCatalogOptions {
  /** Service name used as the OpenAPI title. */
  serviceName?: string;
  /** Service version used as the OpenAPI info version. */
  serviceVersion?: string;
  /** OpenAPI info description. */
  serviceDescription?: string;
  /** Base URL of the deployed service, emitted as an OpenAPI server. */
  baseUrl?: string;
  /** Injectable clock and id factories (deterministic tests). */
  deps?: CatalogDeps;
}

/** Request ID used when an external payload cannot be parsed safely. */
const MALFORMED_REQUEST_ID = 'tmc_unknown';

/** Best-effort request ID extracted from a malformed payload (safe only). */
function safeRequestIdOf(input: unknown): string {
  const candidate =
    typeof input === 'object' && input !== null && 'requestId' in input
      ? String((input as { requestId?: unknown }).requestId).slice(0, 128)
      : MALFORMED_REQUEST_ID;
  return /^[A-Za-z0-9._-]+$/.test(candidate) ? candidate : MALFORMED_REQUEST_ID;
}

/** Best-effort action extracted from a malformed payload (bounded). */
function safeActionOf(input: unknown): string {
  if (typeof input === 'object' && input !== null && 'action' in input) {
    const value = String((input as { action?: unknown }).action).slice(0, 128);
    return value.length > 0 ? value : 'unknown';
  }
  return 'unknown';
}

/** Serialize the owner-controlled listing content for idempotent replay. */
function listingKey(listing: MarketplaceListing): string {
  return JSON.stringify({
    ownerRef: listing.ownerRef,
    agentId: listing.agentId,
    title: listing.title,
    description: listing.description,
    capabilities: listing.capabilities,
    pricing: listing.pricing,
    availability: listing.availability,
    trust: listing.trust,
    status: listing.status,
  });
}

/** Return capability keys not declared by the referenced agent. */
function undeclaredCapabilities(
  requested: readonly string[],
  agentCapabilities: readonly string[],
): string[] {
  return requested.filter((capability) => !agentCapabilities.includes(capability));
}

/** Map any thrown error to a structured, secret-free error body. */
function toErrorBody(error: unknown): MarketplaceCatalogErrorBody {
  if (error instanceof MarketplaceCatalogInputError) {
    return { code: error.code, message: error.message, issues: [...error.issues] };
  }
  if (error instanceof MarketplaceCatalogError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: MARKETPLACE_CATALOG_ERROR_CODES.INTERNAL,
    message: 'Unexpected internal error.',
  };
}

/**
 * Create the transport-agnostic marketplace catalog service. All external
 * input is validated at the trust boundary (`parseRequest`), every operation
 * enforces the ownership authorization boundary against the supplied
 * `principal`, listing capabilities must be a subset of the referenced agent's
 * declared capabilities, publishing requires an `active` agent, updates use
 * optimistic concurrency via the repository `save`, and `handle` always
 * resolves to a structured response (never throws).
 *
 * The `principal` is an authentication placeholder: a real adapter replaces it
 * with a verified identity after authenticating the caller.
 */
export function createMarketplaceCatalogService(
  repository: CatalogRepository,
  agentRepository: AgentRegistryRepository,
  options: MarketplaceCatalogOptions = {},
): MarketplaceCatalogService {
  const deps = options.deps ?? {};
  const clock = deps.clock ?? Date.now;

  const parseRequest = (input: unknown): MarketplaceCatalogParseResult => {
    const envelope = marketplaceCatalogRequestSchema.safeParse(input);
    if (!envelope.success) {
      return {
        ok: false,
        error: {
          code: MARKETPLACE_CATALOG_ERROR_CODES.REQUEST_INVALID,
          message: envelope.error.issues.map((issue) => issue.message).join('; '),
        },
      };
    }

    const request = envelope.data;
    if (request.contractVersion !== MARKETPLACE_CATALOG_API_VERSION) {
      return {
        ok: false,
        error: {
          code: MARKETPLACE_CATALOG_ERROR_CODES.UNSUPPORTED_VERSION,
          message: `Unsupported contract version "${request.contractVersion}" (supported: ${MARKETPLACE_CATALOG_API_VERSION}).`,
        },
      };
    }

    const payloadSchema = marketplaceCatalogPayloadSchemas[request.action];
    const payload = payloadSchema.safeParse(request.payload);
    if (!payload.success) {
      const issues = payload.error.issues.map((issue) => issue.message);
      return {
        ok: false,
        error: {
          code: MARKETPLACE_CATALOG_ERROR_CODES.REQUEST_INVALID,
          message: `Invalid payload for action "${request.action}": ${issues.join('; ')}`,
          issues,
        },
      };
    }

    return { ok: true, request: { ...request, payload: payload.data } };
  };

  const unauthorizedError = (request: MarketplaceCatalogRequest): MarketplaceCatalogErrorBody => ({
    code: MARKETPLACE_CATALOG_ERROR_CODES.UNAUTHORIZED,
    message: `Principal "${request.principal}" is not authorized to act on this listing.`,
  });

  const loadAgentOrThrow = async (agentId: string): Promise<RegisteredAgent> => {
    const agent = await agentRepository.getById(agentId);
    if (agent === null) {
      throw new MarketplaceCatalogAgentUnknownError(agentId);
    }
    return agent;
  };

  const handleCreate = async (
    request: MarketplaceCatalogRequest,
    timestamp: string,
  ): Promise<MarketplaceCatalogResponse> => {
    const payload = request.payload as MarketplaceCatalogCreatePayload;
    if (payload.input.ownerRef !== request.principal) {
      return {
        contractVersion: MARKETPLACE_CATALOG_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: false,
        error: unauthorizedError(request),
        timestamp,
      };
    }

    const agent = await loadAgentOrThrow(payload.input.agentId);
    if (agent.ownerRef !== request.principal) {
      return {
        contractVersion: MARKETPLACE_CATALOG_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: false,
        error: unauthorizedError(request),
        timestamp,
      };
    }

    const undeclared = undeclaredCapabilities(payload.input.capabilities, agent.capabilities);
    if (undeclared.length > 0) {
      throw new MarketplaceCatalogInputError([
        `Listing capabilities must be declared by the agent: ${undeclared.join(', ')}.`,
      ]);
    }

    const listing = createMarketplaceListing(payload.input, deps);
    try {
      await repository.create(listing);
    } catch (error) {
      if (error instanceof MarketplaceCatalogDuplicateError) {
        const existing = await repository.getById(listing.id);
        if (
          existing !== null &&
          existing.ownerRef === request.principal &&
          listingKey(existing) === listingKey(listing)
        ) {
          return {
            contractVersion: MARKETPLACE_CATALOG_API_VERSION,
            requestId: request.requestId,
            action: request.action,
            ok: true,
            listing: existing,
            timestamp,
          };
        }
        return {
          contractVersion: MARKETPLACE_CATALOG_API_VERSION,
          requestId: request.requestId,
          action: request.action,
          ok: false,
          error: { code: error.code, message: error.message },
          timestamp,
        };
      }
      throw error;
    }

    return {
      contractVersion: MARKETPLACE_CATALOG_API_VERSION,
      requestId: request.requestId,
      action: request.action,
      ok: true,
      listing,
      timestamp,
    };
  };

  const handleUpdate = async (
    request: MarketplaceCatalogRequest,
    timestamp: string,
  ): Promise<MarketplaceCatalogResponse> => {
    const payload = request.payload as MarketplaceCatalogUpdatePayload;
    const existing = await repository.getById(payload.listingId);
    if (existing === null) {
      throw new MarketplaceCatalogNotFoundError(payload.listingId);
    }
    if (existing.ownerRef !== request.principal) {
      return {
        contractVersion: MARKETPLACE_CATALOG_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: false,
        error: unauthorizedError(request),
        timestamp,
      };
    }

    if (payload.update.capabilities !== undefined) {
      const agent = await loadAgentOrThrow(existing.agentId);
      const undeclared = undeclaredCapabilities(payload.update.capabilities, agent.capabilities);
      if (undeclared.length > 0) {
        throw new MarketplaceCatalogInputError([
          `Listing capabilities must be declared by the agent: ${undeclared.join(', ')}.`,
        ]);
      }
    }

    const updated = applyListingUpdate(existing, payload.update, deps);
    await repository.save(updated, payload.version);
    return {
      contractVersion: MARKETPLACE_CATALOG_API_VERSION,
      requestId: request.requestId,
      action: request.action,
      ok: true,
      listing: updated,
      timestamp,
    };
  };

  const handleGet = async (
    request: MarketplaceCatalogRequest,
    timestamp: string,
  ): Promise<MarketplaceCatalogResponse> => {
    const payload = request.payload as MarketplaceCatalogGetPayload;
    const existing = await repository.getById(payload.listingId);
    if (existing === null) {
      throw new MarketplaceCatalogNotFoundError(payload.listingId);
    }
    if (existing.ownerRef !== request.principal) {
      return {
        contractVersion: MARKETPLACE_CATALOG_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: false,
        error: unauthorizedError(request),
        timestamp,
      };
    }
    return {
      contractVersion: MARKETPLACE_CATALOG_API_VERSION,
      requestId: request.requestId,
      action: request.action,
      ok: true,
      listing: existing,
      timestamp,
    };
  };

  const handleList = async (
    request: MarketplaceCatalogRequest,
    timestamp: string,
  ): Promise<MarketplaceCatalogResponse> => {
    const listings = await repository.listByOwner(request.principal);
    return {
      contractVersion: MARKETPLACE_CATALOG_API_VERSION,
      requestId: request.requestId,
      action: request.action,
      ok: true,
      listings,
      timestamp,
    };
  };

  const handleLifecycle = async (
    request: MarketplaceCatalogRequest,
    timestamp: string,
  ): Promise<MarketplaceCatalogResponse> => {
    const payload = request.payload as MarketplaceCatalogLifecyclePayload;
    const existing = await repository.getById(payload.listingId);
    if (existing === null) {
      throw new MarketplaceCatalogNotFoundError(payload.listingId);
    }
    if (existing.ownerRef !== request.principal) {
      return {
        contractVersion: MARKETPLACE_CATALOG_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: false,
        error: unauthorizedError(request),
        timestamp,
      };
    }

    const nextStatus: MarketplaceListing['status'] =
      request.action === 'publish'
        ? 'published'
        : request.action === 'pause'
          ? 'paused'
          : 'delisted';

    // Idempotent lifecycle operation: an already-terminal-requested state
    // succeeds, but the optimistic-concurrency version is still enforced.
    if (existing.status === nextStatus) {
      if (existing.version !== payload.version) {
        throw new MarketplaceCatalogVersionConflictError(
          payload.listingId,
          payload.version,
          existing.version,
        );
      }
      return {
        contractVersion: MARKETPLACE_CATALOG_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: true,
        listing: existing,
        timestamp,
      };
    }

    if (request.action === 'publish') {
      const agent = await loadAgentOrThrow(existing.agentId);
      if (agent.status !== 'active') {
        throw new MarketplaceCatalogAgentInactiveError(existing.agentId);
      }
    }

    const updated = applyListingUpdate(existing, { status: nextStatus }, deps);
    await repository.save(updated, payload.version);
    return {
      contractVersion: MARKETPLACE_CATALOG_API_VERSION,
      requestId: request.requestId,
      action: request.action,
      ok: true,
      listing: updated,
      timestamp,
    };
  };

  const handle = async (input: unknown): Promise<MarketplaceCatalogResponse> => {
    const parsed = parseRequest(input);
    const timestamp = new Date(clock()).toISOString();

    if (!parsed.ok) {
      return {
        contractVersion: MARKETPLACE_CATALOG_API_VERSION,
        requestId: safeRequestIdOf(input),
        action: safeActionOf(input),
        ok: false,
        error: parsed.error,
        timestamp,
      };
    }

    const request = parsed.request;
    try {
      switch (request.action) {
        case 'create':
          return await handleCreate(request, timestamp);
        case 'update':
          return await handleUpdate(request, timestamp);
        case 'get':
          return await handleGet(request, timestamp);
        case 'list':
          return await handleList(request, timestamp);
        case 'publish':
        case 'pause':
        case 'delist':
          return await handleLifecycle(request, timestamp);
      }
    } catch (error) {
      return {
        contractVersion: MARKETPLACE_CATALOG_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: false,
        error: toErrorBody(error),
        timestamp,
      };
    }
  };

  const openapi = (): MarketplaceCatalogOpenApiDocument => {
    const apiOptions: MarketplaceCatalogOpenApiOptions = {};
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
    return buildMarketplaceCatalogOpenApi(apiOptions);
  };

  return {
    repository,
    agentRepository,
    contractVersion: () => MARKETPLACE_CATALOG_API_VERSION,
    parseRequest,
    handle,
    openapi,
  };
}
