import { describe, expect, it } from 'vitest';

import {
  createRegisteredAgent,
  InMemoryAgentRegistryRepository,
  type AgentRegistryRepository,
} from '@taskmarket/agent-registry';

import { MARKETPLACE_CATALOG_ERROR_CODES } from '../errors.js';
import { createServiceOfferingService } from './service.js';
import type { ServiceOfferingService } from './service.js';
import { SERVICE_OFFERING_API_VERSION } from './version.js';
import { InMemoryServiceOfferingRepository } from './repository.js';

const FIXED_NOW = 1_700_000_000_000;
const deps = {
  clock: () => FIXED_NOW,
  offeringIdFactory: () => 'offering-0001',
};

const AGENT_INPUT = {
  ownerRef: 'owner-1',
  name: 'Trade Bot',
  description: 'Places limit orders.',
  capabilities: ['agent:meta', 'trades:create', 'wallet:read'],
};

const OFFERING_INPUT = {
  ownerRef: 'owner-1',
  agentId: 'agent-0001',
  name: 'Limit order execution',
  description: 'Executes limit orders on GOAT.',
  capabilities: ['trades:create'],
  inputs: [{ name: 'symbol', type: 'string', required: true }],
  outputs: [{ name: 'orderId', type: 'string' }],
  pricing: [{ name: 'per order', currency: 'BTC', amount: '0.001' }],
  estimatedExecutionTime: { averageMs: 500, maxMs: 2000 },
};

function envelope(action: string, principal: string, payload: unknown, requestId = 'req_0001') {
  return {
    contractVersion: SERVICE_OFFERING_API_VERSION,
    requestId,
    action,
    principal,
    payload,
  };
}

interface Ctx {
  service: ServiceOfferingService;
  offerings: InMemoryServiceOfferingRepository;
  agents: AgentRegistryRepository;
}

async function setup(): Promise<Ctx> {
  const agents = new InMemoryAgentRegistryRepository();
  const agent = createRegisteredAgent(AGENT_INPUT, {
    clock: () => FIXED_NOW,
    agentIdFactory: () => 'agent-0001',
    endpointIdFactory: () => 'endpoint-0001',
  });
  await agents.create(agent);
  const offerings = new InMemoryServiceOfferingRepository();
  const service = createServiceOfferingService(offerings, agents, { deps });
  return { service, offerings, agents };
}

describe('parseRequest', () => {
  it('accepts a well-formed request for each action', async () => {
    const { service } = await setup();
    const valid: { action: string; payload: unknown }[] = [
      { action: 'create', payload: { input: OFFERING_INPUT } },
      { action: 'update', payload: { offeringId: 'o', version: 1, update: { name: 'New' } } },
      { action: 'get', payload: { offeringId: 'o' } },
      { action: 'list', payload: {} },
      { action: 'archive', payload: { offeringId: 'o', version: 1 } },
      { action: 'activate', payload: { offeringId: 'o', version: 1 } },
    ];
    for (const item of valid) {
      const result = service.parseRequest(envelope(item.action, 'owner-1', item.payload));
      expect(result.ok, item.action).toBe(true);
    }
  });

  it('rejects a malformed envelope and unsupported versions', async () => {
    const { service } = await setup();
    const malformed = service.parseRequest({ action: 'create', payload: {} });
    expect(malformed.ok).toBe(false);
    const unsupported = service.parseRequest({
      ...envelope('create', 'owner-1', { input: OFFERING_INPUT }),
      contractVersion: '9.9.9',
    });
    expect(unsupported.ok).toBe(false);
  });
});

describe('create', () => {
  it('creates an offering for an owned agent', async () => {
    const { service, offerings } = await setup();
    const response = await service.handle(envelope('create', 'owner-1', { input: OFFERING_INPUT }));
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.offering).toMatchObject({
        id: 'offering-0001',
        ownerRef: 'owner-1',
        agentId: 'agent-0001',
        name: 'Limit order execution',
        status: 'active',
        version: 1,
      });
    }
    expect((await offerings.listByOwner('owner-1')).length).toBe(1);
  });

  it('rejects creation by a principal that does not own the agent', async () => {
    const { service } = await setup();
    const response = await service.handle(
      envelope('create', 'intruder', { input: { ...OFFERING_INPUT, ownerRef: 'intruder' } }),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(MARKETPLACE_CATALOG_ERROR_CODES.UNAUTHORIZED);
    }
  });

  it('rejects creation for an unknown agent', async () => {
    const { service } = await setup();
    const response = await service.handle(
      envelope('create', 'owner-1', { input: { ...OFFERING_INPUT, agentId: 'ghost' } }),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(MARKETPLACE_CATALOG_ERROR_CODES.AGENT_UNKNOWN);
    }
  });

  it('rejects capabilities the agent does not declare', async () => {
    const { service } = await setup();
    const response = await service.handle(
      envelope('create', 'owner-1', {
        input: { ...OFFERING_INPUT, capabilities: ['storage:write'] },
      }),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(MARKETPLACE_CATALOG_ERROR_CODES.INPUT_INVALID);
      expect(response.error.issues?.[0]).toContain('storage:write');
    }
  });

  it('is idempotent for an identical replay under the same principal', async () => {
    const { service } = await setup();
    const first = await service.handle(envelope('create', 'owner-1', { input: OFFERING_INPUT }));
    const second = await service.handle(
      envelope('create', 'owner-1', { input: OFFERING_INPUT }, 'req_0002'),
    );
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.offering).toEqual(first.offering);
    }
  });

  it('reports a duplicate when replay content differs', async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: OFFERING_INPUT }));
    const response = await service.handle(
      envelope(
        'create',
        'owner-1',
        { input: { ...OFFERING_INPUT, name: 'Different' } },
        'req_0002',
      ),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(MARKETPLACE_CATALOG_ERROR_CODES.DUPLICATE);
    }
  });
});

