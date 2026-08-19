import { describe, expect, it } from 'vitest';

import { AgentRegistryInputError, AgentRegistryStatusTransitionError } from './errors.js';
import { applyAgentUpdate, createRegisteredAgent, assertStatusTransition } from './domain.js';
import { AGENT_REGISTRY_ERROR_CODES } from './errors.js';

const FIXED_NOW = 1_700_000_000_000;
const deps = {
  clock: () => FIXED_NOW,
  agentIdFactory: () => 'agent-0001',
  endpointIdFactory: () => 'endpoint-0001',
};

const BASE_INPUT = {
  ownerRef: 'account-42',
  name: 'Reference Agent',
  description: 'Minimal reference agent.',
  capabilities: ['agent:meta', 'wallet:read'],
  endpoints: [
    { type: 'mcp' as const, url: 'https://example.com/mcp', metadata: { transport: 'streamable' } },
    { type: 'http' as const, url: 'http://localhost:8080/tools' },
  ],
};

describe('createRegisteredAgent', () => {
  it('creates an agent with generated id and version 1', () => {
    const agent = createRegisteredAgent(BASE_INPUT, deps);
    expect(agent.id).toBe('agent-0001');
    expect(agent.ownerRef).toBe('account-42');
    expect(agent.version).toBe(1);
    expect(agent.status).toBe('draft');
    expect(agent.createdAt).toBe('2023-11-14T22:13:20.000Z');
    expect(agent.updatedAt).toBe(agent.createdAt);
    expect(agent.capabilities).toEqual(['agent:meta', 'wallet:read']);
  });

  it('honors a caller-supplied id', () => {
    const agent = createRegisteredAgent({ ...BASE_INPUT, id: 'custom-id' }, deps);
    expect(agent.id).toBe('custom-id');
  });

  it('fills missing endpoint ids deterministically', () => {
    const agent = createRegisteredAgent(BASE_INPUT, deps);
    expect(agent.endpoints.map((endpoint) => endpoint.id)).toEqual([
      'endpoint-0001',
      'endpoint-0001',
    ]);
    expect(agent.endpoints[0]).toMatchObject({
      type: 'mcp',
      url: 'https://example.com/mcp',
    });
  });

  it('rejects input without capabilities', () => {
    expect(() => createRegisteredAgent({ ...BASE_INPUT, capabilities: [] }, deps)).toThrow(
      AgentRegistryInputError,
    );
  });

  it('rejects a non-http(s) endpoint URL', () => {
    expect(() =>
      createRegisteredAgent(
        { ...BASE_INPUT, endpoints: [{ type: 'mcp', url: 'ftp://example.com/x' }] },
        deps,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: AGENT_REGISTRY_ERROR_CODES.INPUT_INVALID,
      }) as unknown as Error,
    );
  });

  it('rejects unknown fields (strict schema)', () => {
    expect(() =>
      createRegisteredAgent(
        { ...BASE_INPUT, createdAt: '2020-01-01T00:00:00.000Z' } as never,
        deps,
      ),
    ).toThrow(AgentRegistryInputError);
  });
});

describe('applyAgentUpdate', () => {
  const agent = createRegisteredAgent(BASE_INPUT, deps);

  it('updates mutable fields, increments version, and bumps updatedAt', () => {
    const updated = applyAgentUpdate(
      agent,
      { name: 'Renamed Agent', description: 'New description.' },
      { ...deps, clock: () => FIXED_NOW + 1000 },
    );
    expect(updated.name).toBe('Renamed Agent');
    expect(updated.description).toBe('New description.');
    expect(updated.version).toBe(2);
    expect(updated.updatedAt).toBe('2023-11-14T22:13:21.000Z');
    expect(updated.createdAt).toBe(agent.createdAt);
    expect(updated.id).toBe(agent.id);
    expect(updated.ownerRef).toBe(agent.ownerRef);
  });

  it('does not mutate the original object', () => {
    const original = createRegisteredAgent(BASE_INPUT, deps);
    applyAgentUpdate(original, { name: 'New' }, deps);
    expect(original.name).toBe('Reference Agent');
    expect(original.version).toBe(1);
  });

  it('rejects attempts to change immutable fields via the input boundary', () => {
    expect(() => applyAgentUpdate(agent, { id: 'other-id' } as never, deps)).toThrow(
      AgentRegistryInputError,
    );
    expect(() => applyAgentUpdate(agent, { ownerRef: 'other-owner' } as never, deps)).toThrow(
      AgentRegistryInputError,
    );
    expect(() =>
      applyAgentUpdate(agent, { createdAt: '2020-01-01T00:00:00.000Z' } as never, deps),
    ).toThrow(AgentRegistryInputError);
  });

  it('rejects a no-op update', () => {
    expect(() => applyAgentUpdate(agent, {}, deps)).toThrow(AgentRegistryInputError);
  });

  it('replaces endpoints and regenerates missing ids', () => {
    const updated = applyAgentUpdate(
      agent,
      { endpoints: [{ type: 'webhook', url: 'https://example.com/hook' }] },
      { ...deps, endpointIdFactory: () => 'hook-0001' },
    );
    expect(updated.endpoints).toHaveLength(1);
    expect(updated.endpoints[0]?.id).toBe('hook-0001');
  });
});

describe('status transitions', () => {
  it('allows draft -> active and active -> suspended -> active', () => {
    expect(() => assertStatusTransition('draft', 'active')).not.toThrow();
    expect(() => assertStatusTransition('active', 'suspended')).not.toThrow();
    expect(() => assertStatusTransition('suspended', 'active')).not.toThrow();
  });

  it('allows retiring from draft, active, and suspended', () => {
    expect(() => assertStatusTransition('draft', 'retired')).not.toThrow();
    expect(() => assertStatusTransition('active', 'retired')).not.toThrow();
    expect(() => assertStatusTransition('suspended', 'retired')).not.toThrow();
  });

  it('rejects invalid transitions', () => {
    expect(() => assertStatusTransition('draft', 'suspended')).toThrow(
      AgentRegistryStatusTransitionError,
    );
    expect(() => assertStatusTransition('retired', 'active')).toThrow(
      AgentRegistryStatusTransitionError,
    );
    expect(() => assertStatusTransition('suspended', 'draft')).toThrow(
      AgentRegistryStatusTransitionError,
    );
  });

  it('enforces transitions through applyAgentUpdate', () => {
    const agent = createRegisteredAgent(BASE_INPUT, deps);
    const active = applyAgentUpdate(agent, { status: 'active' }, deps);
    expect(active.status).toBe('active');
    expect(() => applyAgentUpdate(agent, { status: 'suspended' }, deps)).toThrow(
      AgentRegistryStatusTransitionError,
    );
  });
});
