import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRegisteredAgent, PostgresAgentRegistryRepository } from '@taskmarket/agent-registry';
import { parseEnv } from '../../../../scripts/check-env.mjs';

import { createServiceOffering } from './domain.js';
import { ServiceOfferingNotFoundError, ServiceOfferingVersionConflictError } from './errors.js';
import { PostgresServiceOfferingRepository } from './postgres.js';
import { MarketplaceCatalogDuplicateError } from '../errors.js';

const ENV_PATH = new URL('../../../../.env', import.meta.url);
const AGENT_MIGRATION_PATH = new URL(
  '../../../agent-registry/migrations/001_agent_registry.sql',
  import.meta.url,
);
const OFFERING_MIGRATION_PATH = new URL(
  '../../migrations/002_service_offerings.sql',
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
const offeringDeps = {
  clock: () => FIXED_NOW,
  offeringIdFactory: () => `offering-${randomUUID().slice(0, 8)}`,
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

describeDb('PostgresServiceOfferingRepository (integration)', () => {
  const schema = `taskmarket_test_${randomUUID().slice(0, 8)}`;
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const repo = new PostgresServiceOfferingRepository(pool, { schema });
  const agentRepo = new PostgresAgentRegistryRepository(pool, { schema });
  let client: pg.PoolClient;

  beforeAll(async () => {
    client = await pool.connect();
    await client.query(`create schema "${schema}"`);
    await client.query(`set search_path to "${schema}", public`);
    await client.query(readFileSync(AGENT_MIGRATION_PATH, 'utf8'));
    await client.query(readFileSync(OFFERING_MIGRATION_PATH, 'utf8'));
  });

  afterAll(async () => {
    await client.query(`drop schema if exists "${schema}" cascade`);
    client.release();
    await pool.end();
  });

  it('creates and loads an offering with JSONB fields intact', async () => {
    const agent = createRegisteredAgent(AGENT_INPUT, agentDeps);
    await agentRepo.create(agent);
    const offering = createServiceOffering(
      {
        ownerRef: 'account-42',
        agentId: agent.id,
        name: 'Limit order execution',
        capabilities: ['trades:create'],
        inputs: [{ name: 'symbol', type: 'string', required: true }],
        outputs: [{ name: 'orderId', type: 'string' }],
        pricing: [{ name: 'per order', currency: 'BTC', amount: '0.001' }],
        estimatedExecutionTime: { averageMs: 500, maxMs: 2000 },
        constraints: { timeoutMs: 5000, maxConcurrency: 10 },
      },
      offeringDeps,
    );
    await repo.create(offering);

    const loaded = await repo.getById(offering.id);
    expect(loaded).not.toBeNull();
    expect(loaded).toMatchObject({
      id: offering.id,
      ownerRef: 'account-42',
      agentId: agent.id,
      name: 'Limit order execution',
      status: 'active',
      version: 1,
      capabilities: ['trades:create'],
      inputs: [{ name: 'symbol', type: 'string', required: true }],
      outputs: [{ name: 'orderId', type: 'string' }],
      pricing: [{ name: 'per order', currency: 'BTC', amount: '0.001' }],
      estimatedExecutionTime: { averageMs: 500, maxMs: 2000 },
      constraints: { timeoutMs: 5000, maxConcurrency: 10 },
    });
  });

  it('rejects duplicate offering ids', async () => {
    const agent = createRegisteredAgent(AGENT_INPUT, agentDeps);
    await agentRepo.create(agent);
    const offering = createServiceOffering(
      {
        ownerRef: 'account-42',
        agentId: agent.id,
        name: 'Duplicate',
        estimatedExecutionTime: { averageMs: 0, maxMs: 1000 },
      },
      offeringDeps,
    );
    await repo.create(offering);
    await expect(repo.create(offering)).rejects.toThrow(MarketplaceCatalogDuplicateError);
  });

  it('lists offerings by owner and by agent', async () => {
    const agent = createRegisteredAgent(AGENT_INPUT, agentDeps);
    await agentRepo.create(agent);
    const offering = createServiceOffering(
      {
        ownerRef: 'account-42',
        agentId: agent.id,
        name: 'Owned',
        estimatedExecutionTime: { averageMs: 0, maxMs: 1000 },
      },
      offeringDeps,
    );
    await repo.create(offering);
    expect((await repo.listByOwner('account-42')).some((entry) => entry.id === offering.id)).toBe(
      true,
    );
    expect((await repo.listByAgent(agent.id)).some((entry) => entry.id === offering.id)).toBe(true);
    expect(await repo.listByOwner('no-such-owner')).toEqual([]);
  });

  it('saves an updated offering with optimistic version control', async () => {
    const agent = createRegisteredAgent(AGENT_INPUT, agentDeps);
    await agentRepo.create(agent);
    const offering = createServiceOffering(
      {
        ownerRef: 'account-42',
        agentId: agent.id,
        name: 'V1',
        estimatedExecutionTime: { averageMs: 0, maxMs: 1000 },
      },
      offeringDeps,
    );
    await repo.create(offering);

    const updated = createServiceOffering(
      {
        ownerRef: 'account-42',
        agentId: agent.id,
        name: 'V2',
        estimatedExecutionTime: { averageMs: 0, maxMs: 1000 },
      },
      { ...offeringDeps, offeringIdFactory: () => offering.id },
    );
    const next: typeof updated = { ...updated, version: offering.version + 1 };
    await repo.save(next, offering.version);
    expect((await repo.getById(offering.id))?.name).toBe('V2');
    expect((await repo.getById(offering.id))?.version).toBe(2);

    await expect(repo.save(next, offering.version)).rejects.toThrow(
      ServiceOfferingVersionConflictError,
    );
  });

  it('reports not found when saving an unknown id', async () => {
    const offering = createServiceOffering(
      {
        ownerRef: 'account-42',
        agentId: 'ghost',
        name: 'Ghost',
        estimatedExecutionTime: { averageMs: 0, maxMs: 1000 },
      },
      offeringDeps,
    );
    await expect(repo.save(offering, 1)).rejects.toThrow(ServiceOfferingNotFoundError);
  });

  it('enforces immutable fields at the database boundary', async () => {
    const agent = createRegisteredAgent(AGENT_INPUT, agentDeps);
    await agentRepo.create(agent);
    const offering = createServiceOffering(
      {
        ownerRef: 'account-42',
        agentId: agent.id,
        name: 'Immutable',
        estimatedExecutionTime: { averageMs: 0, maxMs: 1000 },
      },
      offeringDeps,
    );
    await repo.create(offering);
    await expect(
      client.query(`update "${schema}"."service_offerings" set owner_ref = 'other' where id = $1`, [
        offering.id,
      ]),
    ).rejects.toThrow(/owner_ref is immutable/);
    await expect(
      client.query(`update "${schema}"."service_offerings" set agent_id = 'other' where id = $1`, [
        offering.id,
      ]),
    ).rejects.toThrow(/agent_id is immutable/);
  });
});
