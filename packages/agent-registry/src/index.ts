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
} from './schemas.js';

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
