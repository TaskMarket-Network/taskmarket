import {
  ServiceOfferingDuplicateError,
  ServiceOfferingNotFoundError,
  ServiceOfferingVersionConflictError,
} from './errors.js';
import type { ServiceOffering } from './types.js';

/**
 * Persistence boundary for service offerings. Domain logic depends on this
 * interface, never on a database driver (ADR-0005). `save` uses optimistic
 * concurrency: it requires the previous version and rejects on mismatch.
 */
export interface ServiceOfferingRepository {
  /** Persist a new offering. Throws {@link ServiceOfferingDuplicateError} on id collision. */
  create(offering: ServiceOffering): Promise<ServiceOffering>;
  /** Load an offering by id, or `null` when it does not exist. */
  getById(id: string): Promise<ServiceOffering | null>;
  /** List all offerings (unspecified order). */
  listAll(): Promise<ServiceOffering[]>;
  /** List all offerings owned by the given owner reference (oldest first). */
  listByOwner(ownerRef: string): Promise<ServiceOffering[]>;
  /** List all offerings referencing the given agent id (oldest first). */
  listByAgent(agentId: string): Promise<ServiceOffering[]>;
  /**
   * Persist an updated offering, replacing the row whose version equals
   * `previousVersion`. Throws {@link ServiceOfferingNotFoundError} when the
   * offering does not exist and {@link ServiceOfferingVersionConflictError}
   * when the stored version differs (the caller must reload and retry).
   */
  save(offering: ServiceOffering, previousVersion: number): Promise<ServiceOffering>;
}

/**
 * In-memory repository for unit tests and deterministic development. Not for
 * production; concurrent writers are not coordinated.
 */
export class InMemoryServiceOfferingRepository implements ServiceOfferingRepository {
  private readonly store = new Map<string, ServiceOffering>();

  async create(offering: ServiceOffering): Promise<ServiceOffering> {
    if (this.store.has(offering.id)) {
      throw new ServiceOfferingDuplicateError(offering.id);
    }
    this.store.set(offering.id, offering);
    return offering;
  }

  async getById(id: string): Promise<ServiceOffering | null> {
    return this.store.get(id) ?? null;
  }

  async listAll(): Promise<ServiceOffering[]> {
    return [...this.store.values()];
  }

  async listByOwner(ownerRef: string): Promise<ServiceOffering[]> {
    return [...this.store.values()]
      .filter((offering) => offering.ownerRef === ownerRef)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listByAgent(agentId: string): Promise<ServiceOffering[]> {
    return [...this.store.values()]
      .filter((offering) => offering.agentId === agentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async save(offering: ServiceOffering, previousVersion: number): Promise<ServiceOffering> {
    const existing = this.store.get(offering.id);
    if (existing === undefined) {
      throw new ServiceOfferingNotFoundError(offering.id);
    }
    if (existing.version !== previousVersion) {
      throw new ServiceOfferingVersionConflictError(offering.id, previousVersion, existing.version);
    }
    this.store.set(offering.id, offering);
    return offering;
  }
}
