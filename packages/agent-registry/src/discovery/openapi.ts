import { zodToJsonSchema } from '../api/json-schema.js';
import {
  capabilityDiscoveryErrorSchema,
  capabilityDiscoveryItemSchema,
  capabilityDiscoveryQuerySchema,
  capabilityDiscoveryResultSchema,
} from './schemas.js';
import { CAPABILITY_DISCOVERY_API_VERSION } from './version.js';

/** OpenAPI 3.1 document describing the capability discovery API. */
export interface CapabilityDiscoveryOpenApiDocument {
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

export interface CapabilityDiscoveryOpenApiOptions {
  /** Service name used as the OpenAPI title. Defaults to `TaskMarket Capability Discovery`. */
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
 * Build a clear, transport-agnostic OpenAPI 3.1 document for capability
 * discovery: a single search operation whose query/result schemas are derived
 * from the same Zod schemas the service validates against, so the docs never
 * drift from the validated contract.
 */
export function buildCapabilityDiscoveryOpenApi(
  options: CapabilityDiscoveryOpenApiOptions = {},
): CapabilityDiscoveryOpenApiDocument {
  const document: CapabilityDiscoveryOpenApiDocument = {
    openapi: '3.1.0',
    info: {
      title: options.serviceName ?? 'TaskMarket Capability Discovery',
      version: options.serviceVersion ?? CAPABILITY_DISCOVERY_API_VERSION,
      description:
        options.serviceDescription ??
        'Searchable, ranked, paginated capability discovery over active agent profiles (read-only).',
    },
    paths: {
      '/capabilities/search': {
        post: {
          operationId: 'searchCapabilities',
          summary: 'Search agents by declared capabilities.',
          description:
            'Returns a safe projection of active agents matching the requested capabilities (AND), namespaces (any), and free-text query, ranked and paginated. Endpoint metadata is never returned or executed.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: jsonSchemaRef('CapabilityDiscoveryQuery'),
              },
            },
          },
          responses: {
            '200': {
              description: 'Structured discovery result.',
              content: {
                'application/json': {
                  schema: jsonSchemaRef('CapabilityDiscoveryResult'),
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        CapabilityDiscoveryQuery: zodToJsonSchema(capabilityDiscoveryQuerySchema),
        CapabilityDiscoveryResult: zodToJsonSchema(capabilityDiscoveryResultSchema),
        CapabilityDiscoveryItem: zodToJsonSchema(capabilityDiscoveryItemSchema),
        CapabilityDiscoveryError: zodToJsonSchema(capabilityDiscoveryErrorSchema),
      },
    },
  };

  if (options.baseUrl !== undefined && options.baseUrl.length > 0) {
    document.servers = [{ url: options.baseUrl }];
  }

  return document;
}
