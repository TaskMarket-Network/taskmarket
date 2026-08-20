import {
  AGENT_REGISTRY_ERROR_CODES,
  AgentRegistryDuplicateError,
  AgentRegistryError,
  AgentRegistryInputError,
  AgentRegistryNotFoundError,
  AgentRegistryVersionConflictError,
} from '../errors.js';
import { applyAgentUpdate, createRegisteredAgent, type RegistryDeps } from '../domain.js';
import { registeredAgentInputSchema } from '../schemas.js';
import type { AgentRegistryRepository } from '../repository.js';
import type { RegisteredAgent } from '../types.js';
import {
  buildAgentRegistrationOpenApi,
  type AgentRegistrationOpenApiDocument,
  type AgentRegistrationOpenApiOptions,
} from './openapi.js';
import { agentRegistrationPayloadSchemas, agentRegistrationRequestSchema } from './schemas.js';
import type {
  AgentDisablePayload,
  AgentGetPayload,
  AgentRegisterPayload,
  AgentRegistrationError,
  AgentRegistrationParseResult,
  AgentRegistrationRequest,
  AgentRegistrationResponse,
  AgentRegistrationService,
  AgentUpdatePayload,
  AgentValidatePayload,
} from './types.js';
import { AGENT_REGISTRATION_API_VERSION } from './version.js';

export interface AgentRegistrationOptions {
  /** Service name used as the OpenAPI title. */
  serviceName?: string;
  /** Service version used as the OpenAPI info version. */
  serviceVersion?: string;
  /** OpenAPI info description. */
  serviceDescription?: string;
  /** Base URL of the deployed service, emitted as an OpenAPI server. */
  baseUrl?: string;
  /** Injectable clock and id factories (deterministic tests). */
  deps?: RegistryDeps;
}

/** Request ID used when an external payload cannot be parsed safely. */
const MALFORMED_REQUEST_ID = 'tmr_unknown';

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

/** Serialize the owner-controlled profile content for idempotent replay. */
function profileKey(agent: RegisteredAgent): string {
  return JSON.stringify({
    ownerRef: agent.ownerRef,
    name: agent.name,
    description: agent.description,
    capabilities: agent.capabilities,
    endpoints: agent.endpoints,
    status: agent.status,
    pricing: agent.pricing ?? null,
  });
}

/** Map any thrown error to a structured, secret-free error body. */
function toErrorBody(error: unknown): AgentRegistrationError {
  if (error instanceof AgentRegistryInputError) {
    return { code: error.code, message: error.message, issues: [...error.issues] };
  }
  if (error instanceof AgentRegistryError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: AGENT_REGISTRY_ERROR_CODES.INTERNAL,
    message: 'Unexpected internal error.',
  };
}

/**
 * Create the transport-agnostic agent registration API service. All external
 * input is validated at the trust boundary (`parseRequest`), every operation
 * enforces the ownership authorization boundary against the supplied
 * `principal`, updates use optimistic concurrency via the repository `save`,
 * and `handle` always resolves to a structured response (never throws).
 *
 * The `principal` is an authentication placeholder: a real adapter replaces it
 * with a verified identity after authenticating the caller. Until then the
 * service treats it as the authenticated principal (see the package README).
 */
