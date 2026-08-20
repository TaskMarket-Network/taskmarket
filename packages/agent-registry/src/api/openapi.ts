import { registeredAgentInputSchema, registeredAgentSchema } from '../schemas.js';
import { zodToJsonSchema } from './json-schema.js';
import {
  agentDisablePayloadSchema,
  agentGetPayloadSchema,
  agentRegisterPayloadSchema,
  agentRegistrationErrorSchema,
  agentRegistrationRequestIdSchema,
  agentRegistrationRequestSchema,
  agentRegistrationResponseSchema,
  agentUpdatePayloadSchema,
} from './schemas.js';
import { AGENT_REGISTRATION_API_VERSION } from './version.js';

/** OpenAPI 3.1 document describing the TaskMarket agent registration API. */
export interface AgentRegistrationOpenApiDocument {
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

export interface AgentRegistrationOpenApiOptions {
  /** Service name used as the OpenAPI title. Defaults to `TaskMarket Agent Registration API`. */
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
 * Build a clear, transport-agnostic OpenAPI 3.1 document for the agent
 * registration API: one POST endpoint per action (`register`, `update`,
 * `get`, `disable`, `validate`) with the typed request envelope and the
 * `AgentRegistrationResponse`. Payload schemas are converted from their Zod
 * schemas, so the documentation can never drift from the validated contract.
 */
export function buildAgentRegistrationOpenApi(
  options: AgentRegistrationOpenApiOptions = {},
): AgentRegistrationOpenApiDocument {
  const schemas: Record<string, unknown> = {
    AgentRegistrationRequest: zodToJsonSchema(agentRegistrationRequestSchema),
    AgentRegistrationResponse: zodToJsonSchema(agentRegistrationResponseSchema),
    AgentRegistrationError: zodToJsonSchema(agentRegistrationErrorSchema),
    AgentRegistrationRequestId: zodToJsonSchema(agentRegistrationRequestIdSchema),
    RegisteredAgent: zodToJsonSchema(registeredAgentSchema),
    'Payload.Register': zodToJsonSchema(agentRegisterPayloadSchema),
    'Payload.Update': zodToJsonSchema(agentUpdatePayloadSchema),
    'Payload.Get': zodToJsonSchema(agentGetPayloadSchema),
    'Payload.Disable': zodToJsonSchema(agentDisablePayloadSchema),
    'Payload.Validate': {
      type: 'object',
      properties: { candidate: zodToJsonSchema(registeredAgentInputSchema) },
      required: ['candidate'],
      additionalProperties: false,
    },
  };

  const operations: { action: string; path: string; summary: string; description: string }[] = [
    {
      action: 'register',
      path: '/agents/register',
      summary: 'Register a new agent profile.',
      description:
        'Creates a draft agent profile owned by the principal. Idempotent: replaying an identical profile under the same id and principal returns the stored profile.',
    },
    {
      action: 'update',
      path: '/agents/update',
      summary: 'Update mutable fields of an agent profile.',
      description:
        'Applies mutable-field changes with optimistic concurrency (`version`). The principal must own the agent.',
    },
    {
      action: 'get',
      path: '/agents/get',
      summary: 'Read an agent profile.',
      description: 'Returns the profile owned by the principal. Public discovery is a later phase.',
    },
    {
      action: 'disable',
      path: '/agents/disable',
      summary: 'Disable (retire) an agent profile.',
      description:
        'Transitions the agent to `retired` (terminal) with optimistic concurrency. Idempotent: disabling an already-retired agent succeeds.',
    },
    {
      action: 'validate',
      path: '/agents/validate',
      summary: 'Dry-run validate a candidate profile.',
      description:
        'Validates a candidate profile without persisting it and returns the normalized input or the validation issues.',
    },
  ];

  const paths: Record<string, unknown> = {};
  for (const operation of operations) {
    const action = operation.action;
    const requestName = `Operation.${action}.Request`;
    const payloadName = `Payload.${action[0]?.toUpperCase() ?? ''}${action.slice(1)}`;
    schemas[requestName] = {
      type: 'object',
      properties: {
        ...(zodToJsonSchema(agentRegistrationRequestSchema).properties as Record<string, unknown>),
        payload: jsonSchemaRef(payloadName),
      },
      required: ['contractVersion', 'requestId', 'action', 'principal', 'payload'],
    };

    paths[operation.path] = {
      post: {
        operationId: `agent${operation.action[0]?.toUpperCase() ?? ''}${operation.action.slice(1)}`,
        summary: operation.summary,
        description: operation.description,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: jsonSchemaRef(requestName),
            },
          },
        },
        responses: {
          '200': {
            description: 'Structured operation result.',
            content: {
              'application/json': {
                schema: jsonSchemaRef('AgentRegistrationResponse'),
              },
            },
          },
        },
      },
    };
  }

  const document: AgentRegistrationOpenApiDocument = {
    openapi: '3.1.0',
    info: {
      title: options.serviceName ?? 'TaskMarket Agent Registration API',
      version: options.serviceVersion ?? AGENT_REGISTRATION_API_VERSION,
      description:
        options.serviceDescription ??
        'Transport-agnostic agent registration API: register, update, read, disable, and validate agent profiles.',
    },
    paths,
    components: { schemas },
  };

  if (options.baseUrl !== undefined && options.baseUrl.length > 0) {
    document.servers = [{ url: options.baseUrl }];
  }

  return document;
}
