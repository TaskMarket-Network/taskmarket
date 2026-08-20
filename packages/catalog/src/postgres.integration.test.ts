import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRegisteredAgent, PostgresAgentRegistryRepository } from '@taskmarket/agent-registry';
import { parseEnv } from '../../../scripts/check-env.mjs';

import { createMarketplaceListing } from './domain.js';
import {
  MarketplaceCatalogDuplicateError,
  MarketplaceCatalogNotFoundError,
  MarketplaceCatalogVersionConflictError,
} from './errors.js';
import { PostgresCatalogRepository } from './postgres.js';

const ENV_PATH = new URL('../../../.env', import.meta.url);
const AGENT_MIGRATION_PATH = new URL(
  '../../agent-registry/migrations/001_agent_registry.sql',
  import.meta.url,
);
const CATALOG_MIGRATION_PATH = new URL(
  '../migrations/001_marketplace_catalog.sql',
  import.meta.url,
);

async function loadFileEnv(): Promise<Record<string, string>> {
  try {
    return parseEnv(readFileSync(ENV_PATH, 'utf8'));
  } catch {
    return {};
  }
}

const FIXED_NOW = 1_700_000_000_000;
const agentDeps = {
  clock: () => FIXED_NOW,
  agentIdFactory: () => `agent-${randomUUID().slice(0, 8)}`,
  endpointIdFactory: () => 'endpoint-0001',
};
const listingDeps = {
  clock: () => FIXED_NOW,
  listingIdFactory: () => `listing-${randomUUID().slice(0, 8)}`,
};

const AGENT_INPUT = {
  ownerRef: 'account-42',
  name: 'Trade Bot',
  description: 'Places limit orders.',
  capabilities: ['agent:meta', 'trades:create', 'wallet:read'],
  status: 'active' as const,
};

async function resolveDatabaseUrl(): Promise<string> {
  const fileEnv = await loadFileEnv();
  const env = { ...fileEnv, ...process.env };
  return (
    env.DATABASE_URL ?? 'postgres://taskmarket_dev:taskmarket_dev@localhost:5432/taskmarket_dev'
  );
}

