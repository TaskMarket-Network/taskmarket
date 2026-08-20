import { describe, expect, it } from 'vitest';

import { AGENT_REGISTRY_ERROR_CODES, AgentRegistryDatabaseError } from '../errors.js';
import { createAgentRegistrationService } from './service.js';
import type { AgentRegistrationService } from './types.js';
import { AGENT_REGISTRATION_API_VERSION } from './version.js';
import { InMemoryAgentRegistryRepository, type AgentRegistryRepository } from '../repository.js';
import type { RegisteredAgent } from '../types.js';

const FIXED_NOW = 1_700_000_000_000;
const TIMESTAMP = '2023-11-14T22:13:20.000Z';
const deps = {
  clock: () => FIXED_NOW,
  agentIdFactory: () => 'agent-0001',
  endpointIdFactory: () => 'endpoint-0001',
};

const REGISTER_INPUT = {
  id: 'agent-0001',
  ownerRef: 'owner-1',
  name: 'Reference Agent',
  description: 'Test agent',
  capabilities: ['agent:meta', 'wallet:read'],
  endpoints: [{ type: 'mcp', url: 'https://agent.example.com/mcp' }],
  status: 'draft',
};

function envelope(action: string, principal: string, payload: unknown, requestId = 'req_0001') {
  return { contractVersion: AGENT_REGISTRATION_API_VERSION, requestId, action, principal, payload };
}

/** Broken repository: every persistence call fails unexpectedly. */
class BrokenRepository implements AgentRegistryRepository {
  create(): Promise<RegisteredAgent> {
    throw new AgentRegistryDatabaseError('boom', new Error('pg connection refused'));
  }
  getById(): Promise<RegisteredAgent | null> {
    throw new Error('unexpected failure');
  }
  listByOwner(): Promise<RegisteredAgent[]> {
    throw new Error('unexpected failure');
  }
  save(): Promise<RegisteredAgent> {
    throw new Error('unexpected failure');
  }
}

function service(repository: AgentRegistryRepository = new InMemoryAgentRegistryRepository()): {
  service: AgentRegistrationService;
  repository: AgentRegistryRepository;
} {
  return { service: createAgentRegistrationService(repository, { deps }), repository };
}

describe('parseRequest', () => {
  it('accepts a well-formed request for each action', () => {
    const { service: api } = service();
    const valid: { action: string; payload: unknown }[] = [
      { action: 'register', payload: REGISTER_INPUT },
      { action: 'update', payload: { agentId: 'a', version: 1, update: { name: 'New' } } },
      { action: 'get', payload: { agentId: 'a' } },
      { action: 'disable', payload: { agentId: 'a', version: 1 } },
      { action: 'validate', payload: { candidate: { ...REGISTER_INPUT, id: undefined } } },
    ];
    for (const item of valid) {
      const result = api.parseRequest(envelope(item.action, 'owner-1', item.payload));
      expect(result.ok, item.action).toBe(true);
    }
  });

  it('rejects a malformed envelope', () => {
    const { service: api } = service();
    const result = api.parseRequest({ action: 'register', payload: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.REQUEST_INVALID);
    }
  });

  it('rejects an unsupported contract version', () => {
    const { service: api } = service();
    const result = api.parseRequest({
      ...envelope('register', 'owner-1', REGISTER_INPUT),
      contractVersion: '9.9.9',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.UNSUPPORTED_VERSION);
    }
  });

  it('rejects a payload that does not match the action', () => {
    const { service: api } = service();
    const result = api.parseRequest(envelope('register', 'owner-1', { agentId: 'x' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.REQUEST_INVALID);
      expect(result.error.issues?.length).toBeGreaterThan(0);
    }
  });
});

describe('register', () => {
  it('registers a profile owned by the principal (version 1)', async () => {
    const { service: api, repository } = service();
    const response = await api.handle(envelope('register', 'owner-1', REGISTER_INPUT));
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.action).toBe('register');
      expect(response.agent).toMatchObject({
        id: 'agent-0001',
        ownerRef: 'owner-1',
        name: 'Reference Agent',
        status: 'draft',
        version: 1,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      });
      expect(response.agent?.endpoints[0]?.id).toBe('endpoint-0001');
    }
    expect((await repository.getById('agent-0001'))?.version).toBe(1);
  });

  it('rejects registration by a non-owner principal (authorization boundary)', async () => {
    const { service: api } = service();
    const response = await api.handle(envelope('register', 'intruder', REGISTER_INPUT));
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.UNAUTHORIZED);
    }
    expect(await api.repository.getById('agent-0001')).toBeNull();
  });

  it('is idempotent for an identical replay under the same principal', async () => {
    const { service: api } = service();
    const first = await api.handle(envelope('register', 'owner-1', REGISTER_INPUT));
    const second = await api.handle(envelope('register', 'owner-1', REGISTER_INPUT, 'req_0002'));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.agent).toEqual(first.agent);
    }
  });

  it('reports a duplicate when replay content differs', async () => {
    const { service: api } = service();
    await api.handle(envelope('register', 'owner-1', REGISTER_INPUT));
    const response = await api.handle(
      envelope('register', 'owner-1', { ...REGISTER_INPUT, name: 'Different Name' }, 'req_0002'),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.DUPLICATE);
    }
  });

  it('surfaces database failures as structured DATABASE errors', async () => {
    const { service: api } = service(new BrokenRepository());
    const response = await api.handle(envelope('register', 'owner-1', REGISTER_INPUT));
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.DATABASE);
      expect(response.error.message).toContain('boom');
    }
  });
});

