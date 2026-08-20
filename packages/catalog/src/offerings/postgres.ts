import type pg from 'pg';

import {
  MarketplaceCatalogDatabaseError,
  MarketplaceCatalogDuplicateError,
  MarketplaceCatalogNotFoundError,
  MarketplaceCatalogVersionConflictError,
} from '../errors.js';
import type { ServiceOfferingRepository } from './repository.js';
import type {
  EstimatedExecutionTime,
  ServiceConstraints,
  ServiceInput,
  ServiceOffering,
  ServiceOutput,
} from './types.js';

/** Row shape produced by the `service_offerings` table (schema from `migrations/`). */
interface OfferingRow {
  id: string;
  owner_ref: string;
  agent_id: string;
  name: string;
  description: string;
  capabilities: unknown;
  inputs: unknown;
  outputs: unknown;
  pricing: unknown;
  estimated_execution_time: unknown;
  constraints: unknown;
  status: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

function parseArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

function toDomainOffering(row: OfferingRow): ServiceOffering {
  return {
    id: row.id,
    ownerRef: row.owner_ref,
    agentId: row.agent_id,
    name: row.name,
    description: row.description,
    capabilities: parseArray(row.capabilities),
    inputs: Array.isArray(row.inputs) ? (row.inputs as ServiceInput[]) : [],
    outputs: Array.isArray(row.outputs) ? (row.outputs as ServiceOutput[]) : [],
    pricing: Array.isArray(row.pricing) ? (row.pricing as ServiceOffering['pricing']) : [],
    estimatedExecutionTime: (row.estimated_execution_time ?? {
      averageMs: 0,
      maxMs: 0,
    }) as EstimatedExecutionTime,
    constraints: (row.constraints ?? {}) as ServiceConstraints,
    status: row.status as ServiceOffering['status'],
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Postgres-backed service offerings repository. Writes never change immutable
 * fields (the `catalog_service_offerings_immutable_trigger` from the migration
 * rejects them at the database boundary). `save` performs an optimistic
 * `UPDATE ... WHERE id AND version = previous`, so concurrent updates conflict
 * safely.
 */
export class PostgresServiceOfferingRepository implements ServiceOfferingRepository {
  private readonly offeringsTable: string;

  constructor(
    private readonly pool: pg.Pool,
    options: { schema?: string } = {},
  ) {
    const schema = options.schema ?? 'public';
    this.offeringsTable =
      schema === 'public' ? '"service_offerings"' : `"${schema}"."service_offerings"`;
  }

  private async query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<T[]> {
    try {
      const result = await this.pool.query<T>(text, values);
      return result.rows;
    } catch (error) {
      throw new MarketplaceCatalogDatabaseError(
        `service offerings database operation failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  async create(offering: ServiceOffering): Promise<ServiceOffering> {
    try {
      await this.query(
        `insert into ${this.offeringsTable}
          (id, owner_ref, agent_id, name, description, capabilities, inputs, outputs, pricing, estimated_execution_time, constraints, status, version, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, $14, $15)`,
        [
          offering.id,
          offering.ownerRef,
          offering.agentId,
          offering.name,
          offering.description,
          JSON.stringify(offering.capabilities),
          JSON.stringify(offering.inputs),
          JSON.stringify(offering.outputs),
          JSON.stringify(offering.pricing),
          JSON.stringify(offering.estimatedExecutionTime),
          JSON.stringify(offering.constraints),
          offering.status,
          offering.version,
          new Date(offering.createdAt),
          new Date(offering.updatedAt),
        ],
      );
      return offering;
    } catch (error) {
      if (
        error instanceof MarketplaceCatalogDatabaseError &&
        error.cause !== undefined &&
        typeof error.cause === 'object' &&
        error.cause !== null &&
        'code' in error.cause &&
        (error.cause as { code?: string }).code === '23505'
      ) {
        throw new MarketplaceCatalogDuplicateError(offering.id);
      }
      throw error;
    }
  }

  async getById(id: string): Promise<ServiceOffering | null> {
    const rows = await this.query<OfferingRow>(
      `select * from ${this.offeringsTable} where id = $1`,
      [id],
    );
    const row = rows[0];
    return row === undefined ? null : toDomainOffering(row);
  }

  async listAll(): Promise<ServiceOffering[]> {
    const rows = await this.query<OfferingRow>(`select * from ${this.offeringsTable}`);
    return rows.map(toDomainOffering);
  }

  async listByOwner(ownerRef: string): Promise<ServiceOffering[]> {
    const rows = await this.query<OfferingRow>(
      `select * from ${this.offeringsTable} where owner_ref = $1 order by created_at asc`,
      [ownerRef],
    );
    return rows.map(toDomainOffering);
  }

  async listByAgent(agentId: string): Promise<ServiceOffering[]> {
    const rows = await this.query<OfferingRow>(
      `select * from ${this.offeringsTable} where agent_id = $1 order by created_at asc`,
      [agentId],
    );
    return rows.map(toDomainOffering);
  }

  async save(offering: ServiceOffering, previousVersion: number): Promise<ServiceOffering> {
    try {
      const result = await this.pool.query(
        `update ${this.offeringsTable}
            set name = $2,
                description = $3,
                capabilities = $4::jsonb,
                inputs = $5::jsonb,
                outputs = $6::jsonb,
                pricing = $7::jsonb,
                estimated_execution_time = $8::jsonb,
                constraints = $9::jsonb,
                status = $10,
                version = $11,
                updated_at = $12
          where id = $1 and version = $13`,
        [
          offering.id,
          offering.name,
          offering.description,
          JSON.stringify(offering.capabilities),
          JSON.stringify(offering.inputs),
          JSON.stringify(offering.outputs),
          JSON.stringify(offering.pricing),
          JSON.stringify(offering.estimatedExecutionTime),
          JSON.stringify(offering.constraints),
          offering.status,
          offering.version,
          new Date(offering.updatedAt),
          previousVersion,
        ],
      );

      if (result.rowCount === 0) {
        const existing = await this.getById(offering.id);
        if (existing === null) {
          throw new MarketplaceCatalogNotFoundError(offering.id);
        }
        throw new MarketplaceCatalogVersionConflictError(
          offering.id,
          previousVersion,
          existing.version,
        );
      }
      return offering;
    } catch (error) {
      if (
        error instanceof MarketplaceCatalogDatabaseError ||
        error instanceof MarketplaceCatalogNotFoundError ||
        error instanceof MarketplaceCatalogVersionConflictError
      ) {
        throw error;
      }
      throw new MarketplaceCatalogDatabaseError(
        `service offerings save failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }
}
