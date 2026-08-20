import { describe, expect, it } from 'vitest';

import {
  ServiceOfferingDuplicateError,
  ServiceOfferingNotFoundError,
  ServiceOfferingVersionConflictError,
} from './errors.js';
import { createServiceOffering } from './domain.js';
import { InMemoryServiceOfferingRepository } from './repository.js';

const NOW_MS = 1_700_000_000_000;
const deps = {
  clock: () => NOW_MS,
  offeringIdFactory: () => 'offering-0001',
};

const makeOffering = (id = 'offering-0001') =>
  createServiceOffering(
    {
      ownerRef: 'owner-1',
      agentId: 'agent-0001',
      name: 'Limit order execution',
      estimatedExecutionTime: { averageMs: 500, maxMs: 2000 },
      ...(id === 'offering-0001' ? {} : { id }),
    },
    { ...deps, offeringIdFactory: () => id },
  );

describe('InMemoryServiceOfferingRepository', () => {
  it('creates and reads by id', async () => {
    const repo = new InMemoryServiceOfferingRepository();
    const offering = makeOffering();
    await repo.create(offering);
    expect(await repo.getById('offering-0001')).toEqual(offering);
    expect(await repo.getById('missing')).toBeNull();
  });

  it('rejects duplicate ids', async () => {
    const repo = new InMemoryServiceOfferingRepository();
    await repo.create(makeOffering());
    await expect(repo.create(makeOffering())).rejects.toThrow(ServiceOfferingDuplicateError);
  });

  it('lists by owner and by agent (oldest first)', async () => {
    const repo = new InMemoryServiceOfferingRepository();
    const a = makeOffering('offering-a');
    const b = createServiceOffering(
      {
        ownerRef: 'owner-2',
        agentId: 'agent-0002',
        name: 'Data analysis',
        estimatedExecutionTime: { averageMs: 100, maxMs: 500 },
      },
      { ...deps, offeringIdFactory: () => 'offering-b' },
    );
    await repo.create(b);
    await repo.create(a);
    expect((await repo.listByOwner('owner-1')).map((item) => item.id)).toEqual(['offering-a']);
    expect((await repo.listByAgent('agent-0002')).map((item) => item.id)).toEqual(['offering-b']);
    expect((await repo.listAll()).length).toBe(2);
  });

  it('saves with optimistic concurrency', async () => {
    const repo = new InMemoryServiceOfferingRepository();
    const offering = makeOffering();
    await repo.create(offering);
    await repo.save({ ...offering, version: 2 }, 1);
    await expect(repo.save({ ...offering, version: 3 }, 1)).rejects.toThrow(
      ServiceOfferingVersionConflictError,
    );
  });

  it('throws NOT_FOUND when saving an unknown offering', async () => {
    const repo = new InMemoryServiceOfferingRepository();
    await expect(repo.save(makeOffering(), 1)).rejects.toThrow(ServiceOfferingNotFoundError);
  });
});