describe('update', () => {
  async function registered(): Promise<{
    service: AgentRegistrationService;
    repository: AgentRegistryRepository;
  }> {
    const ctx = service();
    await ctx.service.handle(envelope('register', 'owner-1', REGISTER_INPUT));
    return ctx;
  }

  it('applies a mutable-field update and bumps the version', async () => {
    const { service: api } = await registered();
    const response = await api.handle(
      envelope('update', 'owner-1', {
        agentId: 'agent-0001',
        version: 1,
        update: { name: 'Renamed' },
      }),
    );
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.agent?.name).toBe('Renamed');
      expect(response.agent?.version).toBe(2);
    }
  });

  it('rejects a stale version with an optimistic-concurrency conflict', async () => {
    const { service: api } = await registered();
    await api.handle(
      envelope('update', 'owner-1', {
        agentId: 'agent-0001',
        version: 1,
        update: { name: 'First' },
      }),
    );
    const response = await api.handle(
      envelope('update', 'owner-1', {
        agentId: 'agent-0001',
        version: 1,
        update: { name: 'Stale' },
      }),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.VERSION_CONFLICT);
    }
  });

  it('rejects updates by a non-owner principal', async () => {
    const { service: api } = await registered();
    const response = await api.handle(
      envelope('update', 'intruder', {
        agentId: 'agent-0001',
        version: 1,
        update: { name: 'Stolen' },
      }),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.UNAUTHORIZED);
    }
  });

  it('returns NOT_FOUND for an unknown agent', async () => {
    const { service: api } = await registered();
    const response = await api.handle(
      envelope('update', 'owner-1', { agentId: 'missing', version: 1, update: { name: 'X' } }),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.NOT_FOUND);
    }
  });

  it('rejects invalid status transitions', async () => {
    const { service: api } = await registered();
    const response = await api.handle(
      envelope('update', 'owner-1', {
        agentId: 'agent-0001',
        version: 1,
        update: { status: 'suspended' },
      }),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.STATUS_TRANSITION);
    }
  });

  it('rejects attempts to change immutable fields', async () => {
    const { service: api } = await registered();
    const response = await api.handle(
      envelope('update', 'owner-1', {
        agentId: 'agent-0001',
        version: 1,
        update: { name: 'X', ownerRef: 'someone-else' },
      }),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.REQUEST_INVALID);
    }
  });
});

