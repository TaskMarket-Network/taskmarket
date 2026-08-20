import {
  MarketplaceCatalogDuplicateError,
  MarketplaceCatalogNotFoundError,
  MarketplaceCatalogVersionConflictError,
} from './errors.js';
import type { MarketplaceListing } from './types.js';

/**
 * Persistence boundary for the marketplace catalog. Domain logic depends on
 * this interface, never on a database driver (ADR-0005). `save` uses optimistic
 * concurrency: it requires the previous version and rejects on mismatch.
 */
export interface CatalogRepository {
  /** Persist a new listing. Throws {@link MarketplaceCatalogDuplicateError} on id collision. */
  create(listing: MarketplaceListing): Promise<MarketplaceListing>;
  /** Load a listing by id, or `null` when it does not exist. */
  getById(id: string): Promise<MarketplaceListing | null>;
  /** List all listings (unspecified order); used by marketplace search. */
  listAll(): Promise<MarketplaceListing[]>;
  /** List all listings owned by the given owner reference (oldest first). */
  listByOwner(ownerRef: string): Promise<MarketplaceListing[]>;
  /** List all listings referencing the given agent id (oldest first). */
  listByAgent(agentId: string): Promise<MarketplaceListing[]>;
  /**
   * Persist an updated listing, replacing the row whose version equals
   * `previousVersion`. Throws {@link MarketplaceCatalogNotFoundError} when the
   * listing does not exist and {@link MarketplaceCatalogVersionConflictError}
   * when the stored version differs (the caller must reload and retry).
   */
  save(listing: MarketplaceListing, previousVersion: number): Promise<MarketplaceListing>;
}

/**
 * In-memory repository for unit tests and deterministic development. Not for
 * production; concurrent writers are not coordinated.
 */
export class InMemoryCatalogRepository implements CatalogRepository {
  private readonly store = new Map<string, MarketplaceListing>();

  async create(listing: MarketplaceListing): Promise<MarketplaceListing> {
    if (this.store.has(listing.id)) {
      throw new MarketplaceCatalogDuplicateError(listing.id);
    }
    this.store.set(listing.id, listing);
    return listing;
  }

  async getById(id: string): Promise<MarketplaceListing | null> {
    return this.store.get(id) ?? null;
  }

  async listAll(): Promise<MarketplaceListing[]> {
    return [...this.store.values()];
  }

  async listByOwner(ownerRef: string): Promise<MarketplaceListing[]> {
    return [...this.store.values()]
      .filter((listing) => listing.ownerRef === ownerRef)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listByAgent(agentId: string): Promise<MarketplaceListing[]> {
    return [...this.store.values()]
      .filter((listing) => listing.agentId === agentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async save(listing: MarketplaceListing, previousVersion: number): Promise<MarketplaceListing> {
    const existing = this.store.get(listing.id);
    if (existing === undefined) {
      throw new MarketplaceCatalogNotFoundError(listing.id);
    }
    if (existing.version !== previousVersion) {
      throw new MarketplaceCatalogVersionConflictError(
        listing.id,
        previousVersion,
        existing.version,
      );
    }
    this.store.set(listing.id, listing);
    return listing;
  }
}
