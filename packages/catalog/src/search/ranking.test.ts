import { describe, expect, it } from 'vitest';

import { createMarketplaceListing, type CatalogDeps } from '../domain.js';
import type { MarketplaceListing } from '../types.js';
import {
  MARKETPLACE_SEARCH_FRESHNESS_WINDOW_MS,
  MARKETPLACE_SEARCH_WEIGHTS,
  scoreListing,
} from './ranking.js';
import type { MarketplaceSearchQuery } from './types.js';

const NOW = '2023-11-14T22:13:20.000Z';
const NOW_MS = Date.parse(NOW);

const deps: CatalogDeps = {
  clock: () => NOW_MS,
  listingIdFactory: () => 'listing-0001',
};

const baseListing = () =>
  createMarketplaceListing(
    {
      ownerRef: 'owner-1',
      agentId: 'agent-0001',
      title: 'Limit order execution',
      description: 'Executes limit orders on GOAT.',
      capabilities: ['agent:meta', 'trades:create'],
      pricing: [{ name: 'per order', currency: 'BTC', amount: '0.001' }],
      availability: { status: 'available' },
      trust: {
        selfReported: true,
        rating: '5.0',
        completionRate: '100',
      },
    },
    deps,
  );

const emptyQuery = (): MarketplaceSearchQuery => ({
  sortBy: 'relevance',
  sortDirection: 'desc',
  limit: 20,
  offset: 0,
});

describe('scoreListing', () => {
  it('is deterministic for a fixed query and clock', () => {
    const listing = baseListing();
    const query = emptyQuery();
    const first = scoreListing(listing, 'Limit Order Agent', query, NOW);
    const second = scoreListing(listing, 'Limit Order Agent', query, NOW);
    expect(first).toEqual(second);
  });

  it('rewards capability relevance when capability filters are requested', () => {
    const listing = baseListing();
    const query: MarketplaceSearchQuery = {
      ...emptyQuery(),
      capabilities: ['trades:create', 'agent:meta'],
    };
    const ranking = scoreListing(listing, 'Limit Order Agent', query, NOW);
    const signal = ranking.signals.find((s) => s.name === 'capabilityRelevance');
    expect(signal?.value).toBe(1);
    expect(signal?.contribution).toBeCloseTo(MARKETPLACE_SEARCH_WEIGHTS.capabilityRelevance);
    expect(ranking.explanation).toContain('capabilityRelevance');
  });

  it('never includes price in the score', () => {
    const withPricing = scoreListing(baseListing(), 'Agent', emptyQuery(), NOW);
    const listing = baseListing();
    const stripped = { ...listing, pricing: [] };
    const withoutPricing = scoreListing(stripped, 'Agent', emptyQuery(), NOW);
    // Freshness and pricing-completeness differ, but the price AMOUNT never
    // appears as a signal and the explanation always states the exclusion.
    expect(withPricing.explanation).toContain('price excluded from ranking');
    expect(withoutPricing.explanation).toContain('price excluded from ranking');
    expect(withPricing.signals.some((s) => s.name.includes('price'))).toBe(false);
    expect(withPricing.signals.find((s) => s.name === 'pricingCompleteness')?.value).toBe(1);
  });

  it('down-weights self-reported signals and labels them', () => {
    const listing = baseListing();
    const ranking = scoreListing(listing, 'Limit Order Agent', emptyQuery(), NOW);
    const rating = ranking.signals.find((s) => s.name === 'selfReportedRating');
    const completion = ranking.signals.find((s) => s.name === 'selfReportedCompletion');
    expect(rating?.weight).toBe(MARKETPLACE_SEARCH_WEIGHTS.selfReportedRating);
    expect(rating?.note).toContain('self-reported');
    expect(rating?.value).toBe(1); // rating 5.0 / 5
    expect(completion?.value).toBe(1); // 100 / 100
    // Even at perfect self-reported values, their combined contribution is tiny.
    const selfReportedTotal =
      (rating?.contribution ?? 0) + (completion?.contribution ?? 0);
    expect(selfReportedTotal).toBeLessThan(0.41);
    expect(ranking.explanation).toContain('self-reported; down-weighted');
  });

  it('ignores self-reported signals when they are absent', () => {
    const listing = baseListing();
    const noClaims: MarketplaceListing = {
      ...listing,
      trust: { selfReported: true },
    };
    const ranking = scoreListing(noClaims, 'Limit Order Agent', emptyQuery(), NOW);
    expect(ranking.signals.some((s) => s.name === 'selfReportedRating')).toBe(false);
    expect(ranking.signals.some((s) => s.name === 'selfReportedCompletion')).toBe(false);
  });

  it('decays freshness toward zero over the window', () => {
    const listing = baseListing();
    const fresh = scoreListing(listing, 'Agent', emptyQuery(), NOW);
    const staleIso = new Date(NOW_MS - MARKETPLACE_SEARCH_FRESHNESS_WINDOW_MS * 2).toISOString();
    const staleListing = { ...listing, updatedAt: staleIso };
    const stale = scoreListing(staleListing, 'Agent', emptyQuery(), NOW);
    expect(fresh.signals.find((s) => s.name === 'freshness')?.value).toBe(1);
    expect(stale.signals.find((s) => s.name === 'freshness')?.value).toBe(0);
  });

  it('rewards text relevance when a query is present', () => {
    const listing = baseListing();
    const hit = scoreListing(listing, 'Limit Order Agent', { ...emptyQuery(), query: 'limit' }, NOW);
    const miss = scoreListing(listing, 'Limit Order Agent', { ...emptyQuery(), query: 'zebra' }, NOW);
    expect(hit.signals.find((s) => s.name === 'textRelevance')?.value).toBe(1);
    expect(miss.signals.find((s) => s.name === 'textRelevance')?.value).toBe(0);
  });
});