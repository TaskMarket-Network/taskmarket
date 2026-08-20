import { describe, expect, it } from 'vitest';

import {
  createRegisteredAgent,
  InMemoryAgentRegistryRepository,
  type AgentRegistryRepository,
  type RegisteredAgent,
} from '@taskmarket/agent-registry';

import { MARKETPLACE_CATALOG_ERROR_CODES } from '../errors.js';
import { createMarketplaceCatalogService } from './service.js';
import type { MarketplaceCatalogService } from './types.js';
import { MARKETPLACE_CATALOG_API_VERSION } from './version.js';
import { InMemoryCatalogRepository, type CatalogRepository } from '../repository.js';

const FIXED_NOW = 1_700_000_000_000;
const deps = {
  clock: () => FIXED_NOW,
  listingIdFactory: () => 'listing-0001',
};

const AGENT_INPUT = {
  ownerRef: 'owner-1',
  name: 'Trade Bot',
  description: 'Places limit orders.',
  capabilities: ['agent:meta', 'trades:create', 'wallet:read'],
};

const LISTING_INPUT = {
  ownerRef: 'owner-1',
  agentId: 'agent-0001',
  title: 'Limit order execution',
  description: 'Executes limit orders on GOAT.',
  capabilities: ['trades:create', 'agent:meta'],
  pricing: [{ name: 'per task', currency: 'USDC', amount: '0.01' }],
};

function envelope(action: string, principal: string, payload: unknown, requestId = 'req_0001') {
  return {
    contractVersion: MARKETPLACE_CATALOG_API_VERSION,
    requestId,
    action,
    principal,
    payload,
  };
}

interface Ctx {
  service: MarketplaceCatalogService;
  catalog: CatalogRepository;
  agents: AgentRegistryRepository;
}

async function setup(agentStatus: RegisteredAgent['status'] = 'active'): Promise<Ctx> {
  const agents = new InMemoryAgentRegistryRepository();
  const agent = createRegisteredAgent(
    { ...AGENT_INPUT, status: agentStatus },
    {
      clock: () => FIXED_NOW,
      agentIdFactory: () => 'agent-0001',
      endpointIdFactory: () => 'endpoint-0001',
    },
  );
  await agents.create(agent);
  const catalog = new InMemoryCatalogRepository();
  const service = createMarketplaceCatalogService(catalog, agents, { deps });
  return { service, catalog, agents };
}

describe('parseRequest', () => {
  it('accepts a well-formed request for each action', async () => {
    const { service } = await setup();
    const valid: { action: string; payload: unknown }[] = [
      { action: 'create', payload: { input: LISTING_INPUT } },
      { action: 'update', payload: { listingId: 'l', version: 1, update: { title: 'New' } } },
      { action: 'get', payload: { listingId: 'l' } },
      { action: 'list', payload: {} },
      { action: 'publish', payload: { listingId: 'l', version: 1 } },
      { action: 'pause', payload: { listingId: 'l', version: 1 } },
      { action: 'delist', payload: { listingId: 'l', version: 1 } },
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
      ...envelope('create', 'owner-1', { input: LISTING_INPUT }),
      contractVersion: '9.9.9',
    });
    expect(unsupported.ok).toBe(false);
  });
});