async function probeDatabase(url: string): Promise<boolean> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.query('select 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

const databaseUrl = await resolveDatabaseUrl();
const reachable = await probeDatabase(databaseUrl);

const describeDb = describe.skipIf(!reachable);

describeDb('PostgresCatalogRepository (integration)', () => {
  const schema = `taskmarket_test_${randomUUID().slice(0, 8)}`;
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const repo = new PostgresCatalogRepository(pool, { schema });
  const agentRepo = new PostgresAgentRegistryRepository(pool, { schema });
  let client: pg.PoolClient;

  beforeAll(async () => {
    client = await pool.connect();
    await client.query(`create schema "${schema}"`);
    await client.query(`set search_path to "${schema}", public`);
    await client.query(readFileSync(AGENT_MIGRATION_PATH, 'utf8'));
    await client.query(readFileSync(CATALOG_MIGRATION_PATH, 'utf8'));
  });

  afterAll(async () => {
    await client.query(`drop schema if exists "${schema}" cascade`);
    client.release();
    await pool.end();
  });

  it('creates and loads a listing with JSONB fields intact', async () => {
    const agent = createRegisteredAgent(AGENT_INPUT, agentDeps);
    await agentRepo.create(agent);
    const listing = createMarketplaceListing(
      {
        ownerRef: 'account-42',
        agentId: agent.id,
        title: 'Limit order execution',
        capabilities: ['trades:create', 'agent:meta'],
        pricing: [{ name: 'per task', currency: 'USDC', amount: '0.01' }],
        availability: { status: 'available' },
        trust: { selfReported: true, rating: '4.2' },
      },
      listingDeps,
    );
    await repo.create(listing);

    const loaded = await repo.getById(listing.id);
    expect(loaded).not.toBeNull();
    expect(loaded).toMatchObject({
      id: listing.id,
      ownerRef: 'account-42',
      agentId: agent.id,
      title: 'Limit order execution',
      status: 'draft',
      version: 1,
      capabilities: ['trades:create', 'agent:meta'],
      pricing: [{ name: 'per task', currency: 'USDC', amount: '0.01' }],
      availability: { status: 'available' },
      trust: { selfReported: true, rating: '4.2' },
    });
  });

  it('rejects duplicate listing ids', async () => {
    const agent = createRegisteredAgent(AGENT_INPUT, agentDeps);
    await agentRepo.create(agent);
    const listing = createMarketplaceListing(
      {
        ownerRef: 'account-42',
        agentId: agent.id,
        title: 'Duplicate',
        capabilities: ['trades:create'],
      },
      listingDeps,
    );
    await repo.create(listing);
    await expect(repo.create(listing)).rejects.toThrow(MarketplaceCatalogDuplicateError);
  });

  it('lists listings by owner and by agent', async () => {
    const agent = createRegisteredAgent(AGENT_INPUT, agentDeps);
    await agentRepo.create(agent);
    const listing = createMarketplaceListing(
      {
        ownerRef: 'account-42',
        agentId: agent.id,
        title: 'Owned',
        capabilities: ['trades:create'],
      },
      listingDeps,
    );
    await repo.create(listing);
    expect((await repo.listByOwner('account-42')).some((entry) => entry.id === listing.id)).toBe(
      true,
    );
    expect((await repo.listByAgent(agent.id)).some((entry) => entry.id === listing.id)).toBe(true);
    expect(await repo.listByOwner('no-such-owner')).toEqual([]);
  });

  it('saves an updated listing with optimistic version control', async () => {
    const agent = createRegisteredAgent(AGENT_INPUT, agentDeps);
    await agentRepo.create(agent);
    const listing = createMarketplaceListing(
      { ownerRef: 'account-42', agentId: agent.id, title: 'V1', capabilities: ['trades:create'] },
      listingDeps,
    );
    await repo.create(listing);

    const updated = createMarketplaceListing(
      {
        ownerRef: 'account-42',
        agentId: agent.id,
        title: 'V2',
        capabilities: ['trades:create'],
        status: 'published',
      },
      { ...listingDeps, listingIdFactory: () => listing.id },
    );
    const next: typeof updated = { ...updated, version: listing.version + 1 };
    await repo.save(next, listing.version);
    expect((await repo.getById(listing.id))?.title).toBe('V2');
    expect((await repo.getById(listing.id))?.version).toBe(2);

    await expect(repo.save(next, listing.version)).rejects.toThrow(
      MarketplaceCatalogVersionConflictError,
    );
  });

  it('reports not found when saving an unknown id', async () => {
    const listing = createMarketplaceListing(
      { ownerRef: 'account-42', agentId: 'ghost', title: 'Ghost', capabilities: ['trades:create'] },
      listingDeps,
    );
    await expect(repo.save(listing, 1)).rejects.toThrow(MarketplaceCatalogNotFoundError);
  });

  it('enforces immutable fields at the database boundary', async () => {
    const agent = createRegisteredAgent(AGENT_INPUT, agentDeps);
    await agentRepo.create(agent);
    const listing = createMarketplaceListing(
      {
        ownerRef: 'account-42',
        agentId: agent.id,
        title: 'Immutable',
        capabilities: ['trades:create'],
      },
      listingDeps,
    );
    await repo.create(listing);
    await expect(
      client.query(`update "${schema}"."listings" set owner_ref = 'other' where id = $1`, [
        listing.id,
      ]),
    ).rejects.toThrow(/owner_ref is immutable/);
    await expect(
      client.query(`update "${schema}"."listings" set agent_id = 'other' where id = $1`, [
        listing.id,
      ]),
    ).rejects.toThrow(/agent_id is immutable/);
  });
});
