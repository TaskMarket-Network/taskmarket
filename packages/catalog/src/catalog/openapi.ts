import { zodToJsonSchema } from '@taskmarket/agent-registry';

import { marketplaceListingSchema } from '../schemas.js';
import {
  marketplaceCatalogCreatePayloadSchema,
  marketplaceCatalogErrorSchema,
  marketplaceCatalogGetPayloadSchema,
  marketplaceCatalogLifecyclePayloadSchema,
  marketplaceCatalogListPayloadSchema,
  marketplaceCatalogRequestIdSchema,
  marketplaceCatalogRequestSchema,
  marketplaceCatalogResponseSchema,
  marketplaceCatalogUpdatePayloadSchema,
} from './schemas.js';
import { MARKETPLACE_CATALOG_API_VERSION } from './version.js';

/** OpenAPI 3.1 document describing the TaskMarket marketplace catalog API. */
export interface MarketplaceCatalogOpenApiDocument {
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

export interface MarketplaceCatalogOpenApiOptions {
  /** Service name used as the OpenAPI title. Defaults to `TaskMarket Marketplace Catalog API`. */
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
 * Build a clear, transport-agnostic OpenAPI 3.1 document for the marketplace
 * catalog API: one POST endpoint per action (`create`, `update`, `get`,
 * `list`, `publish`, `pause`, `delist`) with the typed request envelope and
 * the `MarketplaceCatalogResponse`. Payload schemas are converted from their
 * Zod schemas, so the documentation can never drift from the validated
 * contract.
 */
export function buildMarketplaceCatalogOpenApi(
  options: MarketplaceCatalogOpenApiOptions = {},
): MarketplaceCatalogOpenApiDocument {
  const schemas: Record<string, unknown> = {
    MarketplaceCatalogRequest: zodToJsonSchema(marketplaceCatalogRequestSchema),
    MarketplaceCatalogResponse: zodToJsonSchema(marketplaceCatalogResponseSchema),
    MarketplaceCatalogError: zodToJsonSchema(marketplaceCatalogErrorSchema),
    MarketplaceCatalogRequestId: zodToJsonSchema(marketplaceCatalogRequestIdSchema),
    MarketplaceListing: zodToJsonSchema(marketplaceListingSchema),
    'Payload.Create': zodToJsonSchema(marketplaceCatalogCreatePayloadSchema),
    'Payload.Update': zodToJsonSchema(marketplaceCatalogUpdatePayloadSchema),
    'Payload.Get': zodToJsonSchema(marketplaceCatalogGetPayloadSchema),
    'Payload.List': zodToJsonSchema(marketplaceCatalogListPayloadSchema),
    'Payload.Lifecycle': zodToJsonSchema(marketplaceCatalogLifecyclePayloadSchema),
  };

  const operations: { action: string; path: string; summary: string; description: string }[] = [
    {
      action: 'create',
      path: '/listings/create',
      summary: 'Create a marketplace listing for a registered agent.',
      description:
        "Creates a listing owned by the principal for a registered agent the principal owns. The listing capabilities must be a subset of the agent's declared capabilities. Idempotent: replaying an identical listing under the same id and principal returns the stored listing.",
    },
    {
      action: 'update',
      path: '/listings/update',
      summary: 'Update mutable fields of a marketplace listing.',
      description:
        'Applies mutable-field changes with optimistic concurrency (`version`). The principal must own the listing.',
    },
    {
      action: 'get',
      path: '/listings/get',
      summary: 'Read a marketplace listing.',
      description: 'Returns the listing owned by the principal. Public discovery is a later step.',
    },
    {
      action: 'list',
      path: '/listings/list',
      summary: "List the principal's marketplace listings.",
      description: 'Returns all listings owned by the principal (oldest first).',
    },
    {
      action: 'publish',
      path: '/listings/publish',
      summary: 'Publish a listing (make it discoverable).',
      description:
        'Transitions the listing to `published` with optimistic concurrency. The referenced agent must be `active`. Idempotent: publishing an already-published listing succeeds when the version matches.',
    },
    {
      action: 'pause',
      path: '/listings/pause',
      summary: 'Pause a published listing.',
      description:
        'Transitions the listing to `paused` with optimistic concurrency. Idempotent when already paused and the version matches.',
    },
    {
      action: 'delist',
      path: '/listings/delist',
      summary: 'Delist a listing (terminal state).',
      description:
        'Transitions the listing to `delisted` (terminal) with optimistic concurrency. Idempotent when already delisted and the version matches.',
    },
  ];

  const paths: Record<string, unknown> = {};
  for (const operation of operations) {
    const action = operation.action;
    const requestName = `Operation.${action}.Request`;
    const payloadName =
      action === 'publish' || action === 'pause' || action === 'delist'
        ? 'Payload.Lifecycle'
        : `Payload.${action[0]?.toUpperCase() ?? ''}${action.slice(1)}`;
    schemas[requestName] = {
      type: 'object',
      properties: {
        ...(zodToJsonSchema(marketplaceCatalogRequestSchema).properties as Record<string, unknown>),
        payload: jsonSchemaRef(payloadName),
      },
      required: ['contractVersion', 'requestId', 'action', 'principal', 'payload'],
    };

    paths[operation.path] = {
      post: {
        operationId: `listing${operation.action[0]?.toUpperCase() ?? ''}${operation.action.slice(1)}`,
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
                schema: jsonSchemaRef('MarketplaceCatalogResponse'),
              },
            },
          },
        },
      },
    };
  }

  const document: MarketplaceCatalogOpenApiDocument = {
    openapi: '3.1.0',
    info: {
      title: options.serviceName ?? 'TaskMarket Marketplace Catalog API',
      version: options.serviceVersion ?? MARKETPLACE_CATALOG_API_VERSION,
      description:
        options.serviceDescription ??
        'Transport-agnostic marketplace catalog API: manage listings that turn registered agents into discoverable services.',
    },
    paths,
    components: { schemas },
  };

  if (options.baseUrl !== undefined && options.baseUrl.length > 0) {
    document.servers = [{ url: options.baseUrl }];
  }

  return document;
}
