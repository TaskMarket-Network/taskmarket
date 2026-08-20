import {
  AGENT_REGISTRY_ERROR_CODES,
  AgentRegistryError,
  AgentRegistryInputError,
} from '../errors.js';
import type { AgentRegistryRepository } from '../repository.js';
import {
  buildCapabilityDiscoveryOpenApi,
  type CapabilityDiscoveryOpenApiDocument,
  type CapabilityDiscoveryOpenApiOptions,
} from './openapi.js';
import { capabilityDiscoveryQuerySchema } from './schemas.js';
import { searchCapabilities } from './search.js';
import type {
  CapabilityDiscoveryError,
  CapabilityDiscoveryParseResult,
  CapabilityDiscoveryResponse,
  CapabilityDiscoveryService,
} from './types.js';
import { CAPABILITY_DISCOVERY_API_VERSION } from './version.js';

export interface CapabilityDiscoveryOptions {
  /** Service name used as the OpenAPI title. */
  serviceName?: string;
  /** Service version used as the OpenAPI info version. */
  serviceVersion?: string;
  /** OpenAPI info description. */
  serviceDescription?: string;
  /** Base URL of the deployed service, emitted as an OpenAPI server. */
  baseUrl?: string;
}

/** Map any thrown error to a structured, secret-free error body. */
function toErrorBody(error: unknown): CapabilityDiscoveryError {
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
 * Create the transport-agnostic capability discovery service. Queries are
 * validated at the trust boundary, search/rank/pagination run in pure code
 * (no dynamic SQL), only `active` agents are returned through a safe
 * projection (endpoint metadata stripped), and `query` always resolves to a
 * structured response (never throws).
 */
export function createCapabilityDiscoveryService(
  repository: AgentRegistryRepository,
  options: CapabilityDiscoveryOptions = {},
): CapabilityDiscoveryService {
  const parseQuery = (input: unknown): CapabilityDiscoveryParseResult => {
    const parsed = capabilityDiscoveryQuerySchema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message);
      return {
        ok: false,
        error: {
          code: AGENT_REGISTRY_ERROR_CODES.REQUEST_INVALID,
          message: `Invalid capability discovery query: ${issues.join('; ')}`,
          issues,
        },
      };
    }
    return { ok: true, query: parsed.data };
  };

  const query = async (input: unknown): Promise<CapabilityDiscoveryResponse> => {
    const parsed = parseQuery(input);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    try {
      const agents = await repository.listAll();
      const result = searchCapabilities(agents, parsed.query);
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: toErrorBody(error) };
    }
  };

  const openapi = (): CapabilityDiscoveryOpenApiDocument => {
    const apiOptions: CapabilityDiscoveryOpenApiOptions = {};
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
    return buildCapabilityDiscoveryOpenApi(apiOptions);
  };

  return {
    repository,
    contractVersion: () => CAPABILITY_DISCOVERY_API_VERSION,
    parseQuery,
    query,
    openapi,
  };
}
