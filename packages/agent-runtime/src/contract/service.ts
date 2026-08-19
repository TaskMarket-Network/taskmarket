import { AGENT_RUNTIME_CONTRACT_ERROR_CODES } from '../errors.js';
import type { AgentRuntime } from '../runtime.js';
import type { RunToolOptions } from '../types.js';
import {
  buildAgentServiceOpenApi,
  type AgentServiceOpenApiDocument,
  type AgentServiceOpenApiOptions,
} from './openapi.js';
import { agentServiceRequestSchema } from './schemas.js';
import type {
  AgentServiceCapabilitiesResponse,
  AgentServiceHealthResponse,
  AgentServiceParseResult,
  AgentServiceRequest,
  AgentServiceResponse,
} from './types.js';
import { AGENT_SERVICE_CONTRACT_VERSION } from './version.js';

export interface AgentServiceOptions {
  /** Service name used as the OpenAPI title. */
  serviceName?: string;
  /** Service version used as the OpenAPI info version. */
  serviceVersion?: string;
  /** OpenAPI info description. */
  serviceDescription?: string;
  /** Base URL of the deployed service, emitted as an OpenAPI server. */
  baseUrl?: string;
  /** Injectable clock returning epoch milliseconds (deterministic tests). */
  clock?: () => number;
}

/**
 * The model- and transport-agnostic agent service boundary. Wraps an
 * {@link AgentRuntime} and exposes the external contract: a validated request
 * envelope, structured responses, capabilities, health, and generated API
 * documentation. HTTP/MCP adapters (later phases) consume this interface.
 */
export interface AgentService {
  /** The runtime the service wraps. */
  readonly runtime: AgentRuntime;
  /** The contract version this service speaks. */
  contractVersion(): string;
  /**
   * Validate an external payload against the request envelope at the trust
   * boundary. Returns a discriminated result; adapters may route on it.
   */
  parseRequest(input: unknown): AgentServiceParseResult;
  /**
   * Execute an external request end to end. Always resolves to a structured
   * {@link AgentServiceResponse}; malformed or unsupported requests produce a
   * structured error response rather than throwing.
   */
  execute(input: unknown): Promise<AgentServiceResponse>;
  /** Capability snapshot for discovery. */
  capabilities(): AgentServiceCapabilitiesResponse;
  /** Liveness and identity snapshot. */
  health(): AgentServiceHealthResponse;
  /** Generated OpenAPI 3.1 documentation for the service. */
  openapi(): AgentServiceOpenApiDocument;
}

/** Request ID used when an external payload cannot be parsed safely. */
const MALFORMED_REQUEST_ID = 'tmc_unknown';

export function createAgentService(
  runtime: AgentRuntime,
  options: AgentServiceOptions = {},
): AgentService {
  const clock = options.clock ?? Date.now;

  const parseRequest = (input: unknown): AgentServiceParseResult => {
    const parsed = agentServiceRequestSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: AGENT_RUNTIME_CONTRACT_ERROR_CODES.REQUEST_INVALID,
          message: parsed.error.issues.map((issue) => issue.message).join('; '),
        },
      };
    }
    if (parsed.data.contractVersion !== AGENT_SERVICE_CONTRACT_VERSION) {
      return {
        ok: false,
        error: {
          code: AGENT_RUNTIME_CONTRACT_ERROR_CODES.UNSUPPORTED_VERSION,
          message: `Unsupported contract version "${parsed.data.contractVersion}" (supported: ${AGENT_SERVICE_CONTRACT_VERSION}).`,
        },
      };
    }
    return { ok: true, request: parsed.data as AgentServiceRequest };
  };

  /** Best-effort request ID extracted from a malformed payload (safe only). */
  const safeRequestIdOf = (input: unknown): string => {
    const candidate =
      typeof input === 'object' && input !== null && 'requestId' in input
        ? String((input as { requestId?: unknown }).requestId).slice(0, 128)
        : MALFORMED_REQUEST_ID;
    return /^[A-Za-z0-9._-]+$/.test(candidate) ? candidate : MALFORMED_REQUEST_ID;
  };

  const execute = async (input: unknown): Promise<AgentServiceResponse> => {
    const parsed = parseRequest(input);
    if (!parsed.ok) {
      const requestId = safeRequestIdOf(input);
      const tool =
        typeof input === 'object' && input !== null && 'tool' in input
          ? String((input as { tool?: unknown }).tool).slice(0, 128)
          : 'unknown';
      return {
        contractVersion: AGENT_SERVICE_CONTRACT_VERSION,
        requestId,
        traceId: `tmc_${requestId}`,
        tool,
        ok: false,
        error: parsed.error,
        latencyMs: 0,
        attempts: 0,
        timestamp: new Date(clock()).toISOString(),
      };
    }

    const request = parsed.request;
    const runOptions: RunToolOptions = {};
    if (request.idempotencyKey !== undefined) {
      runOptions.idempotencyKey = request.idempotencyKey;
    }
    if (request.timeoutMs !== undefined) {
      runOptions.timeoutMs = request.timeoutMs;
    }
    if (request.confirmed !== undefined) {
      runOptions.confirmed = request.confirmed;
    }
    if (request.caller !== undefined) {
      runOptions.caller = request.caller;
    } else if (request.auth?.principal !== undefined) {
      runOptions.caller = request.auth.principal;
    }
    const result = await runtime.runTool(request.tool, request.input ?? {}, runOptions);

    const response: AgentServiceResponse = {
      contractVersion: AGENT_SERVICE_CONTRACT_VERSION,
      requestId: request.requestId,
      traceId: result.traceId,
      tool: result.tool,
      ok: result.ok,
      latencyMs: result.latencyMs,
      attempts: result.attempts,
      timestamp: result.timestamp,
    };
    if (result.output !== undefined) {
      response.output = result.output;
    }
    if (result.error !== undefined) {
      response.error = result.error;
    }
    return response;
  };

  const capabilities = (): AgentServiceCapabilitiesResponse => ({
    contractVersion: AGENT_SERVICE_CONTRACT_VERSION,
    agentId: runtime.config.agentId,
    version: runtime.config.version,
    capabilities: runtime.listCapabilities(),
    tools: [...runtime.health().tools],
  });

  const health = (): AgentServiceHealthResponse => {
    const snapshot = runtime.health();
    return {
      contractVersion: AGENT_SERVICE_CONTRACT_VERSION,
      ok: snapshot.ok,
      agentId: snapshot.agentId,
      name: snapshot.name,
      version: snapshot.version,
      capabilities: [...snapshot.capabilities],
      tools: [...snapshot.tools],
      network: snapshot.network,
      checkedAt: snapshot.checkedAt,
    };
  };

  const openapi = (): AgentServiceOpenApiDocument => {
    const apiOptions: AgentServiceOpenApiOptions = {
      tools: runtime.tools,
      capabilities: runtime.listCapabilities(),
    };
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
    return buildAgentServiceOpenApi(apiOptions);
  };

  return {
    runtime,
    contractVersion: () => AGENT_SERVICE_CONTRACT_VERSION,
    parseRequest,
    execute,
    capabilities,
    health,
    openapi,
  };
}
