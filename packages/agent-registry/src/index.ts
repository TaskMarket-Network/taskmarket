export {
  AGENT_REGISTRY_ERROR_CODES,
  AgentRegistryDatabaseError,
  AgentRegistryDuplicateError,
  AgentRegistryError,
  AgentRegistryImmutableFieldError,
  AgentRegistryInputError,
  AgentRegistryNotFoundError,
  AgentRegistryStatusTransitionError,
  AgentRegistryVersionConflictError,
  type AgentRegistryErrorCode,
} from './errors.js';

export {
  AGENT_STATUS_TRANSITIONS,
  applyAgentUpdate,
  assertStatusTransition,
  createRegisteredAgent,
  type RegistryClock,
  type RegistryDeps,
} from './domain.js';

export { InMemoryAgentRegistryRepository, type AgentRegistryRepository } from './repository.js';

export { PostgresAgentRegistryRepository } from './postgres.js';

export {
  agentCapabilitySchema,
  agentEndpointInputSchema,
  agentEndpointSchema,
  agentEndpointTypeSchema,
  agentPricingSchema,
  agentStatusSchema,
  agentUpdateInputSchema,
  httpUrlSchema,
  registeredAgentInputSchema,
  registeredAgentSchema,
} from './schemas.js';

export {
  agentDisablePayloadSchema,
  agentGetPayloadSchema,
  agentRegisterPayloadSchema,
  agentRegistrationActionSchema,
  agentRegistrationErrorSchema,
  agentRegistrationPayloadSchemas,
  agentRegistrationPrincipalSchema,
  agentRegistrationRequestIdSchema,
  agentRegistrationRequestSchema,
  agentRegistrationResponseSchema,
  agentUpdatePayloadSchema,
  agentValidatePayloadSchema,
  buildAgentRegistrationOpenApi,
  createAgentRegistrationService,
  zodToJsonSchema,
  AGENT_REGISTRATION_API_SUPPORTED_VERSIONS,
  AGENT_REGISTRATION_API_VERSION,
  type AgentDisablePayload,
  type AgentGetPayload,
  type AgentRegisterPayload,
  type AgentRegistrationAction,
  type AgentRegistrationApiContractVersion,
  type AgentRegistrationError,
  type AgentRegistrationOpenApiDocument,
  type AgentRegistrationOpenApiOptions,
  type AgentRegistrationOptions,
  type AgentRegistrationParseResult,
  type AgentRegistrationRequest,
  type AgentRegistrationRequestId,
  type AgentRegistrationResponse,
  type AgentRegistrationService,
  type AgentUpdatePayload,
  type AgentValidatePayload,
  type JsonSchema,
} from './api/index.js';

export type {
  AgentEndpoint,
  AgentEndpointInput,
  AgentEndpointType,
  AgentPricing,
  AgentStatus,
  AgentUpdateInput,
  RegisteredAgent,
  RegisteredAgentInput,
} from './types.js';
