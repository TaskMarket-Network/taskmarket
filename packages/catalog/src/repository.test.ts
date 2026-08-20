import { describe, expect, it } from 'vitest';

import { createMarketplaceListing } from './domain.js';
import {
  MarketplaceCatalogDuplicateError,
  MarketplaceCatalogNotFoundError,
  MarketplaceCatalogVersionConflictError,
} from './errors.js';
import { InMemoryCatalogRepository } from './repository.js';

const deps = { clock: () => 1_700_000_000_000, listingIdFactory: () => 'listing-0001' };

const INPUT = {
  ownerRef: 'owner-1',
  agentId: 'agent-0001',
  title: 'Limit order execution',
  capabilities: ['trades:create'],
};

describe('InMemoryCatalogRepository', () => {
  it('creates and loads a listing', async () => {
    const repo = new InMemoryCatalogRepository();
    const listing = createMarketplaceListing(INPUT, deps);
    await repo.create(listing);
    expect(await repo.getById('listing-0001')).toEqual(listing);
  });

  it('rejects duplicate ids', async () => {
    const repo = new InMemoryCatalogRepository();
    const listing = createMarketplaceListing(INPUT, deps);
    await repo.create(listing);
    await expect(repo.create(listing)).rejects.toThrow(MarketplaceCatalogDuplicateError);
  });

  it('lists by owner and by agent', async () => {
    const repo = new InMemoryCatalogRepository();
    await repo.create(createMarketplaceListing(INPUT, deps));
    await repo.create(
      createMarketplaceListing(
        { ...INPUT, ownerRef: 'owner-2', agentId: 'agent-0002' },
        {
          ...deps,
          listingIdFactory: () => 'listing-0002',
        },
      ),
    );
    expect((await repo.listByOwner('owner-1')).map((entry) => entry.id)).toEqual(['listing-0001']);
    expect((await repo.listByAgent('agent-0002')).map((entry) => entry.id)).toEqual([
      'listing-0002',
    ]);
  });

  it('enforces optimistic concurrency on save', async () => {
    const repo = new InMemoryCatalogRepository();
    const listing = createMarketplaceListing(INPUT, deps);
    await repo.create(listing);
    await expect(repo.save(listing, 2)).rejects.toThrow(MarketplaceCatalogVersionConflictError);
    await expect(repo.save(listing, 1)).resolves.toBe(listing);
  });

  it('reports not found when saving an unknown id', async () => {
    const repo = new InMemoryCatalogRepository();
    const listing = createMarketplaceListing(INPUT, deps);
    await expect(repo.save(listing, 1)).rejects.toThrow(MarketplaceCatalogNotFoundError);
  });
});