export function createAgentRegistrationService(
  repository: AgentRegistryRepository,
  options: AgentRegistrationOptions = {},
): AgentRegistrationService {
  const deps = options.deps ?? {};
  const clock = deps.clock ?? Date.now;

  const parseRequest = (input: unknown): AgentRegistrationParseResult => {
    const envelope = agentRegistrationRequestSchema.safeParse(input);
    if (!envelope.success) {
      return {
        ok: false,
        error: {
          code: AGENT_REGISTRY_ERROR_CODES.REQUEST_INVALID,
          message: envelope.error.issues.map((issue) => issue.message).join('; '),
        },
      };
    }

    const request = envelope.data;
    if (request.contractVersion !== AGENT_REGISTRATION_API_VERSION) {
      return {
        ok: false,
        error: {
          code: AGENT_REGISTRY_ERROR_CODES.UNSUPPORTED_VERSION,
          message: `Unsupported contract version "${request.contractVersion}" (supported: ${AGENT_REGISTRATION_API_VERSION}).`,
        },
      };
    }

    const payloadSchema = agentRegistrationPayloadSchemas[request.action];
    const payload = payloadSchema.safeParse(request.payload);
    if (!payload.success) {
      const issues = payload.error.issues.map((issue) => issue.message);
      return {
        ok: false,
        error: {
          code: AGENT_REGISTRY_ERROR_CODES.REQUEST_INVALID,
          message: `Invalid payload for action "${request.action}": ${issues.join('; ')}`,
          issues,
        },
      };
    }

    return { ok: true, request: { ...request, payload: payload.data } };
  };

  const unauthorizedError = (request: AgentRegistrationRequest): AgentRegistrationError => ({
    code: AGENT_REGISTRY_ERROR_CODES.UNAUTHORIZED,
    message: `Principal "${request.principal}" is not authorized to act on this agent.`,
  });

  const handleRegister = async (
    request: AgentRegistrationRequest,
    timestamp: string,
  ): Promise<AgentRegistrationResponse> => {
    const payload = request.payload as AgentRegisterPayload;
    if (payload.ownerRef !== request.principal) {
      return {
        contractVersion: AGENT_REGISTRATION_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: false,
        error: unauthorizedError(request),
        timestamp,
      };
    }

    const agent = createRegisteredAgent(payload, deps);
    try {
      await repository.create(agent);
    } catch (error) {
      if (error instanceof AgentRegistryDuplicateError) {
        // Idempotent replay: an identical profile under the same id and
        // principal returns the stored profile instead of failing.
        const existing = await repository.getById(agent.id);
        if (
          existing !== null &&
          existing.ownerRef === request.principal &&
          profileKey(existing) === profileKey(agent)
        ) {
          return {
            contractVersion: AGENT_REGISTRATION_API_VERSION,
            requestId: request.requestId,
            action: request.action,
            ok: true,
            agent: existing,
            timestamp,
          };
        }
        return {
          contractVersion: AGENT_REGISTRATION_API_VERSION,
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
      contractVersion: AGENT_REGISTRATION_API_VERSION,
      requestId: request.requestId,
      action: request.action,
      ok: true,
      agent,
      timestamp,
    };
  };

  const handleUpdate = async (
    request: AgentRegistrationRequest,
    timestamp: string,
  ): Promise<AgentRegistrationResponse> => {
    const payload = request.payload as AgentUpdatePayload;
    const existing = await repository.getById(payload.agentId);
    if (existing === null) {
      throw new AgentRegistryNotFoundError(payload.agentId);
    }
    if (existing.ownerRef !== request.principal) {
      return {
        contractVersion: AGENT_REGISTRATION_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: false,
        error: unauthorizedError(request),
        timestamp,
      };
    }

    const updated = applyAgentUpdate(existing, payload.update, deps);
    await repository.save(updated, payload.version);
    return {
      contractVersion: AGENT_REGISTRATION_API_VERSION,
      requestId: request.requestId,
      action: request.action,
      ok: true,
      agent: updated,
      timestamp,
    };
  };

  const handleGet = async (
    request: AgentRegistrationRequest,
    timestamp: string,
  ): Promise<AgentRegistrationResponse> => {
    const payload = request.payload as AgentGetPayload;
    const existing = await repository.getById(payload.agentId);
    if (existing === null) {
      throw new AgentRegistryNotFoundError(payload.agentId);
    }
    if (existing.ownerRef !== request.principal) {
      return {
        contractVersion: AGENT_REGISTRATION_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: false,
        error: unauthorizedError(request),
        timestamp,
      };
    }
    return {
      contractVersion: AGENT_REGISTRATION_API_VERSION,
      requestId: request.requestId,
      action: request.action,
      ok: true,
      agent: existing,
      timestamp,
    };
  };

  const handleDisable = async (
    request: AgentRegistrationRequest,
    timestamp: string,
  ): Promise<AgentRegistrationResponse> => {
    const payload = request.payload as AgentDisablePayload;
    const existing = await repository.getById(payload.agentId);
    if (existing === null) {
      throw new AgentRegistryNotFoundError(payload.agentId);
    }
    if (existing.ownerRef !== request.principal) {
      return {
        contractVersion: AGENT_REGISTRATION_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: false,
        error: unauthorizedError(request),
        timestamp,
      };
    }
    if (existing.status === 'retired') {
      // Idempotent disable: an already-retired profile succeeds, but the
      // optimistic-concurrency version is still enforced.
      if (existing.version !== payload.version) {
        throw new AgentRegistryVersionConflictError(
          payload.agentId,
          payload.version,
          existing.version,
        );
      }
      return {
        contractVersion: AGENT_REGISTRATION_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: true,
        agent: existing,
        timestamp,
      };
    }

    const updated = applyAgentUpdate(existing, { status: 'retired' }, deps);
    await repository.save(updated, payload.version);
    return {
      contractVersion: AGENT_REGISTRATION_API_VERSION,
      requestId: request.requestId,
      action: request.action,
      ok: true,
      agent: updated,
      timestamp,
    };
  };

  const handleValidate = (
    request: AgentRegistrationRequest,
    timestamp: string,
  ): AgentRegistrationResponse => {
    const payload = request.payload as AgentValidatePayload;
    const parsed = registeredAgentInputSchema.safeParse(payload.candidate);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message);
      return {
        contractVersion: AGENT_REGISTRATION_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: false,
        error: {
          code: AGENT_REGISTRY_ERROR_CODES.INPUT_INVALID,
          message: `Invalid agent profile: ${issues.join('; ')}`,
          issues,
        },
        timestamp,
      };
    }
    return {
      contractVersion: AGENT_REGISTRATION_API_VERSION,
      requestId: request.requestId,
      action: request.action,
      ok: true,
      candidate: parsed.data,
      timestamp,
    };
  };

  const handle = async (input: unknown): Promise<AgentRegistrationResponse> => {
    const parsed = parseRequest(input);
    const timestamp = new Date(clock()).toISOString();

    if (!parsed.ok) {
      return {
        contractVersion: AGENT_REGISTRATION_API_VERSION,
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
        case 'register':
          return await handleRegister(request, timestamp);
        case 'update':
          return await handleUpdate(request, timestamp);
        case 'get':
          return await handleGet(request, timestamp);
        case 'disable':
          return await handleDisable(request, timestamp);
        case 'validate':
          return handleValidate(request, timestamp);
      }
    } catch (error) {
      return {
        contractVersion: AGENT_REGISTRATION_API_VERSION,
        requestId: request.requestId,
        action: request.action,
        ok: false,
        error: toErrorBody(error),
        timestamp,
      };
    }
  };

  const openapi = (): AgentRegistrationOpenApiDocument => {
    const apiOptions: AgentRegistrationOpenApiOptions = {};
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
    return buildAgentRegistrationOpenApi(apiOptions);
  };

  return {
    repository,
    contractVersion: () => AGENT_REGISTRATION_API_VERSION,
    parseRequest,
    handle,
    openapi,
  };
}
