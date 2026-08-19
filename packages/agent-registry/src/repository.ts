import {
  AgentRegistryDuplicateError,
  AgentRegistryNotFoundError,
  AgentRegistryVersionConflictError,
} from './errors.js';
import type { RegisteredAgent } from './types.js';

/**
 * Persistence boundary for the agent registry. Domain logic depends on this
 * interface, never on a database driver (ADR-0005). `save` uses optimistic
 * concurrency: it requires the previous version and rejects on mismatch.
 */
export interface AgentRegistryRepository {
  /** Persist a new agent. Throws {@link AgentRegistryDuplicateError} on id collision. */
  create(agent: RegisteredAgent): Promise<RegisteredAgent>;
  /** Load an agent by id, or `null` when it does not exist. */
  getById(id: string): Promise<RegisteredAgent | null>;
  /** List all agents owned by the given owner reference (oldest first). */
  listByOwner(ownerRef: string): Promise<RegisteredAgent[]>;
  /**
   * Persist an updated agent, replacing the row whose version equals
   * `previousVersion`. Throws {@link AgentRegistryNotFoundError} when the
   * agent does not exist and {@link AgentRegistryVersionConflictError} when
   * the stored version differs (the caller must reload and retry).
   */
  save(agent: RegisteredAgent, previousVersion: number): Promise<RegisteredAgent>;
}

/**
 * In-memory repository for unit tests and deterministic development. Not for
 * production; concurrent writers are not coordinated.
 */
export class InMemoryAgentRegistryRepository implements AgentRegistryRepository {
  private readonly store = new Map<string, RegisteredAgent>();

  async create(agent: RegisteredAgent): Promise<RegisteredAgent> {
    if (this.store.has(agent.id)) {
      throw new AgentRegistryDuplicateError(agent.id);
    }
    this.store.set(agent.id, agent);
    return agent;
  }

  async getById(id: string): Promise<RegisteredAgent | null> {
    return this.store.get(id) ?? null;
  }

  async listByOwner(ownerRef: string): Promise<RegisteredAgent[]> {
    return [...this.store.values()]
      .filter((agent) => agent.ownerRef === ownerRef)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async save(agent: RegisteredAgent, previousVersion: number): Promise<RegisteredAgent> {
    const existing = this.store.get(agent.id);
    if (existing === undefined) {
      throw new AgentRegistryNotFoundError(agent.id);
    }
    if (existing.version !== previousVersion) {
      throw new AgentRegistryVersionConflictError(agent.id, previousVersion, existing.version);
    }
    this.store.set(agent.id, agent);
    return agent;
  }
}
