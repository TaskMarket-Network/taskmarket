import { describe, expect, it } from 'vitest';

import { createRegisteredAgent, type RegistryDeps } from '../domain.js';
import type { AgentEndpointInput, AgentStatus, RegisteredAgent } from '../types.js';
import { searchCapabilities } from './search.js';
import type { CapabilityDiscoveryQuery } from './types.js';

const FIXED_NOW = 1_700_000_000_000;
const deps: RegistryDeps = {
  clock: () => FIXED_NOW,
  agentIdFactory: () => 'agent-0001',
  endpointIdFactory: () => 'endpoint-0001',
};

const BASE = {
  ownerRef: 'owner-1',
  capabilities: ['agent:meta'],
};

function agent(
  input: {
    name: string;
    capabilities?: string[];
    status?: AgentStatus;
    endpoints?: AgentEndpointInput[];
  },
  id: string,
): RegisteredAgent {
  return createRegisteredAgent(
    {
      ...BASE,
      name: input.name,
      capabilities: input.capabilities ?? ['agent:meta'],
      status: input.status ?? 'active',
      endpoints: input.endpoints ?? [],
      description: `${input.name} description`,
    },
    { ...deps, agentIdFactory: () => id },
  );
}

function query(overrides: Partial<CapabilityDiscoveryQuery> = {}): CapabilityDiscoveryQuery {
  return {
    sortBy: 'relevance',
    sortDirection: 'desc',
    limit: 20,
    offset: 0,
    ...overrides,
  };
}

describe('searchCapabilities', () => {
  it('returns only active agents', () => {
    const agents = [
      agent({ name: 'Active Agent' }, 'a1'),
      agent({ name: 'Draft Agent', status: 'draft' }, 'd1'),
      agent({ name: 'Retired Agent', status: 'retired' }, 'r1'),
      agent({ name: 'Suspended Agent', status: 'suspended' }, 's1'),
    ];
    const result = searchCapabilities(agents, query());
    expect(result.total).toBe(1);
    expect(result.items.map((item) => item.id)).toEqual(['a1']);
  });

  it('matches capability keys with AND semantics', () => {
    const agents = [
      agent({ name: 'A', capabilities: ['wallet:read'] }, 'a1'),
      agent({ name: 'B', capabilities: ['wallet:read', 'wallet:send'] }, 'b1'),
    ];
    const result = searchCapabilities(
      agents,
      query({ capabilities: ['wallet:read', 'wallet:send'] }),
    );
    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe('b1');
  });

  it('matches namespaces with any semantics', () => {
    const agents = [
      agent({ name: 'A', capabilities: ['wallet:read'] }, 'a1'),
      agent({ name: 'B', capabilities: ['agent:meta'] }, 'b1'),
    ];
    const result = searchCapabilities(agents, query({ namespaces: ['wallet', 'storage'] }));
    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe('a1');
  });

  it('combines filters with AND', () => {
    const agents = [
      agent({ name: 'A', capabilities: ['wallet:read'] }, 'a1'),
      agent({ name: 'B', capabilities: ['wallet:read', 'agent:meta'] }, 'b1'),
      agent({ name: 'C', capabilities: ['agent:meta'] }, 'c1'),
    ];
    const result = searchCapabilities(
      agents,
      query({ capabilities: ['wallet:read'], namespaces: ['agent'] }),
    );
    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe('b1');
  });

  it('matches free text case-insensitively over name, description, and keys', () => {
    const agents = [
      agent({ name: 'Alpha Trader', capabilities: ['wallet:read'] }, 'a1'),
      agent({ name: 'Beta Bot', capabilities: ['agent:meta'] }, 'b1'),
    ];
    expect(searchCapabilities(agents, query({ query: 'ALPHA' })).total).toBe(1);
    expect(searchCapabilities(agents, query({ query: 'BETA bot' })).total).toBe(1);
    expect(searchCapabilities(agents, query({ query: 'wallet' })).total).toBe(1);
    expect(searchCapabilities(agents, query({ query: 'nothing' })).total).toBe(0);
  });

  it('ranks by relevance (exact + namespace matches) descending by default', () => {
    const agents = [
      agent({ name: 'A', capabilities: ['storage:get'] }, 'a1'),
      agent({ name: 'B', capabilities: ['storage:get', 'storage:put'] }, 'b1'),
      agent({ name: 'C', capabilities: ['agent:meta'] }, 'c1'),
    ];
    const result = searchCapabilities(agents, query({ namespaces: ['storage'] }));
    expect(result.items.map((item) => item.id)).toEqual(['b1', 'a1']);
  });

  it('sorts by name ascending when requested', () => {
    const agents = [agent({ name: 'Zed' }, 'z1'), agent({ name: 'Alpha' }, 'a1')];
    const result = searchCapabilities(agents, query({ sortBy: 'name', sortDirection: 'asc' }));
    expect(result.items.map((item) => item.id)).toEqual(['a1', 'z1']);
  });

  it('paginates with limit and offset while reporting the true total', () => {
    const agents = [
      agent({ name: 'A' }, 'a1'),
      agent({ name: 'B' }, 'b1'),
      agent({ name: 'C' }, 'c1'),
    ];
    const pageOne = searchCapabilities(
      agents,
      query({ limit: 2, offset: 0, sortBy: 'name', sortDirection: 'asc' }),
    );
    expect(pageOne.total).toBe(3);
    expect(pageOne.items.map((item) => item.id)).toEqual(['a1', 'b1']);
    const pageTwo = searchCapabilities(
      agents,
      query({ limit: 2, offset: 2, sortBy: 'name', sortDirection: 'asc' }),
    );
    expect(pageTwo.items.map((item) => item.id)).toEqual(['c1']);
  });

  it('projects a safe item: metadata stripped, endpoint urls http(s), status active', () => {
    const withMetadata = createRegisteredAgent(
      {
        ...BASE,
        name: 'Safe Agent',
        status: 'active',
        endpoints: [
          {
            type: 'mcp',
            url: 'https://agent.example.com/mcp',
            metadata: { instructions: 'rm -rf /', env: 'SECRET=1' },
          },
        ],
      },
      { ...deps, agentIdFactory: () => 's1' },
    );
    const result = searchCapabilities([withMetadata], query());
    const item = result.items[0];
    expect(item?.status).toBe('active');
    expect(item?.endpoints).toEqual([
      { id: 'endpoint-0001', type: 'mcp', url: 'https://agent.example.com/mcp' },
    ]);
    expect(JSON.stringify(item)).not.toContain('instructions');
    expect(JSON.stringify(item)).not.toContain('SECRET');
  });

  it('is deterministic: identical input yields identical ordering', () => {
    const agents = [
      agent({ name: 'A', capabilities: ['wallet:read'] }, 'a1'),
      agent({ name: 'B', capabilities: ['wallet:read', 'wallet:send'] }, 'b1'),
    ];
    const first = searchCapabilities(agents, query({ capabilities: ['wallet:read'] }));
    const second = searchCapabilities(agents, query({ capabilities: ['wallet:read'] }));
    expect(first.items.map((item) => item.id)).toEqual(second.items.map((item) => item.id));
  });
});
