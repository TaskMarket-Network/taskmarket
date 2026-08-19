import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseEnv } from '../../../scripts/check-env.mjs';
import { applyAgentUpdate, createRegisteredAgent } from './domain.js';
import {
  AgentRegistryDuplicateError,
  AgentRegistryNotFoundError,
  AgentRegistryVersionConflictError,
} from './errors.js';
import { PostgresAgentRegistryRepository } from './postgres.js';

const ENV_PATH = new URL('../../../.env', import.meta.url);
const MIGRATION_PATH = new URL('../migrations/001_agent_registry.sql', import.meta.url);

async function loadFileEnv(): Promise<Record<string, string>> {
  try {
    return parseEnv(readFileSync(ENV_PATH, 'utf8'));
  } catch {
    // No .env file; fall through to process.env and the safe local default.
    return {};
  }
}

const FIXED_NOW = 1_700_000_000_000;
const deps = {
  clock: () => FIXED_NOW,
  agentIdFactory: () => `agent-${randomUUID().slice(0, 8)}`,
  endpointIdFactory: () => 'endpoint-0001',
};

const BASE_INPUT = {
  ownerRef: 'account-42',
  name: 'Reference Agent',
  description: 'Integration test agent.',
  capabilities: ['agent:meta', 'wallet:read'],
  endpoints: [{ type: 'mcp' as const, url: 'https://example.com/mcp' }],
  pricing: { currency: 'BTC', minAmount: '0.001' },
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

describeDb('PostgresAgentRegistryRepository (integration)', () => {
  const schema = `taskmarket_test_${randomUUID().slice(0, 8)}`;
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const repo = new PostgresAgentRegistryRepository(pool, { schema });
  let client: pg.PoolClient;

  beforeAll(async () => {
    client = await pool.connect();
    await client.query(`create schema "${schema}"`);
    await client.query(`set search_path to "${schema}", public`);
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    await client.query(sql);
  });

  afterAll(async () => {
    await client.query(`drop schema if exists "${schema}" cascade`);
    client.release();
    await pool.end();
  });

  it('creates and loads an agent with JSONB fields intact', async () => {
    const agent = createRegisteredAgent(BASE_INPUT, deps);
    await repo.create(agent);

    const loaded = await repo.getById(agent.id);
    expect(loaded).not.toBeNull();
    expect(loaded).toMatchObject({
      id: agent.id,
      ownerRef: 'account-42',
      name: 'Reference Agent',
      version: 1,
      status: 'draft',
      capabilities: ['agent:meta', 'wallet:read'],
      pricing: { currency: 'BTC', minAmount: '0.001' },
    });
    expect(loaded?.endpoints).toHaveLength(1);
    expect(loaded?.createdAt).toBe('2023-11-14T22:13:20.000Z');
  });

  it('rejects duplicate ids', async () => {
    const agent = createRegisteredAgent(BASE_INPUT, deps);
    await repo.create(agent);
    await expect(repo.create(agent)).rejects.toThrow(AgentRegistryDuplicateError);
  });

  it('lists agents by owner', async () => {
    const repo2 = new PostgresAgentRegistryRepository(pool, { schema });
    const agent = createRegisteredAgent(BASE_INPUT, deps);
    await repo2.create(agent);
    const owned = await repo2.listByOwner('account-42');
    expect(owned.some((entry) => entry.id === agent.id)).toBe(true);
    expect(await repo2.listByOwner('no-such-owner')).toEqual([]);
  });

  it('saves an updated agent with optimistic version control', async () => {
    const agent = createRegisteredAgent(BASE_INPUT, deps);
    await repo.create(agent);

    const updated = applyAgentUpdate(agent, { name: 'Renamed', status: 'active' }, deps);
    await repo.save(updated, 1);
    expect((await repo.getById(agent.id))?.name).toBe('Renamed');
    expect((await repo.getById(agent.id))?.status).toBe('active');
    expect((await repo.getById(agent.id))?.version).toBe(2);

    const stale = applyAgentUpdate(updated, { name: 'Stale' }, deps);
    await expect(repo.save(stale, 1)).rejects.toThrow(AgentRegistryVersionConflictError);
    await expect(repo.save(stale, 2)).resolves.toBe(stale);
  });

  it('reports not found when saving an unknown id', async () => {
    const ghost = createRegisteredAgent({ ...BASE_INPUT, id: 'ghost' }, deps);
    await expect(repo.save(ghost, 1)).rejects.toThrow(AgentRegistryNotFoundError);
  });

  it('enforces immutable fields at the database boundary', async () => {
    const agent = createRegisteredAgent(BASE_INPUT, deps);
    await repo.create(agent);
    await expect(
      client.query(`update "${schema}"."agents" set owner_ref = 'other-owner' where id = $1`, [
        agent.id,
      ]),
    ).rejects.toThrow(/owner_ref is immutable/);
    await expect(
      client.query(`update "${schema}"."agents" set created_at = now() where id = $1`, [agent.id]),
    ).rejects.toThrow(/created_at is immutable/);
  });
});
