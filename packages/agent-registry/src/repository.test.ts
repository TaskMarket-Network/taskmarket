import { describe, expect, it } from 'vitest';

import { applyAgentUpdate, createRegisteredAgent } from './domain.js';
import {
  AgentRegistryDuplicateError,
  AgentRegistryNotFoundError,
  AgentRegistryVersionConflictError,
} from './errors.js';
import { InMemoryAgentRegistryRepository } from './repository.js';

const FIXED_NOW = 1_700_000_000_000;
const deps = {
  clock: () => FIXED_NOW,
  agentIdFactory: () => 'agent-0001',
  endpointIdFactory: () => 'endpoint-0001',
};

const BASE_INPUT = {
  ownerRef: 'account-42',
  name: 'Reference Agent',
  capabilities: ['agent:meta'],
};

describe('InMemoryAgentRegistryRepository', () => {
  it('creates and loads an agent', async () => {
    const repo = new InMemoryAgentRegistryRepository();
    const agent = createRegisteredAgent(BASE_INPUT, deps);
    await repo.create(agent);
    expect(await repo.getById(agent.id)).toEqual(agent);
    expect(await repo.getById('missing')).toBeNull();
  });

  it('rejects duplicate ids', async () => {
    const repo = new InMemoryAgentRegistryRepository();
    const agent = createRegisteredAgent(BASE_INPUT, deps);
    await repo.create(agent);
    await expect(repo.create(agent)).rejects.toThrow(AgentRegistryDuplicateError);
  });

  it('lists agents by owner oldest first', async () => {
    const repo = new InMemoryAgentRegistryRepository();
    const a = createRegisteredAgent(
      { ...BASE_INPUT, id: 'a', name: 'A' },
      { ...deps, clock: () => FIXED_NOW },
    );
    const b = createRegisteredAgent(
      { ...BASE_INPUT, id: 'b', name: 'B' },
      { ...deps, clock: () => FIXED_NOW + 1000 },
    );
    await repo.create(b);
    await repo.create(a);
    const owned = await repo.listByOwner('account-42');
    expect(owned.map((agent) => agent.id)).toEqual(['a', 'b']);
    expect(await repo.listByOwner('other-owner')).toEqual([]);
  });

  it('saves an updated agent only when the previous version matches', async () => {
    const repo = new InMemoryAgentRegistryRepository();
    const agent = createRegisteredAgent(BASE_INPUT, deps);
    await repo.create(agent);

    const updated = applyAgentUpdate(agent, { name: 'Renamed' }, deps);
    await repo.save(updated, 1);
    expect((await repo.getById(agent.id))?.name).toBe('Renamed');

    const stale = applyAgentUpdate(updated, { name: 'Stale' }, deps);
    await expect(repo.save(stale, 1)).rejects.toThrow(AgentRegistryVersionConflictError);
    await expect(repo.save(stale, 2)).resolves.toBe(stale);
  });

  it('reports not found when saving an unknown id', async () => {
    const repo = new InMemoryAgentRegistryRepository();
    const agent = createRegisteredAgent({ ...BASE_INPUT, id: 'ghost' }, deps);
    await expect(repo.save(agent, 1)).rejects.toThrow(AgentRegistryNotFoundError);
  });
});
