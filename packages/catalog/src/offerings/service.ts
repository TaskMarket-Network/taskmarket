import type { AgentRegistryRepository, RegisteredAgent } from '@taskmarket/agent-registry';

import {
  MARKETPLACE_CATALOG_ERROR_CODES,
  MarketplaceCatalogAgentUnknownError,
  MarketplaceCatalogError,
  MarketplaceCatalogInputError,
} from '../errors.js';
import { applyServiceOfferingUpdate, createServiceOffering, type OfferingDeps } from './domain.js';
import {
  ServiceOfferingDuplicateError,
  ServiceOfferingInputError,
  ServiceOfferingNotFoundError,
  ServiceOfferingVersionConflictError,
} from './errors.js';
import { buildServiceOfferingOpenApi } from './openapi.js';
import type { ServiceOfferingRepository } from './repository.js';
import {
  serviceOfferingActionSchema,
  serviceOfferingCreatePayloadSchema,
  serviceOfferingErrorSchema,
  serviceOfferingGetPayloadSchema,
  serviceOfferingLifecyclePayloadSchema,
  serviceOfferingListPayloadSchema,
  serviceOfferingPayloadSchemas,
  serviceOfferingRequestIdSchema,
  serviceOfferingRequestSchema,
  serviceOfferingUpdatePayloadSchema,
} from './api.js';
import type { ServiceOffering } from './types.js';
import { SERVICE_OFFERING_API_VERSION } from './version.js';

import type { z } from 'zod';

/** An operation exposed by the service offerings API. */
export type ServiceOfferingAction = z.infer<typeof serviceOfferingActionSchema>;

/** Validator-conformant request id. */
export type ServiceOfferingRequestId = z.infer<typeof serviceOfferingRequestIdSchema>;

/** The external request envelope (payload is validated per action). */
export type ServiceOfferingRequest = z.infer<typeof serviceOfferingRequestSchema>;

/** The external response envelope as a discriminated union. */
export type ServiceOfferingResponse =
  | {
      contractVersion: string;
      requestId: string;
      action: string;
      ok: true;
      offering: ServiceOffering;
      offerings?: never;
      error?: never;
      timestamp: string;
    }
  | {
      contractVersion: string;
      requestId: string;
      action: string;
      ok: true;
      offerings: ServiceOffering[];
      offering?: never;
      error?: never;
      timestamp: string;
    }
  | {
      contractVersion: string;
      requestId: string;
      action: string;
      ok: false;
      error: ServiceOfferingErrorBody;
      offering?: never;
      offerings?: never;
      timestamp: string;
    };

/** Structured error carried inside a failed response. */
export type ServiceOfferingErrorBody = z.infer<typeof serviceOfferingErrorSchema>;

/** Discriminated result of parsing an external payload at the trust boundary. */
export type ServiceOfferingParseResult =
  { ok: true; request: ServiceOfferingRequest } | { ok: false; error: ServiceOfferingErrorBody };

/** Typed per-action payloads (validated by `parseRequest`). */
export type ServiceOfferingCreatePayload = z.infer<typeof serviceOfferingCreatePayloadSchema>;
export type ServiceOfferingUpdatePayload = z.infer<typeof serviceOfferingUpdatePayloadSchema>;
export type ServiceOfferingGetPayload = z.infer<typeof serviceOfferingGetPayloadSchema>;
export type ServiceOfferingListPayload = z.infer<typeof serviceOfferingListPayloadSchema>;
export type ServiceOfferingLifecyclePayload = z.infer<typeof serviceOfferingLifecyclePayloadSchema>;

export interface ServiceOfferingOptions {
  /** Service name used as the OpenAPI title. */
  serviceName?: string;
  /** Service version used as the OpenAPI info version. */
  serviceVersion?: string;
  /** OpenAPI info description. */
  serviceDescription?: string;
  /** Base URL of the deployed service, emitted as an OpenAPI server. */
  baseUrl?: string;
  /** Injectable clock and id factories (deterministic tests). */
  deps?: OfferingDeps;
}

/**
 * The transport-agnostic service offerings boundary: manages reusable service
 * definitions over a {@link ServiceOfferingRepository}, reading registered
 * agents through an {@link AgentRegistryRepository} to enforce agent ownership
 * and capability-subset rules. Exposes create/update/get/list/archive/activate
 * behind a validated envelope with an ownership authorization boundary,
 * optimistic-concurrency updates, idempotent create, and generated OpenAPI
 * documentation. Discovery/catalog only — never payment or execution.
 */
