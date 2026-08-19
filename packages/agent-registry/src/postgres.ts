import type pg from 'pg';

import {
  AgentRegistryDatabaseError,
  AgentRegistryDuplicateError,
  AgentRegistryNotFoundError,
  AgentRegistryVersionConflictError,
} from './errors.js';
import type { AgentRegistryRepository } from './repository.js';
import type { AgentEndpoint, AgentPricing, RegisteredAgent } from './types.js';

/** Row shape produced by the `agents` table (schema from `migrations/`). */
interface AgentRow {
  id: string;
  owner_ref: string;
  name: string;
  description: string;
  capabilities: unknown;
  endpoints: unknown;
  status: string;
  pricing: unknown | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

function parseJsonArray(value: unknown): AgentEndpoint[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value as AgentEndpoint[];
}

function parsePricing(value: unknown): AgentPricing | undefined {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }
  return value as AgentPricing;
}

function toDomainAgent(row: AgentRow): RegisteredAgent {
  const pricing = parsePricing(row.pricing);
  const base: RegisteredAgent = {
    id: row.id,
    ownerRef: row.owner_ref,
    name: row.name,
    description: row.description,
    capabilities: Array.isArray(row.capabilities) ? (row.capabilities as string[]) : [],
    endpoints: parseJsonArray(row.endpoints),
    status: row.status as RegisteredAgent['status'],
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
  return pricing === undefined ? base : { ...base, pricing };
}

/**
 * Postgres-backed agent registry repository. Writes immutable fields never
 * (the `agents_immutable_trigger` from the migration rejects them at the
 * database boundary). `save` performs an optimistic `UPDATE ... WHERE id AND
 * version = previous`, so concurrent updates conflict safely.
 */
export class PostgresAgentRegistryRepository implements AgentRegistryRepository {
  private readonly agentsTable: string;

  constructor(
    private readonly pool: pg.Pool,
    options: { schema?: string } = {},
  ) {
    const schema = options.schema ?? 'public';
    this.agentsTable = schema === 'public' ? '"agents"' : `"${schema}"."agents"`;
  }

  private async query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<T[]> {
    try {
      const result = await this.pool.query<T>(text, values);
      return result.rows;
    } catch (error) {
      throw new AgentRegistryDatabaseError(
        `agent registry database operation failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  async create(agent: RegisteredAgent): Promise<RegisteredAgent> {
    try {
      await this.query(
        `insert into ${this.agentsTable}
          (id, owner_ref, name, description, capabilities, endpoints, status, pricing, version, created_at, updated_at)
         values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8::jsonb, $9, $10, $11)`,
        [
          agent.id,
          agent.ownerRef,
          agent.name,
          agent.description,
          JSON.stringify(agent.capabilities),
          JSON.stringify(agent.endpoints),
          agent.status,
          agent.pricing !== undefined ? JSON.stringify(agent.pricing) : null,
          agent.version,
          new Date(agent.createdAt),
          new Date(agent.updatedAt),
        ],
      );
      return agent;
    } catch (error) {
      if (
        error instanceof AgentRegistryDatabaseError &&
        error.cause !== undefined &&
        typeof error.cause === 'object' &&
        error.cause !== null &&
        'code' in error.cause &&
        (error.cause as { code?: string }).code === '23505'
      ) {
        throw new AgentRegistryDuplicateError(agent.id);
      }
      throw error;
    }
  }

  async getById(id: string): Promise<RegisteredAgent | null> {
    const rows = await this.query<AgentRow>(`select * from ${this.agentsTable} where id = $1`, [
      id,
    ]);
    const row = rows[0];
    return row === undefined ? null : toDomainAgent(row);
  }

  async listByOwner(ownerRef: string): Promise<RegisteredAgent[]> {
    const rows = await this.query<AgentRow>(
      `select * from ${this.agentsTable} where owner_ref = $1 order by created_at asc`,
      [ownerRef],
    );
    return rows.map(toDomainAgent);
  }

  async save(agent: RegisteredAgent, previousVersion: number): Promise<RegisteredAgent> {
    try {
      const result = await this.pool.query(
        `update ${this.agentsTable}
            set name = $2,
                description = $3,
                capabilities = $4::jsonb,
                endpoints = $5::jsonb,
                status = $6,
                pricing = $7::jsonb,
                version = $8,
                updated_at = $9
          where id = $1 and version = $10`,
        [
          agent.id,
          agent.name,
          agent.description,
          JSON.stringify(agent.capabilities),
          JSON.stringify(agent.endpoints),
          agent.status,
          agent.pricing !== undefined ? JSON.stringify(agent.pricing) : null,
          agent.version,
          new Date(agent.updatedAt),
          previousVersion,
        ],
      );

      if (result.rowCount === 0) {
        const existing = await this.getById(agent.id);
        if (existing === null) {
          throw new AgentRegistryNotFoundError(agent.id);
        }
        throw new AgentRegistryVersionConflictError(agent.id, previousVersion, existing.version);
      }
      return agent;
    } catch (error) {
      if (error instanceof AgentRegistryDatabaseError) {
        throw error;
      }
      if (
        error instanceof AgentRegistryNotFoundError ||
        error instanceof AgentRegistryVersionConflictError
      ) {
        throw error;
      }
      throw new AgentRegistryDatabaseError(
        `agent registry save failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }
}
