import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  AGENT_REGISTRY_ERROR_CODES,
  createAgentRegistrationService,
  createCapabilityDiscoveryService,
  PostgresAgentRegistryRepository,
} from '@taskmarket/agent-registry';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEFAULT_DATABASE_URL } from '../env.js';
import { httpStatusForErrorCode, toHttpErrorBody } from '../http.js';
import { buildDisableRequest, buildRegisterRequest, buildUpdateRequest } from './envelopes.js';
import { requireOkAgent } from './registry.js';

const MIGRATION_PATH = new URL(
  '../../../../packages/agent-registry/migrations/001_agent_registry.sql',
  import.meta.url,
);

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

const databaseUrl = process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
const reachable = await probeDatabase(databaseUrl);

const describeDb = describe.skipIf(!reachable);

describeDb('dashboard server adapter (integration)', () => {
  const schema = `taskmarket_web_test_${randomUUID().slice(0, 8)}`;
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const repo = new PostgresAgentRegistryRepository(pool, { schema });
  const registration = createAgentRegistrationService(repo);
  const discovery = createCapabilityDiscoveryService(repo);
  let client: pg.PoolClient;

  const FORM = {
    name: 'Dashboard Trader',
    description: 'Registered through the dashboard adapter.',
    capabilities: 'agent:meta, wallet:read',
    endpoints: 'mcp https://example.com/trader\nhttps://example.com/webhook',
    status: 'active' as const,
    currency: 'USDC',
    minAmount: '0.01',
    maxAmount: '10',
    pricingDescription: 'per trade',
  };

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

  it('registers an agent through the adapter envelope', async () => {
    const agent = requireOkAgent(await registration.handle(buildRegisterRequest(FORM)));
    expect(agent.name).toBe('Dashboard Trader');
    expect(agent.status).toBe('active');
    expect(agent.version).toBe(1);
    expect(agent.pricing).toEqual({
      currency: 'USDC',
      minAmount: '0.01',
      maxAmount: '10',
      description: 'per trade',
    });
    expect(agent.endpoints).toHaveLength(2);
  });

  it('publishes the agent through capability discovery with a safe projection', async () => {
    const response = await discovery.query({});
    expect(response.ok).toBe(true);
    if (!response.ok) {
      return;
    }
    const item = response.result.items.find((entry) => entry.name === 'Dashboard Trader');
    expect(item).toBeDefined();
    expect(item?.endpoints.every((endpoint) => !('metadata' in endpoint))).toBe(true);
  });

  it('updates mutable fields with optimistic concurrency', async () => {
    const created = requireOkAgent(await registration.handle(buildRegisterRequest(FORM)));
    const updated = requireOkAgent(
      await registration.handle(
        buildUpdateRequest(created.id, 1, {
          name: 'Dashboard Trader v2',
          description: 'Updated through the dashboard adapter.',
          capabilities: 'agent:meta, wallet:read, trades:create',
          endpoints: 'mcp https://example.com/trader',
        }),
      ),
    );
    expect(updated.name).toBe('Dashboard Trader v2');
    expect(updated.version).toBe(2);
    expect(updated.capabilities).toContain('trades:create');
    expect(updated.endpoints).toHaveLength(1);
  });

  it('surfaces a version conflict with a 409 HTTP mapping', async () => {
    const created = requireOkAgent(await registration.handle(buildRegisterRequest(FORM)));
    const stale = await registration.handle(
      buildUpdateRequest(created.id, 99, {
        name: 'Stale rename',
        description: '',
        capabilities: '',
        endpoints: '',
      }),
    );
    expect(stale.ok).toBe(false);
    if (stale.ok) {
      return;
    }
    expect(stale.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.VERSION_CONFLICT);
    expect(httpStatusForErrorCode(stale.error.code)).toBe(409);
    const body = toHttpErrorBody(stale.error);
    expect(body.error.code).toBe(AGENT_REGISTRY_ERROR_CODES.VERSION_CONFLICT);
    expect(body.error.message).toMatch(/version conflict/i);
  });

  it('retires an agent and removes it from discovery', async () => {
    const created = requireOkAgent(await registration.handle(buildRegisterRequest(FORM)));
    const disabled = requireOkAgent(
      await registration.handle(buildDisableRequest(created.id, created.version)),
    );
    expect(disabled.status).toBe('retired');
    const search = await discovery.query({ query: 'Dashboard Trader' });
    expect(search.ok).toBe(true);
    if (search.ok) {
      expect(search.result.items.some((entry) => entry.id === created.id)).toBe(false);
    }
  });
});