export interface ServiceOfferingService {
  /** The repository the service persists through. */
  readonly repository: ServiceOfferingRepository;
  /** The agent registry repository used for agent ownership/capability checks. */
  readonly agentRepository: AgentRegistryRepository;
  /** The API contract version this service speaks. */
  contractVersion(): string;
  /**
   * Validate an external payload against the request envelope and the
   * per-action payload at the trust boundary. Returns a discriminated result;
   * adapters may route on it.
   */
  parseRequest(input: unknown): ServiceOfferingParseResult;
  /**
   * Execute an external request end to end. Always resolves to a structured
   * {@link ServiceOfferingResponse}; malformed or unauthorized requests
   * produce a structured error response rather than throwing.
   */
  handle(input: unknown): Promise<ServiceOfferingResponse>;
  /** Generated OpenAPI 3.1 documentation for the service offerings API. */
  openapi(): ReturnType<typeof buildServiceOfferingOpenApi>;
}

/** Request ID used when an external payload cannot be parsed safely. */
const MALFORMED_REQUEST_ID = 'tso_unknown';

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

/** Serialize the owner-controlled offering content for idempotent replay. */
function offeringKey(offering: ServiceOffering): string {
  return JSON.stringify({
    ownerRef: offering.ownerRef,
    agentId: offering.agentId,
    name: offering.name,
    description: offering.description,
    capabilities: offering.capabilities,
    inputs: offering.inputs,
    outputs: offering.outputs,
    pricing: offering.pricing,
    estimatedExecutionTime: offering.estimatedExecutionTime,
    constraints: offering.constraints,
    status: offering.status,
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
function toErrorBody(error: unknown): ServiceOfferingErrorBody {
  if (error instanceof ServiceOfferingInputError) {
    return { code: error.code, message: error.message, issues: [...error.issues] };
  }
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
 * Create the transport-agnostic service offerings service. All external input
 * is validated at the trust boundary (`parseRequest`), every operation enforces
 * the ownership authorization boundary against the supplied `principal`,
 * offering capabilities must be a subset of the referenced agent's declared
 * capabilities, updates use optimistic concurrency via the repository `save`,
 * and `handle` always resolves to a structured response (never throws).
 *
 * The `principal` is an authentication placeholder: a real adapter replaces it
 * with a verified identity after authenticating the caller.
 */
export function createServiceOfferingService(
  repository: ServiceOfferingRepository,
  agentRepository: AgentRegistryRepository,
  options: ServiceOfferingOptions = {},
): ServiceOfferingService {
  const deps = options.deps ?? {};
  const clock = deps.clock ?? Date.now;

  const parseRequest = (input: unknown): ServiceOfferingParseResult => {
    const envelope = serviceOfferingRequestSchema.safeParse(input);
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
    if (request.contractVersion !== SERVICE_OFFERING_API_VERSION) {
      return {
        ok: false,
        error: {
          code: MARKETPLACE_CATALOG_ERROR_CODES.UNSUPPORTED_VERSION,
          message: `Unsupported contract version "${request.contractVersion}" (supported: ${SERVICE_OFFERING_API_VERSION}).`,
        },
      };
    }

    const payloadSchema = serviceOfferingPayloadSchemas[request.action];
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

  const unauthorizedError = (request: ServiceOfferingRequest): ServiceOfferingErrorBody => ({
    code: MARKETPLACE_CATALOG_ERROR_CODES.UNAUTHORIZED,
    message: `Principal "${request.principal}" is not authorized to act on this service offering.`,
  });

  const loadAgentOrThrow = async (agentId: string): Promise<RegisteredAgent> => {
    const agent = await agentRepository.getById(agentId);
    if (agent === null) {
      throw new MarketplaceCatalogAgentUnknownError(agentId);
    }
    return agent;
  };

  const handleCreate = async (
    request: ServiceOfferingRequest,
    timestamp: string,
  ): Promise<ServiceOfferingResponse> => {
    const payload = request.payload as ServiceOfferingCreatePayload;
    if (payload.input.ownerRef !== request.principal) {
      return {
        contractVersion: SERVICE_OFFERING_API_VERSION,
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
        contractVersion: SERVICE_OFFERING_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: false,
        error: unauthorizedError(request),
        timestamp,
      };
    }

    const undeclared = undeclaredCapabilities(payload.input.capabilities, agent.capabilities);
    if (undeclared.length > 0) {
      throw new ServiceOfferingInputError([
        `Offering capabilities must be declared by the agent: ${undeclared.join(', ')}.`,
      ]);
    }

    const offering = createServiceOffering(payload.input, deps);
    try {
      await repository.create(offering);
    } catch (error) {
      if (error instanceof ServiceOfferingDuplicateError) {
        const existing = await repository.getById(offering.id);
        if (
          existing !== null &&
          existing.ownerRef === request.principal &&
          offeringKey(existing) === offeringKey(offering)
        ) {
          return {
            contractVersion: SERVICE_OFFERING_API_VERSION,
            requestId: request.requestId,
            action: request.action,
            ok: true,
            offering: existing,
            timestamp,
          };
        }
        return {
          contractVersion: SERVICE_OFFERING_API_VERSION,
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
      contractVersion: SERVICE_OFFERING_API_VERSION,
      requestId: request.requestId,
      action: request.action,
      ok: true,
      offering,
      timestamp,
    };
  };

  const handleUpdate = async (
    request: ServiceOfferingRequest,
    timestamp: string,
  ): Promise<ServiceOfferingResponse> => {
    const payload = request.payload as ServiceOfferingUpdatePayload;
    const existing = await repository.getById(payload.offeringId);
    if (existing === null) {
      throw new ServiceOfferingNotFoundError(payload.offeringId);
    }
    if (existing.ownerRef !== request.principal) {
      return {
        contractVersion: SERVICE_OFFERING_API_VERSION,
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
        throw new ServiceOfferingInputError([
          `Offering capabilities must be declared by the agent: ${undeclared.join(', ')}.`,
        ]);
      }
    }

    const updated = applyServiceOfferingUpdate(existing, payload.update, deps);
    await repository.save(updated, payload.version);
    return {
      contractVersion: SERVICE_OFFERING_API_VERSION,
      requestId: request.requestId,
      action: request.action,
      ok: true,
      offering: updated,
      timestamp,
    };
  };

  const handleGet = async (
    request: ServiceOfferingRequest,
    timestamp: string,
  ): Promise<ServiceOfferingResponse> => {
    const payload = request.payload as ServiceOfferingGetPayload;
    const existing = await repository.getById(payload.offeringId);
    if (existing === null) {
      throw new ServiceOfferingNotFoundError(payload.offeringId);
    }
    if (existing.ownerRef !== request.principal) {
      return {
        contractVersion: SERVICE_OFFERING_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: false,
        error: unauthorizedError(request),
        timestamp,
      };
    }
    return {
      contractVersion: SERVICE_OFFERING_API_VERSION,
      requestId: request.requestId,
      action: request.action,
      ok: true,
      offering: existing,
      timestamp,
    };
  };

  const handleList = async (
    request: ServiceOfferingRequest,
    timestamp: string,
  ): Promise<ServiceOfferingResponse> => {
    const offerings = await repository.listByOwner(request.principal);
    return {
      contractVersion: SERVICE_OFFERING_API_VERSION,
      requestId: request.requestId,
      action: request.action,
      ok: true,
      offerings,
      timestamp,
    };
  };

  const handleLifecycle = async (
    request: ServiceOfferingRequest,
    timestamp: string,
  ): Promise<ServiceOfferingResponse> => {
    const payload = request.payload as ServiceOfferingLifecyclePayload;
    const existing = await repository.getById(payload.offeringId);
    if (existing === null) {
      throw new ServiceOfferingNotFoundError(payload.offeringId);
    }
    if (existing.ownerRef !== request.principal) {
      return {
        contractVersion: SERVICE_OFFERING_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: false,
        error: unauthorizedError(request),
        timestamp,
      };
    }

    const nextStatus: ServiceOffering['status'] =
      request.action === 'archive' ? 'archived' : 'active';

    // Idempotent lifecycle operation: an already-requested state succeeds, but
    // the optimistic-concurrency version is still enforced.
    if (existing.status === nextStatus) {
      if (existing.version !== payload.version) {
        throw new ServiceOfferingVersionConflictError(
          payload.offeringId,
          payload.version,
          existing.version,
        );
      }
      return {
        contractVersion: SERVICE_OFFERING_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: true,
        offering: existing,
        timestamp,
      };
    }

    const updated = applyServiceOfferingUpdate(existing, { status: nextStatus }, deps);
    await repository.save(updated, payload.version);
    return {
      contractVersion: SERVICE_OFFERING_API_VERSION,
      requestId: request.requestId,
      action: request.action,
      ok: true,
      offering: updated,
      timestamp,
    };
  };

  const handle = async (input: unknown): Promise<ServiceOfferingResponse> => {
    const parsed = parseRequest(input);
    const timestamp = new Date(clock()).toISOString();

    if (!parsed.ok) {
      return {
        contractVersion: SERVICE_OFFERING_API_VERSION,
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
        case 'archive':
        case 'activate':
          return await handleLifecycle(request, timestamp);
      }
    } catch (error) {
      return {
        contractVersion: SERVICE_OFFERING_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: false,
        error: toErrorBody(error),
        timestamp,
      };
    }
  };

  const openapi = (): ReturnType<typeof buildServiceOfferingOpenApi> => {
    const apiOptions: Parameters<typeof buildServiceOfferingOpenApi>[0] = {};
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
    return buildServiceOfferingOpenApi(apiOptions);
  };

  return {
    repository,
    agentRepository,
    contractVersion: () => SERVICE_OFFERING_API_VERSION,
    parseRequest,
    handle,
    openapi,
  };
}
