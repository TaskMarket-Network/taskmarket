import { zodToJsonSchema } from '@taskmarket/agent-registry';

import {
  serviceOfferingCreatePayloadSchema,
  serviceOfferingErrorSchema,
  serviceOfferingGetPayloadSchema,
  serviceOfferingLifecyclePayloadSchema,
  serviceOfferingListPayloadSchema,
  serviceOfferingRequestIdSchema,
  serviceOfferingRequestSchema,
  serviceOfferingResponseSchema,
  serviceOfferingUpdatePayloadSchema,
} from './api.js';
import { serviceOfferingSchema } from './schemas.js';
import { SERVICE_OFFERING_API_VERSION } from './version.js';

/** OpenAPI 3.1 document describing the TaskMarket service offerings API. */
export interface ServiceOfferingOpenApiDocument {
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

export interface ServiceOfferingOpenApiOptions {
  /** Service name used as the OpenAPI title. Defaults to `TaskMarket Service Offerings API`. */
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
 * Build a clear, transport-agnostic OpenAPI 3.1 document for the service
 * offerings API: one POST endpoint per action (`create`, `update`, `get`,
 * `list`, `archive`, `activate`) with the typed request envelope and the
 * `ServiceOfferingResponse`. Payload schemas are converted from their Zod
 * schemas, so the documentation can never drift from the validated contract.
 */
export function buildServiceOfferingOpenApi(
  options: ServiceOfferingOpenApiOptions = {},
): ServiceOfferingOpenApiDocument {
  const schemas: Record<string, unknown> = {
    ServiceOfferingRequest: zodToJsonSchema(serviceOfferingRequestSchema),
    ServiceOfferingResponse: zodToJsonSchema(serviceOfferingResponseSchema),
    ServiceOfferingError: zodToJsonSchema(serviceOfferingErrorSchema),
    ServiceOfferingRequestId: zodToJsonSchema(serviceOfferingRequestIdSchema),
    ServiceOffering: zodToJsonSchema(serviceOfferingSchema),
    'Payload.Create': zodToJsonSchema(serviceOfferingCreatePayloadSchema),
    'Payload.Update': zodToJsonSchema(serviceOfferingUpdatePayloadSchema),
    'Payload.Get': zodToJsonSchema(serviceOfferingGetPayloadSchema),
    'Payload.List': zodToJsonSchema(serviceOfferingListPayloadSchema),
    'Payload.Lifecycle': zodToJsonSchema(serviceOfferingLifecyclePayloadSchema),
  };

  const operations: { action: string; path: string; summary: string; description: string }[] = [
    {
      action: 'create',
      path: '/offerings/create',
      summary: 'Create a service offering for a registered agent.',
      description:
        "Creates a reusable service definition owned by the principal for a registered agent the principal owns. The offering capabilities must be a subset of the agent's declared capabilities. Idempotent: replaying an identical offering under the same id and principal returns the stored offering.",
    },
    {
      action: 'update',
      path: '/offerings/update',
      summary: 'Update mutable fields of a service offering.',
      description:
        'Applies mutable-field changes with optimistic concurrency (`version`). The principal must own the offering.',
    },
    {
      action: 'get',
      path: '/offerings/get',
      summary: 'Read a service offering.',
      description: 'Returns the offering owned by the principal. Public discovery is a later step.',
    },
    {
      action: 'list',
      path: '/offerings/list',
      summary: "List the principal's service offerings.",
      description: 'Returns all offerings owned by the principal (oldest first).',
    },
    {
      action: 'archive',
      path: '/offerings/archive',
      summary: 'Archive a service offering.',
      description:
        'Transitions the offering to `archived` with optimistic concurrency. Idempotent: archiving an already-archived offering succeeds when the version matches.',
    },
    {
      action: 'activate',
      path: '/offerings/activate',
      summary: 'Activate an archived service offering.',
      description:
        'Transitions the offering back to `active` with optimistic concurrency. Idempotent when already active and the version matches.',
    },
  ];

  const paths: Record<string, unknown> = {};
  for (const operation of operations) {
    const action = operation.action;
    const requestName = `Operation.${action}.Request`;
    const payloadName =
      action === 'archive' || action === 'activate'
        ? 'Payload.Lifecycle'
        : `Payload.${action[0]?.toUpperCase() ?? ''}${action.slice(1)}`;
    schemas[requestName] = {
      type: 'object',
      properties: {
        ...(zodToJsonSchema(serviceOfferingRequestSchema).properties as Record<string, unknown>),
        payload: jsonSchemaRef(payloadName),
      },
      required: ['contractVersion', 'requestId', 'action', 'principal', 'payload'],
    };

    paths[operation.path] = {
      post: {
        operationId: `offering${operation.action[0]?.toUpperCase() ?? ''}${operation.action.slice(1)}`,
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
                schema: jsonSchemaRef('ServiceOfferingResponse'),
              },
            },
          },
        },
      },
    };
  }

  const document: ServiceOfferingOpenApiDocument = {
    openapi: '3.1.0',
    info: {
      title: options.serviceName ?? 'TaskMarket Service Offerings API',
      version: options.serviceVersion ?? SERVICE_OFFERING_API_VERSION,
      description:
        options.serviceDescription ??
        'Transport-agnostic service offerings API: manage reusable service definitions with typed inputs, outputs, pricing, estimated execution time, constraints, and versioning.',
    },
    paths,
    components: { schemas },
  };

  if (options.baseUrl !== undefined && options.baseUrl.length > 0) {
    document.servers = [{ url: options.baseUrl }];
  }

  return document;
}
