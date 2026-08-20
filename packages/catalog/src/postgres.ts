import type pg from 'pg';

import {
  MarketplaceCatalogDatabaseError,
  MarketplaceCatalogDuplicateError,
  MarketplaceCatalogNotFoundError,
  MarketplaceCatalogVersionConflictError,
} from './errors.js';
import type { CatalogRepository } from './repository.js';
import type {
  ListingAvailability,
  ListingPricing,
  ListingTrust,
  MarketplaceListing,
} from './types.js';

/** Row shape produced by the `listings` table (schema from `migrations/`). */
interface ListingRow {
  id: string;
  owner_ref: string;
  agent_id: string;
  title: string;
  description: string;
  capabilities: unknown;
  pricing: unknown;
  availability: unknown;
  trust: unknown;
  status: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

function parsePricing(value: unknown): ListingPricing[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value as ListingPricing[];
}

function toDomainListing(row: ListingRow): MarketplaceListing {
  const availability = row.availability as ListingAvailability;
  const trust = row.trust as ListingTrust;
  return {
    id: row.id,
    ownerRef: row.owner_ref,
    agentId: row.agent_id,
    title: row.title,
    description: row.description,
    capabilities: Array.isArray(row.capabilities) ? (row.capabilities as string[]) : [],
    pricing: parsePricing(row.pricing),
    availability: Array.isArray(availability) ? { status: 'available' } : availability,
    trust,
    status: row.status as MarketplaceListing['status'],
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Postgres-backed marketplace catalog repository. Writes immutable fields never
 * (the `catalog_listings_immutable_trigger` from the migration rejects them at
 * the database boundary). `save` performs an optimistic `UPDATE ... WHERE id
 * AND version = previous`, so concurrent updates conflict safely.
 */
export class PostgresCatalogRepository implements CatalogRepository {
  private readonly listingsTable: string;

  constructor(
    private readonly pool: pg.Pool,
    options: { schema?: string } = {},
  ) {
    const schema = options.schema ?? 'public';
    this.listingsTable = schema === 'public' ? '"listings"' : `"${schema}"."listings"`;
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
        `marketplace catalog database operation failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  async create(listing: MarketplaceListing): Promise<MarketplaceListing> {
    try {
      await this.query(
        `insert into ${this.listingsTable}
          (id, owner_ref, agent_id, title, description, capabilities, pricing, availability, trust, status, version, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12, $13)`,
        [
          listing.id,
          listing.ownerRef,
          listing.agentId,
          listing.title,
          listing.description,
          JSON.stringify(listing.capabilities),
          JSON.stringify(listing.pricing),
          JSON.stringify(listing.availability),
          JSON.stringify(listing.trust),
          listing.status,
          listing.version,
          new Date(listing.createdAt),
          new Date(listing.updatedAt),
        ],
      );
      return listing;
    } catch (error) {
      if (
        error instanceof MarketplaceCatalogDatabaseError &&
        error.cause !== undefined &&
        typeof error.cause === 'object' &&
        error.cause !== null &&
        'code' in error.cause &&
        (error.cause as { code?: string }).code === '23505'
      ) {
        throw new MarketplaceCatalogDuplicateError(listing.id);
      }
      throw error;
    }
  }

  async getById(id: string): Promise<MarketplaceListing | null> {
    const rows = await this.query<ListingRow>(`select * from ${this.listingsTable} where id = $1`, [
      id,
    ]);
    const row = rows[0];
    return row === undefined ? null : toDomainListing(row);
  }

  async listAll(): Promise<MarketplaceListing[]> {
    const rows = await this.query<ListingRow>(`select * from ${this.listingsTable}`);
    return rows.map(toDomainListing);
  }

  async listByOwner(ownerRef: string): Promise<MarketplaceListing[]> {
    const rows = await this.query<ListingRow>(
      `select * from ${this.listingsTable} where owner_ref = $1 order by created_at asc`,
      [ownerRef],
    );
    return rows.map(toDomainListing);
  }

  async listByAgent(agentId: string): Promise<MarketplaceListing[]> {
    const rows = await this.query<ListingRow>(
      `select * from ${this.listingsTable} where agent_id = $1 order by created_at asc`,
      [agentId],
    );
    return rows.map(toDomainListing);
  }

  async save(listing: MarketplaceListing, previousVersion: number): Promise<MarketplaceListing> {
    try {
      const result = await this.pool.query(
        `update ${this.listingsTable}
            set title = $2,
                description = $3,
                capabilities = $4::jsonb,
                pricing = $5::jsonb,
                availability = $6::jsonb,
                trust = $7::jsonb,
                status = $8,
                version = $9,
                updated_at = $10
          where id = $1 and version = $11`,
        [
          listing.id,
          listing.title,
          listing.description,
          JSON.stringify(listing.capabilities),
          JSON.stringify(listing.pricing),
          JSON.stringify(listing.availability),
          JSON.stringify(listing.trust),
          listing.status,
          listing.version,
          new Date(listing.updatedAt),
          previousVersion,
        ],
      );

      if (result.rowCount === 0) {
        const existing = await this.getById(listing.id);
        if (existing === null) {
          throw new MarketplaceCatalogNotFoundError(listing.id);
        }
        throw new MarketplaceCatalogVersionConflictError(
          listing.id,
          previousVersion,
          existing.version,
        );
      }
      return listing;
    } catch (error) {
      if (error instanceof MarketplaceCatalogDatabaseError) {
        throw error;
      }
      if (
        error instanceof MarketplaceCatalogNotFoundError ||
        error instanceof MarketplaceCatalogVersionConflictError
      ) {
        throw error;
      }
      throw new MarketplaceCatalogDatabaseError(
        `marketplace catalog save failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }
}
