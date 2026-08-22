import { Pool } from 'pg';

import {
  createMarketplaceCatalogSearchService,
  createMarketplaceCatalogService,
  createServiceOfferingService,
  PostgresCatalogRepository,
  PostgresServiceOfferingRepository,
  type MarketplaceCatalogSearchService,
  type MarketplaceCatalogService,
  type ServiceOfferingService,
} from '@taskmarket/catalog';
import { PostgresAgentRegistryRepository } from '@taskmarket/agent-registry';
import { getDatabaseUrl } from '../env.js';

export interface CatalogServices {
  readonly pool: Pool;
  readonly listings: PostgresCatalogRepository;
  readonly offerings: PostgresServiceOfferingRepository;
  readonly agents: PostgresAgentRegistryRepository;
  readonly catalog: MarketplaceCatalogService;
  readonly search: MarketplaceCatalogSearchService;
  readonly offeringService: ServiceOfferingService;
}

let cached: CatalogServices | null = null;

/**
 * The marketplace HTTP adapter: the transport-agnostic marketplace catalog,
 * search, and service offerings services over the Postgres catalog, joined to
 * the agent registry for agent ownership and capability checks. Created once
 * per process and reused by server components and route handlers.
 */
export function getCatalogServices(): CatalogServices {
  if (cached !== null) {
    return cached;
  }
  const pool = new Pool({ connectionString: getDatabaseUrl(), max: 10 });
  const agents = new PostgresAgentRegistryRepository(pool);
  const listings = new PostgresCatalogRepository(pool);
  const offerings = new PostgresServiceOfferingRepository(pool);
  const catalog = createMarketplaceCatalogService(listings, agents, {
    serviceName: 'Marketplace Catalog Dashboard',
    serviceDescription:
      'HTTP adapter for the marketplace catalog API used by the TaskMarket development dashboard.',
  });
  const search = createMarketplaceCatalogSearchService(listings, agents, {
    serviceName: 'Marketplace Catalog Dashboard — Search',
  });
  const offeringService = createServiceOfferingService(offerings, agents, {
    serviceName: 'Marketplace Catalog Dashboard — Service Offerings',
  });
  cached = { pool, listings, offerings, agents, catalog, search, offeringService };
  return cached;
}

/** Close the shared pool (used by tests and long-lived processes). */
export async function closeCatalogServices(): Promise<void> {
  if (cached === null) {
    return;
  }
  await cached.pool.end().catch(() => {});
  cached = null;
}