describe('get', () => {
  it('returns the profile to its owner', async () => {
    const { service: api } = service();
    await api.handle(envelope('register', 'owner-1', REGISTER_INPUT));
    const response = await api.handle(envelope('get', 'owner-1', { agentId: 'agent-0001' }));
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.agent?.id).toBe('agent-0001');
    }
  });

  it('denies read to a non-owner', async () => {
    const { service: api } = service();
    await api.handle(envelope('register', 'owner-1', REGISTER_INPUT));
    const response = await api.handle(envelope('get', 'intruder', { agentId: 'agent-0001' }));
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.UNAUTHORIZED);
    }
  });

  it('returns NOT_FOUND for an unknown agent', async () => {
    const { service: api } = service();
    const response = await api.handle(envelope('get', 'owner-1', { agentId: 'missing' }));
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.NOT_FOUND);
    }
  });
});

describe('disable', () => {
  async function active(): Promise<{ service: AgentRegistrationService }> {
    const ctx = service();
    await ctx.service.handle(
      envelope('register', 'owner-1', { ...REGISTER_INPUT, status: 'active' }),
    );
    return ctx;
  }

  it('retires an active profile and bumps the version', async () => {
    const { service: api } = await active();
    const response = await api.handle(
      envelope('disable', 'owner-1', { agentId: 'agent-0001', version: 1 }),
    );
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.agent?.status).toBe('retired');
      expect(response.agent?.version).toBe(2);
    }
  });

  it('is idempotent when the profile is already retired', async () => {
    const { service: api } = await active();
    await api.handle(envelope('disable', 'owner-1', { agentId: 'agent-0001', version: 1 }));
    const second = await api.handle(
      envelope('disable', 'owner-1', { agentId: 'agent-0001', version: 2 }, 'req_0002'),
    );
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.agent?.status).toBe('retired');
    }
  });

  it('rejects a stale version with a concurrency conflict', async () => {
    const { service: api } = await active();
    await api.handle(envelope('disable', 'owner-1', { agentId: 'agent-0001', version: 1 }));
    const stale = await api.handle(
      envelope('disable', 'owner-1', { agentId: 'agent-0001', version: 1 }, 'req_0002'),
    );
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.VERSION_CONFLICT);
    }
  });

  it('denies disable to a non-owner', async () => {
    const { service: api } = await active();
    const response = await api.handle(
      envelope('disable', 'intruder', { agentId: 'agent-0001', version: 1 }),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.UNAUTHORIZED);
    }
  });
});

describe('validate', () => {
  it('returns the normalized candidate for a valid profile', async () => {
    const { service: api } = service();
    const response = await api.handle(
      envelope('validate', 'owner-1', {
        candidate: { ownerRef: 'owner-1', name: 'X', capabilities: ['agent:meta'] },
      }),
    );
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.candidate).toMatchObject({
        ownerRef: 'owner-1',
        name: 'X',
        description: '',
        status: 'draft',
        endpoints: [],
      });
    }
  });

  it('reports INPUT_INVALID with issues for an invalid profile', async () => {
    const { service: api } = service();
    const response = await api.handle(
      envelope('validate', 'owner-1', { candidate: { name: 'X', capabilities: [] } }),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.INPUT_INVALID);
      expect(response.error.issues?.length).toBeGreaterThan(0);
    }
  });

  it('never persists during validation', async () => {
    const { service: api, repository } = service();
    await api.handle(
      envelope('validate', 'owner-1', {
        candidate: { ownerRef: 'owner-1', name: 'X', capabilities: ['agent:meta'] },
      }),
    );
    expect(await repository.listByOwner('owner-1')).toHaveLength(0);
  });
});

describe('handle robustness', () => {
  it('never throws on malformed input and echoes a safe requestId', async () => {
    const { service: api } = service();
    const response = await api.handle({ requestId: 'req_bad!', action: 'register' });
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe(AGENT_REGISTRY_ERROR_CODES.REQUEST_INVALID);
    expect(response.requestId).toBe('tmr_unknown');
  });

  it('never throws on unexpected internal failures (INTERNAL error)', async () => {
    const { service: api } = service(new BrokenRepository());
    const response = await api.handle(
      envelope('update', 'owner-1', { agentId: 'x', version: 1, update: { name: 'X' } }),
    );
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe(AGENT_REGISTRY_ERROR_CODES.INTERNAL);
  });

  it('contractVersion and openapi are available', () => {
    const { service: api } = service();
    expect(api.contractVersion()).toBe('1.0.0');
    expect(api.openapi().openapi).toBe('3.1.0');
  });
});
