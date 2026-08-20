import { describe, expect, it } from 'vitest';

import {
  applyListingUpdate,
  assertListingStatusTransition,
  createMarketplaceListing,
  LISTING_STATUS_TRANSITIONS,
} from './domain.js';
import { MarketplaceCatalogStatusTransitionError } from './errors.js';
import type { MarketplaceListing } from './types.js';

const FIXED_NOW = 1_700_000_000_000;
const TIMESTAMP = '2023-11-14T22:13:20.000Z';
const deps = { clock: () => FIXED_NOW, listingIdFactory: () => 'listing-0001' };

const INPUT = {
  ownerRef: 'owner-1',
  agentId: 'agent-0001',
  title: 'Limit order execution',
  description: 'Executes limit orders.',
  capabilities: ['trades:create', 'agent:meta'],
  pricing: [{ name: 'per task', currency: 'USDC', amount: '0.01' }],
  availability: { status: 'limited' as const, note: 'High demand' },
  trust: { selfReported: true as const, rating: '4.2', completedTasks: 12 },
};

describe('LISTING_STATUS_TRANSITIONS', () => {
  it('defines the documented lifecycle', () => {
    expect(LISTING_STATUS_TRANSITIONS).toEqual({
      draft: ['published', 'delisted'],
      published: ['paused', 'delisted'],
      paused: ['published', 'delisted'],
      delisted: [],
    });
  });

  it('allows no-op transitions and rejects illegal ones', () => {
    expect(() => assertListingStatusTransition('published', 'published')).not.toThrow();
    expect(() => assertListingStatusTransition('published', 'draft')).toThrow(
      MarketplaceCatalogStatusTransitionError,
    );
    expect(() => assertListingStatusTransition('delisted', 'published')).toThrow(
      MarketplaceCatalogStatusTransitionError,
    );
  });
});

describe('createMarketplaceListing', () => {
  it('creates a version-1 listing with domain-owned id and timestamps', () => {
    const listing = createMarketplaceListing(INPUT, deps);
    expect(listing).toMatchObject({
      id: 'listing-0001',
      ownerRef: 'owner-1',
      agentId: 'agent-0001',
      title: 'Limit order execution',
      status: 'draft',
      version: 1,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    });
    expect(listing.capabilities).toEqual(['trades:create', 'agent:meta']);
    expect(listing.pricing).toEqual([{ name: 'per task', currency: 'USDC', amount: '0.01' }]);
    expect(listing.availability).toEqual({ status: 'limited', note: 'High demand' });
    expect(listing.trust).toEqual({ selfReported: true, rating: '4.2', completedTasks: 12 });
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(INPUT);
    createMarketplaceListing(INPUT, deps);
    expect(JSON.stringify(INPUT)).toBe(before);
  });

  it('throws structured input errors for invalid input', () => {
    expect(() => createMarketplaceListing({ ...INPUT, title: '' }, deps)).toThrow(
      /Invalid marketplace catalog input/,
    );
  });
});

describe('applyListingUpdate', () => {
  function listing(overrides: Partial<MarketplaceListing> = {}): MarketplaceListing {
    return { ...createMarketplaceListing(INPUT, deps), ...overrides };
  }

  it('updates mutable fields and bumps the version', () => {
    const updated = applyListingUpdate(
      listing(),
      { title: 'Renamed', availability: { status: 'available' } },
      deps,
    );
    expect(updated.title).toBe('Renamed');
    expect(updated.availability).toEqual({ status: 'available' });
    expect(updated.version).toBe(2);
    expect(updated.createdAt).toBe(TIMESTAMP);
  });

  it('validates status transitions', () => {
    expect(() =>
      applyListingUpdate(listing({ status: 'published' }), { status: 'draft' }, deps),
    ).toThrow(MarketplaceCatalogStatusTransitionError);
  });

  it('does not mutate the input listing', () => {
    const original = listing();
    applyListingUpdate(original, { title: 'Renamed' }, deps);
    expect(original.title).toBe('Limit order execution');
  });
});
