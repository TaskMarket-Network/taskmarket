import { describe, expect, it } from 'vitest';

import { createMarketplaceListing, type CatalogDeps } from '../domain.js';
import { searchMarketplaceListings } from './search.js';
import type { MarketplaceSearchQuery, MarketplaceSearchResult } from './types.js';

const NOW = '2023-11-14T22:13:20.000Z';
const NOW_MS = Date.parse(NOW);

const deps: CatalogDeps = {
  clock: () => NOW_MS,
  listingIdFactory: () => 'listing-0001',
};

const makeListing = (
  overrides: Partial<Parameters<typeof createMarketplaceListing>[0]> & { id?: string },
) =>
  createMarketplaceListing(
    {
      ownerRef: 'owner-1',
      agentId: 'agent-0001',
      title: 'Limit order execution',
      description: 'Executes limit orders on GOAT.',
      capabilities: ['agent:meta', 'trades:create'],
      pricing: [{ name: 'per order', currency: 'BTC', amount: '0.001' }],
      availability: { status: 'available' },
      trust: { selfReported: true, rating: '5.0' },
      status: 'published',
      ...overrides,
    },
    deps,
  );

const agentNames = new Map<string, string>([
  ['agent-0001', 'Trade Bot'],
  ['agent-0002', 'Storage Keeper'],
  ['agent-0003', 'Analyst'],
]);

const query = (overrides: Partial<MarketplaceSearchQuery> = {}): MarketplaceSearchQuery => ({
  sortBy: 'relevance',
  sortDirection: 'desc',
  limit: 20,
  offset: 0,
  ...overrides,
});

const ids = (result: MarketplaceSearchResult): string[] =>
  result.items.map((item) => item.id);

describe('searchMarketplaceListings', () => {
  it('only returns published listings', () => {
    const listings = [
      makeListing({ id: 'listing-published' }),
      makeListing({ id: 'listing-draft', status: 'draft' }),
      makeListing({ id: 'listing-paused', status: 'paused' }),
      makeListing({ id: 'listing-delisted', status: 'delisted' }),
    ];
    const result = searchMarketplaceListings(listings, agentNames, query(), NOW);
    expect(ids(result)).toEqual(['listing-published']);
    expect(result.total).toBe(1);
  });

  it('browses all published listings when the query is empty', () => {
    const listings = [
      makeListing({ id: 'a' }),
      makeListing({ id: 'b', agentId: 'agent-0002', capabilities: ['storage:write'] }),
    ];
    const result = searchMarketplaceListings(listings, agentNames, query(), NOW);
    expect(result.total).toBe(2);
  });

  it('filters by capabilities with AND semantics', () => {
    const listings = [
      makeListing({ id: 'a', capabilities: ['trades:create', 'agent:meta'] }),
      makeListing({ id: 'b', agentId: 'agent-0002', capabilities: ['storage:write'] }),
    ];
    const result = searchMarketplaceListings(
      listings,
      agentNames,
      query({ capabilities: ['trades:create', 'agent:meta'] }),
      NOW,
    );
    expect(ids(result)).toEqual(['a']);
  });

  it('filters by namespaces with any-match semantics', () => {
    const listings = [
      makeListing({ id: 'a', capabilities: ['trades:create'] }),
      makeListing({ id: 'b', agentId: 'agent-0002', capabilities: ['storage:write'] }),
    ];
    const result = searchMarketplaceListings(
      listings,
      agentNames,
      query({ namespaces: ['storage'] }),
      NOW,
    );
    expect(ids(result)).toEqual(['b']);
  });

  it('filters by agent, availability, and pricing currency', () => {
    const listings = [
      makeListing({ id: 'a', agentId: 'agent-0001' }),
      makeListing({
        id: 'b',
        agentId: 'agent-0002',
        capabilities: ['storage:write'],
        availability: { status: 'limited' },
        pricing: [{ name: 'per gb', currency: 'USD', amount: '1.00' }],
      }),
    ];
    expect(ids(searchMarketplaceListings(listings, agentNames, query({ agentId: 'agent-0002' }), NOW))).toEqual(['b']);
    expect(
      ids(searchMarketplaceListings(listings, agentNames, query({ availability: 'limited' }), NOW)),
    ).toEqual(['b']);
    expect(
      ids(
        searchMarketplaceListings(
          listings,
          agentNames,
          query({ pricingCurrency: 'USD' }),
          NOW,
        ),
      ),
    ).toEqual(['b']);
  });

  it('searches text over title, description, capabilities, and agent name', () => {
    const listings = [
      makeListing({ id: 'a', title: 'Limit order execution' }),
      makeListing({ id: 'b', agentId: 'agent-0003', title: 'Data analysis', capabilities: ['analytics:run'] }),
    ];
    expect(ids(searchMarketplaceListings(listings, agentNames, query({ query: 'trade' }), NOW))).toEqual(['a']);
    expect(ids(searchMarketplaceListings(listings, agentNames, query({ query: 'analyst' }), NOW))).toEqual(['b']);
    expect(
      ids(searchMarketplaceListings(listings, agentNames, query({ query: 'zebra' }), NOW)),
    ).toEqual([]);
  });

  it('sorts deterministically with an id tiebreak', () => {
    const listings = [
      makeListing({ id: 'b' }),
      makeListing({ id: 'a' }),
      makeListing({ id: 'c' }),
    ];
    const result = searchMarketplaceListings(listings, agentNames, query({ sortBy: 'name' }), NOW);
    expect(ids(result)).toEqual(['a', 'b', 'c']);
    const reversed = searchMarketplaceListings(
      listings,
      agentNames,
      query({ sortBy: 'name', sortDirection: 'desc' }),
      NOW,
    );
    // Descending name: same titles tiebreak to ascending id, so order flips.
    expect(ids(reversed)).toEqual(['c', 'b', 'a']);
  });

  it('paginates with accurate totals', () => {
    const listings = [1, 2, 3, 4, 5].map((index) =>
      makeListing({ id: `listing-${index}` }),
    );
    const page = searchMarketplaceListings(
      listings,
      agentNames,
      query({ limit: 2, offset: 2 }),
      NOW,
    );
    expect(page.total).toBe(5);
    expect(page.limit).toBe(2);
    expect(page.offset).toBe(2);
    expect(page.items).toHaveLength(2);
    expect(page.items.every((item) => item.status === 'published')).toBe(true);
  });

  it('ranks relevance higher than less-relevant listings', () => {
    const fullMatch = makeListing({ id: 'full', capabilities: ['trades:create', 'agent:meta'] });
    const partialMatch = makeListing({
      id: 'partial',
      agentId: 'agent-0002',
      capabilities: ['trades:create'],
    });
    const result = searchMarketplaceListings(
      [partialMatch, fullMatch],
      agentNames,
      query({ capabilities: ['trades:create', 'agent:meta'] }),
      NOW,
    );
    expect(ids(result)).toEqual(['full', 'partial']);
    const top = result.items[0];
    expect(top).toBeDefined();
    if (top !== undefined) {
      expect(top.ranking.explanation).toContain('capabilityRelevance');
    }
  });
});