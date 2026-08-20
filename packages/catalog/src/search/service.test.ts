import { describe, expect, it } from 'vitest';

import { createRegisteredAgent, InMemoryAgentRegistryRepository } from '@taskmarket/agent-registry';

import { createMarketplaceListing, type CatalogDeps } from '../domain.js';
import { InMemoryCatalogRepository } from '../repository.js';
import { createMarketplaceCatalogSearchService } from './service.js';

const NOW = '2023-11-14T22:13:20.000Z';
const NOW_MS = Date.parse(NOW);

let listingCounter = 0;
const deps: CatalogDeps = {
  clock: () => NOW_MS,
  listingIdFactory: () => `listing-${++listingCounter}`,
};

const FIXED_NOW = () => NOW;

async function buildRepos() {
  const agentRepo = new InMemoryAgentRegistryRepository();
  const tradeBot = createRegisteredAgent({
    ownerRef: 'owner-1',
    name: 'Trade Bot',
    capabilities: ['agent:meta', 'trades:create'],
    endpoints: [{ type: 'mcp', url: 'https://trade.example.com/mcp' }],
  });
  const analyst = createRegisteredAgent({
    ownerRef: 'owner-2',
    name: 'Analyst',
    capabilities: ['agent:meta', 'analytics:run'],
    endpoints: [{ type: 'mcp', url: 'https://analyst.example.com/mcp' }],
  });
  await agentRepo.create(tradeBot);
  await agentRepo.create(analyst);

  const catalog = new InMemoryCatalogRepository();
  await catalog.create(
    createMarketplaceListing(
      {
        ownerRef: 'owner-1',
        agentId: tradeBot.id,
        title: 'Limit order execution',
        capabilities: ['trades:create'],
        pricing: [{ name: 'per order', currency: 'BTC', amount: '0.001' }],
        availability: { status: 'available' },
        trust: { selfReported: true, rating: '1.0' },
        status: 'published',
      },
      deps,
    ),
  );
  await catalog.create(
    createMarketplaceListing(
      {
        ownerRef: 'owner-2',
        agentId: analyst.id,
        title: 'Data analysis',
        capabilities: ['analytics:run'],
        pricing: [{ name: 'per report', currency: 'USD', amount: '5.00' }],
        availability: { status: 'available' },
        trust: { selfReported: true, rating: '5.0' },
        status: 'published',
      },
      deps,
    ),
  );
  return { agentRepo, catalog };
}

describe('createMarketplaceCatalogSearchService', () => {
  it('returns an explainable, ranked result for a valid query', async () => {
    const { agentRepo, catalog } = await buildRepos();
    const service = createMarketplaceCatalogSearchService(catalog, agentRepo, { now: FIXED_NOW });
    const response = await service.search({
      query: 'trade',
      sortBy: 'relevance',
      sortDirection: 'desc',
      limit: 10,
      offset: 0,
    });
    expect(response.ok).toBe(true);
    if (response.ok) {
      const top = response.result.items[0];
      expect(top).toBeDefined();
      if (top !== undefined) {
        expect(top.title).toBe('Limit order execution');
        expect(top.agentName).toBe('Trade Bot');
        expect(top.ranking.explanation.length).toBeGreaterThan(0);
      }
    }
  });

  it('does not let a perfect self-reported rating dominate objective relevance', async () => {
    const { agentRepo, catalog } = await buildRepos();
    const service = createMarketplaceCatalogSearchService(catalog, agentRepo, { now: FIXED_NOW });
    // Search for analytics: the analyst listing has rating 5.0 (self-reported)
    // and the trade listing rating 1.0, but capability relevance must still win
    // because self-reported signals are down-weighted.
    const response = await service.search({
      capabilities: ['analytics:run'],
      sortBy: 'relevance',
    });
    expect(response.ok).toBe(true);
    if (response.ok) {
      const top = response.result.items[0];
      expect(top).toBeDefined();
      if (top !== undefined) {
        expect(top.agentName).toBe('Analyst');
        const ratingSignal = top.ranking.signals.find(
          (signal) => signal.name === 'selfReportedRating',
        );
        expect(ratingSignal?.weight).toBeLessThan(1);
        expect(ratingSignal?.note).toContain('self-reported');
      }
    }
  });

  it('browses all published listings with an empty query', async () => {
    const { agentRepo, catalog } = await buildRepos();
    const service = createMarketplaceCatalogSearchService(catalog, agentRepo, { now: FIXED_NOW });
    const response = await service.search({});
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.result.total).toBe(2);
    }
  });

  it('returns a structured error for a malformed query (never throws)', async () => {
    const { agentRepo, catalog } = await buildRepos();
    const service = createMarketplaceCatalogSearchService(catalog, agentRepo, { now: FIXED_NOW });
    const response = await service.search({ limit: 0 });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe('CATALOG_REQUEST_INVALID');
      expect(response.error.issues).toBeDefined();
    }
  });

  it('returns a structured error when the repository fails', async () => {
    const failing = {
      listAll: async (): Promise<never> => {
        throw new Error('connection refused');
      },
    } as unknown as InMemoryCatalogRepository;
    const { agentRepo } = await buildRepos();
    const service = createMarketplaceCatalogSearchService(failing, agentRepo, { now: FIXED_NOW });
    const response = await service.search({});
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe('CATALOG_INTERNAL');
      expect(response.error.message).not.toContain('connection refused');
    }
  });

  it('parses queries at the trust boundary', async () => {
    const { agentRepo, catalog } = await buildRepos();
    const service = createMarketplaceCatalogSearchService(catalog, agentRepo, { now: FIXED_NOW });
    expect(service.parseQuery({ limit: 5 }).ok).toBe(true);
    expect(service.parseQuery({ limit: 0 }).ok).toBe(false);
  });

  it('reports the contract version and generated OpenAPI', async () => {
    const { agentRepo, catalog } = await buildRepos();
    const service = createMarketplaceCatalogSearchService(catalog, agentRepo, { now: FIXED_NOW });
    expect(service.contractVersion()).toBe('1.0.0');
    const openapi = service.openapi();
    expect(openapi.openapi).toBe('3.1.0');
    expect(openapi.paths['/listings/search']).toBeDefined();
  });
});