import { randomUUID } from 'node:crypto';

import { AgentRegistryInputError, AgentRegistryStatusTransitionError } from './errors.js';
import { agentUpdateInputSchema, registeredAgentInputSchema } from './schemas.js';
import type {
  AgentEndpoint,
  AgentEndpointInput,
  AgentStatus,
  AgentUpdateInput,
  RegisteredAgent,
  RegisteredAgentInput,
} from './types.js';

/** Injectable clock returning epoch milliseconds (deterministic tests). */
export type RegistryClock = () => number;

/** Injectable id factories (deterministic tests). */
export interface RegistryDeps {
  /** Clock returning epoch milliseconds. Defaults to `Date.now`. */
  clock?: RegistryClock;
  /** Factory for agent ids. Defaults to `randomUUID`. */
  agentIdFactory?: () => string;
  /** Factory for endpoint ids. Defaults to `randomUUID`. */
  endpointIdFactory?: () => string;
}

/** Allowed status transitions. `draft -> active -> suspended -> retired`. */
export const AGENT_STATUS_TRANSITIONS: Readonly<Record<AgentStatus, readonly AgentStatus[]>> = {
  draft: ['active', 'retired'],
  active: ['suspended', 'retired'],
  suspended: ['active', 'retired'],
  retired: [],
};

/** Throw when `from -> to` is not an allowed status transition. */
export function assertStatusTransition(from: AgentStatus, to: AgentStatus): void {
  if (from === to) {
    return;
  }
  if (!AGENT_STATUS_TRANSITIONS[from].includes(to)) {
    throw new AgentRegistryStatusTransitionError(from, to);
  }
}

/** Fill any endpoint without an id using the injected factory. */
function materializeEndpoints(
  endpoints: readonly AgentEndpointInput[],
  endpointIdFactory: () => string,
): AgentEndpoint[] {
  return endpoints.map((endpoint) =>
    endpoint.id !== undefined
      ? { ...endpoint, id: endpoint.id }
      : { ...endpoint, id: endpointIdFactory() },
  );
}

function epochIso(now: number): string {
  return new Date(now).toISOString();
}

/**
 * Create a registered agent from validated input. Immutable fields (`id`,
 * `ownerRef`, `createdAt`) are set here and never change; `version` starts at
 * 1. Returns a new readonly domain object.
 */
export function createRegisteredAgent(
  input: RegisteredAgentInput,
  deps: RegistryDeps = {},
): RegisteredAgent {
  const parsed = registeredAgentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AgentRegistryInputError(parsed.error.issues.map((issue) => issue.message));
  }

  const clock = deps.clock ?? Date.now;
  const agentIdFactory = deps.agentIdFactory ?? randomUUID;
  const endpointIdFactory = deps.endpointIdFactory ?? randomUUID;
  const now = epochIso(clock());

  return {
    id: parsed.data.id ?? agentIdFactory(),
    ownerRef: parsed.data.ownerRef,
    name: parsed.data.name,
    description: parsed.data.description,
    capabilities: [...parsed.data.capabilities],
    endpoints: materializeEndpoints(parsed.data.endpoints, endpointIdFactory),
    status: parsed.data.status,
    ...(parsed.data.pricing !== undefined ? { pricing: parsed.data.pricing } : {}),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Apply an update to a registered agent's mutable fields. Immutable fields are
 * rejected at the input boundary (the schema only admits mutable fields).
 * Status changes are validated against the allowed transitions. Returns a new
 * domain object with `version` incremented and `updatedAt` bumped; the input
 * object is never mutated.
 */
export function applyAgentUpdate(
  agent: RegisteredAgent,
  input: AgentUpdateInput,
  deps: RegistryDeps = {},
): RegisteredAgent {
  const parsed = agentUpdateInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AgentRegistryInputError(parsed.error.issues.map((issue) => issue.message));
  }

  if (parsed.data.status !== undefined) {
    assertStatusTransition(agent.status, parsed.data.status);
  }

  const clock = deps.clock ?? Date.now;
  const endpointIdFactory = deps.endpointIdFactory ?? randomUUID;
  const now = epochIso(clock());

  const next: RegisteredAgent = {
    id: agent.id,
    ownerRef: agent.ownerRef,
    name: parsed.data.name ?? agent.name,
    description: parsed.data.description ?? agent.description,
    capabilities: parsed.data.capabilities
      ? [...parsed.data.capabilities]
      : [...agent.capabilities],
    endpoints: parsed.data.endpoints
      ? materializeEndpoints(parsed.data.endpoints, endpointIdFactory)
      : agent.endpoints.map((endpoint) => ({ ...endpoint })),
    status: parsed.data.status ?? agent.status,
    version: agent.version + 1,
    createdAt: agent.createdAt,
    updatedAt: now,
  };

  const pricing = parsed.data.pricing ?? agent.pricing;
  return pricing === undefined ? next : { ...next, pricing };
}