describe('update / get / list', () => {
  it('updates mutable fields with optimistic concurrency', async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: OFFERING_INPUT }));
    const response = await service.handle(
      envelope('update', 'owner-1', {
        offeringId: 'offering-0001',
        version: 1,
        update: { name: 'Renamed', inputs: [{ name: 'amount', type: 'number', required: true }] },
      }),
    );
    expect(response.ok).toBe(true);
    if (response.ok && response.offering !== undefined) {
      expect(response.offering.name).toBe('Renamed');
      expect(response.offering.inputs[0]?.name).toBe('amount');
      expect(response.offering.version).toBe(2);
    }
  });

  it('rejects a stale version with a conflict', async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: OFFERING_INPUT }));
    await service.handle(
      envelope('update', 'owner-1', {
        offeringId: 'offering-0001',
        version: 1,
        update: { name: 'First' },
      }),
    );
    const response = await service.handle(
      envelope('update', 'owner-1', {
        offeringId: 'offering-0001',
        version: 1,
        update: { name: 'Stale' },
      }),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(MARKETPLACE_CATALOG_ERROR_CODES.VERSION_CONFLICT);
    }
  });

  it('rejects updates by a non-owner', async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: OFFERING_INPUT }));
    const response = await service.handle(
      envelope('update', 'intruder', {
        offeringId: 'offering-0001',
        version: 1,
        update: { name: 'Stolen' },
      }),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(MARKETPLACE_CATALOG_ERROR_CODES.UNAUTHORIZED);
    }
  });

  it('returns NOT_FOUND for an unknown offering', async () => {
    const { service } = await setup();
    const response = await service.handle(envelope('get', 'owner-1', { offeringId: 'missing' }));
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(MARKETPLACE_CATALOG_ERROR_CODES.NOT_FOUND);
    }
  });

  it("lists only the principal's own offerings", async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: OFFERING_INPUT }));
    const response = await service.handle(envelope('list', 'owner-1', {}));
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.offerings).toHaveLength(1);
    }
    const empty = await service.handle(envelope('list', 'nobody', {}));
    expect(empty.ok).toBe(true);
    if (empty.ok) {
      expect(empty.offerings).toEqual([]);
    }
  });

  it('rejects updating capabilities the agent does not declare', async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: OFFERING_INPUT }));
    const response = await service.handle(
      envelope('update', 'owner-1', {
        offeringId: 'offering-0001',
        version: 1,
        update: { capabilities: ['wallet:read', 'storage:write'] },
      }),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(MARKETPLACE_CATALOG_ERROR_CODES.INPUT_INVALID);
    }
  });
});

describe('archive / activate', () => {
  it('archives an active offering and reactivates it', async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: OFFERING_INPUT }));
    const archived = await service.handle(
      envelope('archive', 'owner-1', { offeringId: 'offering-0001', version: 1 }),
    );
    expect(archived.ok).toBe(true);
    if (archived.ok && archived.offering !== undefined) {
      expect(archived.offering.status).toBe('archived');
      expect(archived.offering.version).toBe(2);
    }
    const activated = await service.handle(
      envelope('activate', 'owner-1', { offeringId: 'offering-0001', version: 2 }),
    );
    expect(activated.ok).toBe(true);
    if (activated.ok && activated.offering !== undefined) {
      expect(activated.offering.status).toBe('active');
      expect(activated.offering.version).toBe(3);
    }
  });

  it('is idempotent when archiving an already-archived offering', async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: OFFERING_INPUT }));
    await service.handle(
      envelope('archive', 'owner-1', { offeringId: 'offering-0001', version: 1 }),
    );
    const second = await service.handle(
      envelope('archive', 'owner-1', { offeringId: 'offering-0001', version: 2 }, 'req_0002'),
    );
    expect(second.ok).toBe(true);
    if (second.ok && second.offering !== undefined) {
      expect(second.offering.status).toBe('archived');
    }
  });

  it('denies lifecycle operations to a non-owner', async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: OFFERING_INPUT }));
    const response = await service.handle(
      envelope('archive', 'intruder', { offeringId: 'offering-0001', version: 1 }),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(MARKETPLACE_CATALOG_ERROR_CODES.UNAUTHORIZED);
    }
  });
});

describe('handle robustness', () => {
  it('never throws on malformed input and echoes a safe requestId', async () => {
    const { service } = await setup();
    const response = await service.handle({ requestId: 'req_bad!', action: 'create' });
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe(MARKETPLACE_CATALOG_ERROR_CODES.REQUEST_INVALID);
    expect(response.requestId).toBe('tso_unknown');
  });

  it('exposes contractVersion and openapi', async () => {
    const { service } = await setup();
    expect(service.contractVersion()).toBe('1.0.0');
    expect(service.openapi().openapi).toBe('3.1.0');
    const paths = service.openapi().paths;
    expect(Object.keys(paths).sort()).toEqual([
      '/offerings/activate',
      '/offerings/archive',
      '/offerings/create',
      '/offerings/get',
      '/offerings/list',
      '/offerings/update',
    ]);
  });
});
