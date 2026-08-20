import { describe, expect, it } from 'vitest';

import { AGENT_REGISTRY_ERROR_CODES, AgentRegistryDatabaseError } from '../errors.js';
import { createRegisteredAgent } from '../domain.js';
import { InMemoryAgentRegistryRepository, type AgentRegistryRepository } from '../repository.js';
import type { AgentEndpointInput, AgentStatus, RegisteredAgent } from '../types.js';
import { createCapabilityDiscoveryService } from './service.js';
import type { CapabilityDiscoveryService } from './types.js';

const FIXED_NOW = 1_700_000_000_000;
const deps = {
  clock: () => FIXED_NOW,
  agentIdFactory: () => 'agent-0001',
  endpointIdFactory: () => 'endpoint-0001',
};

interface SeedInput {
  id: string;
  name: string;
  capabilities: string[];
  status?: AgentStatus;
  endpoints?: AgentEndpointInput[];
}

async function register(repository: AgentRegistryRepository, input: SeedInput): Promise<void> {
  await repository.create(
    createRegisteredAgent(
      {
        ownerRef: 'owner-1',
        name: input.name,
        capabilities: input.capabilities,
        status: input.status ?? 'active',
        endpoints: input.endpoints ?? [],
        description: `${input.name} description`,
      },
      { ...deps, agentIdFactory: () => input.id },
    ),
  );
}

/** Repository whose listAll always fails. */
class BrokenListRepository implements AgentRegistryRepository {
  create(): Promise<RegisteredAgent> {
    throw new AgentRegistryDatabaseError('boom', new Error('pg connection refused'));
  }
  getById(): Promise<RegisteredAgent | null> {
    throw new Error('unexpected failure');
  }
  listAll(): Promise<RegisteredAgent[]> {
    throw new AgentRegistryDatabaseError('boom', new Error('pg connection refused'));
  }
  listByOwner(): Promise<RegisteredAgent[]> {
    throw new Error('unexpected failure');
  }
  save(): Promise<RegisteredAgent> {
    throw new Error('unexpected failure');
  }
}

async function seeded(): Promise<CapabilityDiscoveryService> {
  const repository = new InMemoryAgentRegistryRepository();
  await register(repository, { id: 'trader', name: 'Alpha Trader', capabilities: ['wallet:read'] });
  await register(repository, {
    id: 'wallet',
    name: 'Wallet Bot',
    capabilities: ['wallet:read', 'wallet:send'],
  });
  await register(repository, {
    id: 'storage',
    name: 'Storage Keeper',
    capabilities: ['storage:put', 'storage:get'],
  });
  await register(repository, {
    id: 'draft',
    name: 'Hidden Draft',
    capabilities: ['agent:meta'],
    status: 'draft',
  });
  return createCapabilityDiscoveryService(repository);
}

describe('createCapabilityDiscoveryService', () => {
  it('searches active agents and reports the true total', async () => {
    const api = await seeded();
    const response = await api.query({});
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.result.total).toBe(3);
      expect(response.result.items.map((item) => item.id).sort()).toEqual([
        'storage',
        'trader',
        'wallet',
      ]);
    }
  });

  it('filters by capability keys (AND) and excludes drafts', async () => {
    const api = await seeded();
    const response = await api.query({ capabilities: ['wallet:read'] });
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.result.items.map((item) => item.id).sort()).toEqual(['trader', 'wallet']);
    }
    const both = await api.query({ capabilities: ['wallet:read', 'wallet:send'] });
    if (both.ok) {
      expect(both.result.items.map((item) => item.id)).toEqual(['wallet']);
    }
  });

  it('filters by namespaces', async () => {
    const api = await seeded();
    const response = await api.query({ namespaces: ['storage'] });
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.result.items.map((item) => item.id)).toEqual(['storage']);
    }
  });

  it('paginates', async () => {
    const api = await seeded();
    const page = await api.query({ sortBy: 'name', sortDirection: 'asc', limit: 2, offset: 0 });
    expect(page.ok).toBe(true);
    if (page.ok) {
      expect(page.result.total).toBe(3);
      expect(page.result.items.map((item) => item.id)).toEqual(['trader', 'storage']);
    }
  });

  it('returns a structured error for an invalid query (never throws)', async () => {
    const api = await seeded();
    const response = await api.query({ capabilities: ['WALLET:READ'] });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.REQUEST_INVALID);
      expect(response.error.issues?.length).toBeGreaterThan(0);
    }
  });

  it('surfaces repository failures as structured DATABASE errors', async () => {
    const api = createCapabilityDiscoveryService(new BrokenListRepository());
    const response = await api.query({});
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.DATABASE);
    }
  });

  it('exposes parseQuery, contractVersion, and openapi', async () => {
    const api = await seeded();
    expect(api.parseQuery({ limit: 10 }).ok).toBe(true);
    expect(api.parseQuery({ limit: 'ten' }).ok).toBe(false);
    expect(api.contractVersion()).toBe('1.0.0');
    const document = api.openapi();
    expect(document.openapi).toBe('3.1.0');
    expect(document.paths['/capabilities/search']).toBeDefined();
  });
});
