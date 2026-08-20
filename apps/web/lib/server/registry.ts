import { Pool } from 'pg';

import {
  createAgentRegistrationService,
  createCapabilityDiscoveryService,
  PostgresAgentRegistryRepository,
  type AgentRegistrationResponse,
  type AgentRegistrationService,
  type CapabilityDiscoveryService,
  type RegisteredAgent,
} from '@taskmarket/agent-registry';
import { getDatabaseUrl } from '../env.js';

export interface RegistryServices {
  readonly pool: Pool;
  readonly repository: PostgresAgentRegistryRepository;
  readonly registration: AgentRegistrationService;
  readonly discovery: CapabilityDiscoveryService;
}

/**
 * Unwrap the agent carried by a successful registration response. The service
 * always attaches `agent` for register/update/get/disable; this guards the
 * type-level optionality at the adapter boundary.
 */
export function requireOkAgent(response: AgentRegistrationResponse): RegisteredAgent {
  if (!response.ok || response.agent === undefined) {
    throw new Error('Registration response claimed ok but carried no agent.');
  }
  return response.agent;
}

let cached: RegistryServices | null = null;

/**
 * The dashboard's HTTP adapter: the transport-agnostic registration and
 * discovery services over the Postgres registry. Created once per process and
 * reused by server components and route handlers.
 */
export function getRegistryServices(): RegistryServices {
  if (cached !== null) {
    return cached;
  }
  const pool = new Pool({ connectionString: getDatabaseUrl(), max: 10 });
  const repository = new PostgresAgentRegistryRepository(pool);
  const registration = createAgentRegistrationService(repository, {
    serviceName: 'Agent Registry Dashboard',
    serviceDescription:
      'HTTP adapter for the agent registration API used by the TaskMarket development dashboard.',
  });
  const discovery = createCapabilityDiscoveryService(repository, {
    serviceName: 'Agent Registry Dashboard — Capability Discovery',
  });
  cached = { pool, repository, registration, discovery };
  return cached;
}

/** Close the shared pool (used by tests and long-lived processes). */
export async function closeRegistryServices(): Promise<void> {
  if (cached === null) {
    return;
  }
  await cached.pool.end().catch(() => {});
  cached = null;
}
