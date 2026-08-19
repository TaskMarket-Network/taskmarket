import type { ToolDefinition } from '../types.js';
import { zodToJsonSchema } from './json-schema.js';
import {
  agentServiceAuthSchema,
  agentServiceCapabilitiesResponseSchema,
  agentServiceErrorSchema,
  agentServiceHealthResponseSchema,
  agentServiceRequestSchema,
  agentServiceResponseSchema,
} from './schemas.js';
import { AGENT_SERVICE_CONTRACT_VERSION } from './version.js';

/** OpenAPI 3.1 document describing the TaskMarket agent service. */
export interface AgentServiceOpenApiDocument {
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

export interface AgentServiceOpenApiOptions {
  /** Service name used as the OpenAPI title. Defaults to `TaskMarket Agent Service`. */
  serviceName?: string;
  /** Service version used as the OpenAPI info version. Defaults to the contract version. */
  serviceVersion?: string;
  /** OpenAPI info description. */
  serviceDescription?: string;
  /** Base URL of the deployed service, emitted as an OpenAPI server. */
  baseUrl?: string;
  /** Registered tools to document. */
  tools: readonly ToolDefinition[];
  /** Declared capability keys. */
  capabilities: readonly string[];
}

const jsonSchemaRef = (name: string): Record<string, unknown> => ({
  $ref: `#/components/schemas/${name}`,
});

function componentName(toolName: string): string {
  return `Tool.${toolName}`;
}

/**
 * Build a clear, model-agnostic OpenAPI 3.1 document for the agent service:
 * `/health` (liveness), `/capabilities` (discovery), and `/tool` (execution,
 * with a oneOf request schema per registered tool). Tool input schemas are
 * converted from their Zod schemas, so the documentation can never drift from
 * the validated contract.
 */
export function buildAgentServiceOpenApi(
  options: AgentServiceOpenApiOptions,
): AgentServiceOpenApiDocument {
  const tools = [...options.tools].sort((a, b) => a.name.localeCompare(b.name));
  const toolList = tools.map((tool) => `${tool.name} — ${tool.description}`).join('; ');

  const schemas: Record<string, unknown> = {
    AgentServiceRequest: zodToJsonSchema(agentServiceRequestSchema),
    AgentServiceResponse: zodToJsonSchema(agentServiceResponseSchema),
    AgentServiceError: zodToJsonSchema(agentServiceErrorSchema),
    AgentServiceAuth: zodToJsonSchema(agentServiceAuthSchema),
    AgentServiceCapabilitiesResponse: zodToJsonSchema(agentServiceCapabilitiesResponseSchema),
    AgentServiceHealthResponse: zodToJsonSchema(agentServiceHealthResponseSchema),
  };

  const toolRequestRefs: Record<string, unknown>[] = [];
  for (const tool of tools) {
    const name = componentName(tool.name);
    schemas[`${name}.Request`] = {
      type: 'object',
      properties: {
        contractVersion: { type: 'string' },
        requestId: { type: 'string', minLength: 1, maxLength: 128 },
        tool: { type: 'string', const: tool.name },
        input: zodToJsonSchema(tool.inputSchema),
        idempotencyKey: { type: 'string', minLength: 1, maxLength: 128 },
        timeoutMs: { type: 'integer', minimum: 1, maximum: 60_000 },
        confirmed: { type: 'boolean' },
        caller: { type: 'string', minLength: 1, maxLength: 256 },
        auth: jsonSchemaRef('AgentServiceAuth'),
      },
      required: ['contractVersion', 'requestId', 'tool'],
    };
    schemas[`${name}.Response`] = {
      type: 'object',
      properties: {
        ...(zodToJsonSchema(agentServiceResponseSchema).properties as Record<string, unknown>),
      },
    };
    toolRequestRefs.push(jsonSchemaRef(`${name}.Request`));
  }

  const document: AgentServiceOpenApiDocument = {
    openapi: '3.1.0',
    info: {
      title: options.serviceName ?? 'TaskMarket Agent Service',
      version: options.serviceVersion ?? AGENT_SERVICE_CONTRACT_VERSION,
      description:
        options.serviceDescription ??
        'Model- and transport-agnostic agent service contract: capabilities, health, and tool execution.',
    },
    paths: {
      '/health': {
        get: {
          operationId: 'agentHealth',
          summary: 'Liveness and identity check.',
          responses: {
            '200': {
              description: 'Healthy service.',
              content: {
                'application/json': {
                  schema: jsonSchemaRef('AgentServiceHealthResponse'),
                },
              },
            },
          },
        },
      },
      '/capabilities': {
        get: {
          operationId: 'agentCapabilities',
          summary: 'List the declared capabilities and available tools.',
          responses: {
            '200': {
              description: 'Capability snapshot.',
              content: {
                'application/json': {
                  schema: jsonSchemaRef('AgentServiceCapabilitiesResponse'),
                },
              },
            },
          },
        },
      },
      '/tool': {
        post: {
          operationId: 'runTool',
          summary: 'Execute one agent tool.',
          description: `Registered tools: ${toolList}.`,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  oneOf: toolRequestRefs,
                  description: 'The request must match one of the registered tool schemas.',
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Structured execution result.',
              content: {
                'application/json': {
                  schema: jsonSchemaRef('AgentServiceResponse'),
                },
              },
            },
          },
        },
      },
    },
    components: { schemas },
  };

  if (options.capabilities.length > 0) {
    document.info.description = `${document.info.description}\nDeclared capabilities: ${options.capabilities.join(', ')}.`;
  }
  if (options.baseUrl !== undefined && options.baseUrl.length > 0) {
    document.servers = [{ url: options.baseUrl }];
  }

  return document;
}