describe('create', () => {
  it('creates a listing for an owned active agent', async () => {
    const { service, catalog } = await setup();
    const response = await service.handle(envelope('create', 'owner-1', { input: LISTING_INPUT }));
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.listing).toMatchObject({
        id: 'listing-0001',
        ownerRef: 'owner-1',
        agentId: 'agent-0001',
        title: 'Limit order execution',
        status: 'draft',
        version: 1,
      });
    }
    expect((await catalog.listByOwner('owner-1')).length).toBe(1);
  });

  it('rejects creation by a principal that does not own the agent', async () => {
    const { service } = await setup();
    const response = await service.handle(
      envelope('create', 'intruder', { input: { ...LISTING_INPUT, ownerRef: 'intruder' } }),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(MARKETPLACE_CATALOG_ERROR_CODES.UNAUTHORIZED);
    }
  });

  it('rejects creation for an unknown agent', async () => {
    const { service } = await setup();
    const response = await service.handle(
      envelope('create', 'owner-1', { input: { ...LISTING_INPUT, agentId: 'ghost' } }),
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
        input: { ...LISTING_INPUT, capabilities: ['storage:write'] },
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
    const first = await service.handle(envelope('create', 'owner-1', { input: LISTING_INPUT }));
    const second = await service.handle(
      envelope('create', 'owner-1', { input: LISTING_INPUT }, 'req_0002'),
    );
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.listing).toEqual(first.listing);
    }
  });

  it('reports a duplicate when replay content differs', async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: LISTING_INPUT }));
    const response = await service.handle(
      envelope(
        'create',
        'owner-1',
        { input: { ...LISTING_INPUT, title: 'Different' } },
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
    await service.handle(envelope('create', 'owner-1', { input: LISTING_INPUT }));
    const response = await service.handle(
      envelope('update', 'owner-1', {
        listingId: 'listing-0001',
        version: 1,
        update: { title: 'Renamed' },
      }),
    );
    expect(response.ok).toBe(true);
    if (response.ok && response.listing !== undefined) {
      expect(response.listing.title).toBe('Renamed');
      expect(response.listing.version).toBe(2);
    }
  });

  it('rejects a stale version with a conflict', async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: LISTING_INPUT }));
    await service.handle(
      envelope('update', 'owner-1', {
        listingId: 'listing-0001',
        version: 1,
        update: { title: 'First' },
      }),
    );
    const response = await service.handle(
      envelope('update', 'owner-1', {
        listingId: 'listing-0001',
        version: 1,
        update: { title: 'Stale' },
      }),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(MARKETPLACE_CATALOG_ERROR_CODES.VERSION_CONFLICT);
    }
  });

  it('rejects updates by a non-owner', async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: LISTING_INPUT }));
    const response = await service.handle(
      envelope('update', 'intruder', {
        listingId: 'listing-0001',
        version: 1,
        update: { title: 'Stolen' },
      }),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(MARKETPLACE_CATALOG_ERROR_CODES.UNAUTHORIZED);
    }
  });

  it('returns NOT_FOUND for an unknown listing', async () => {
    const { service } = await setup();
    const response = await service.handle(envelope('get', 'owner-1', { listingId: 'missing' }));
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(MARKETPLACE_CATALOG_ERROR_CODES.NOT_FOUND);
    }
  });

  it("lists only the principal's own listings", async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: LISTING_INPUT }));
    const response = await service.handle(envelope('list', 'owner-1', {}));
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.listings).toHaveLength(1);
    }
    const empty = await service.handle(envelope('list', 'nobody', {}));
    expect(empty.ok).toBe(true);
    if (empty.ok) {
      expect(empty.listings).toEqual([]);
    }
  });

  it('rejects updating capabilities the agent does not declare', async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: LISTING_INPUT }));
    const response = await service.handle(
      envelope('update', 'owner-1', {
        listingId: 'listing-0001',
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

describe('publish / pause / delist', () => {
  it('publishes a draft listing for an active agent', async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: LISTING_INPUT }));
    const response = await service.handle(
      envelope('publish', 'owner-1', { listingId: 'listing-0001', version: 1 }),
    );
    expect(response.ok).toBe(true);
    if (response.ok && response.listing !== undefined) {
      expect(response.listing.status).toBe('published');
      expect(response.listing.version).toBe(2);
    }
  });

  it('refuses to publish when the agent is not active', async () => {
    const { service } = await setup('draft');
    await service.handle(envelope('create', 'owner-1', { input: LISTING_INPUT }));
    const response = await service.handle(
      envelope('publish', 'owner-1', { listingId: 'listing-0001', version: 1 }),
    );
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe(MARKETPLACE_CATALOG_ERROR_CODES.AGENT_INACTIVE);
    }
  });

  it('is idempotent when publishing an already-published listing', async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: LISTING_INPUT }));
    await service.handle(envelope('publish', 'owner-1', { listingId: 'listing-0001', version: 1 }));
    const second = await service.handle(
      envelope('publish', 'owner-1', { listingId: 'listing-0001', version: 2 }, 'req_0002'),
    );
    expect(second.ok).toBe(true);
    if (second.ok && second.listing !== undefined) {
      expect(second.listing.status).toBe('published');
    }
  });

  it('pauses and republishes through the allowed transitions', async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: LISTING_INPUT }));
    await service.handle(envelope('publish', 'owner-1', { listingId: 'listing-0001', version: 1 }));
    const paused = await service.handle(
      envelope('pause', 'owner-1', { listingId: 'listing-0001', version: 2 }),
    );
    expect(paused.ok).toBe(true);
    if (paused.ok && paused.listing !== undefined) {
      expect(paused.listing.status).toBe('paused');
    }
    const republished = await service.handle(
      envelope('publish', 'owner-1', { listingId: 'listing-0001', version: 3 }),
    );
    expect(republished.ok).toBe(true);
    if (republished.ok && republished.listing !== undefined) {
      expect(republished.listing.status).toBe('published');
    }
  });

  it('delists a published listing (terminal)', async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: LISTING_INPUT }));
    await service.handle(envelope('publish', 'owner-1', { listingId: 'listing-0001', version: 1 }));
    const delisted = await service.handle(
      envelope('delist', 'owner-1', { listingId: 'listing-0001', version: 2 }),
    );
    expect(delisted.ok).toBe(true);
    if (delisted.ok && delisted.listing !== undefined) {
      expect(delisted.listing.status).toBe('delisted');
    }
    const republish = await service.handle(
      envelope('publish', 'owner-1', { listingId: 'listing-0001', version: 3 }),
    );
    expect(republish.ok).toBe(false);
    if (!republish.ok) {
      expect(republish.error.code).toBe(MARKETPLACE_CATALOG_ERROR_CODES.STATUS_TRANSITION);
    }
  });

  it('denies lifecycle operations to a non-owner', async () => {
    const { service } = await setup();
    await service.handle(envelope('create', 'owner-1', { input: LISTING_INPUT }));
    const response = await service.handle(
      envelope('publish', 'intruder', { listingId: 'listing-0001', version: 1 }),
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
    expect(response.requestId).toBe('tmc_unknown');
  });

  it('exposes contractVersion and openapi', async () => {
    const { service } = await setup();
    expect(service.contractVersion()).toBe('1.0.0');
    expect(service.openapi().openapi).toBe('3.1.0');
    const paths = service.openapi().paths;
    expect(Object.keys(paths).sort()).toEqual([
      '/listings/create',
      '/listings/delist',
      '/listings/get',
      '/listings/list',
      '/listings/pause',
      '/listings/publish',
      '/listings/update',
    ]);
  });
});
