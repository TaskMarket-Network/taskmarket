import type { RegisteredAgent } from '../types.js';
import { capabilityNamespace } from './capability.js';
import type {
  CapabilityDiscoveryItem,
  CapabilityDiscoveryQuery,
  CapabilityDiscoveryResult,
} from './types.js';
import { CAPABILITY_DISCOVERY_API_VERSION } from './version.js';

/** Filtering, ranking, and pagination are pure and unit-testable. */

interface ScoredAgent {
  agent: RegisteredAgent;
  relevance: number;
}

/** Strip endpoint metadata so untrusted metadata is never returned. */
function toDiscoveryItem(agent: RegisteredAgent): CapabilityDiscoveryItem {
  const base: CapabilityDiscoveryItem = {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    capabilities: [...agent.capabilities],
    endpoints: agent.endpoints.map(({ id, type, url }) => ({ id, type, url })),
    status: 'active',
    version: agent.version,
    updatedAt: agent.updatedAt,
  };
  return agent.pricing === undefined ? base : { ...base, pricing: agent.pricing };
}

/** A scored agent matches the query when all filter groups agree (AND). */
function matches(agent: RegisteredAgent, query: CapabilityDiscoveryQuery): boolean {
  if (agent.status !== 'active') {
    return false;
  }

  const requestedCapabilities = query.capabilities ?? [];
  if (requestedCapabilities.length > 0) {
    for (const key of requestedCapabilities) {
      if (!agent.capabilities.includes(key)) {
        return false;
      }
    }
  }

  const requestedNamespaces = query.namespaces ?? [];
  if (requestedNamespaces.length > 0) {
    const agentNamespaces = new Set(
      agent.capabilities
        .map((key) => capabilityNamespace(key))
        .filter((namespace): namespace is string => namespace !== null),
    );
    if (!requestedNamespaces.some((namespace) => agentNamespaces.has(namespace))) {
      return false;
    }
  }

  const text = query.query ?? '';
  if (text.length > 0) {
    const needle = text.toLowerCase();
    const haystack = [agent.name, agent.description, ...agent.capabilities].join(' ').toLowerCase();
    if (!haystack.includes(needle)) {
      return false;
    }
  }

  return true;
}

/**
 * Ranking score: the number of declared capabilities that satisfy the
 * requested filters (exact capability matches plus namespace matches). Agents
 * with more matches rank higher; with no capability/namespace filters every
 * agent scores 0 and the secondary `sortBy` decides.
 */
function score(agent: RegisteredAgent, query: CapabilityDiscoveryQuery): number {
  const requestedCapabilities = new Set(query.capabilities ?? []);
  const requestedNamespaces = new Set(query.namespaces ?? []);
  let relevance = 0;
  for (const key of agent.capabilities) {
    if (requestedCapabilities.has(key)) {
      relevance += 1;
    }
    const namespace = capabilityNamespace(key);
    if (namespace !== null && requestedNamespaces.has(namespace)) {
      relevance += 1;
    }
  }
  return relevance;
}

/** Compare two scored agents by the requested sort field and direction. */
function compareScored(a: ScoredAgent, b: ScoredAgent, query: CapabilityDiscoveryQuery): number {
  const direction = query.sortDirection;
  let comparison: number;
  switch (query.sortBy) {
    case 'relevance':
      comparison = a.relevance - b.relevance;
      break;
    case 'updatedAt':
      comparison = a.agent.updatedAt.localeCompare(b.agent.updatedAt);
      break;
    case 'createdAt':
      comparison = a.agent.createdAt.localeCompare(b.agent.createdAt);
      break;
    case 'name':
      comparison = a.agent.name.localeCompare(b.agent.name);
      break;
    case 'version':
      comparison = a.agent.version - b.agent.version;
      break;
  }
  if (comparison !== 0) {
    return direction === 'asc' ? comparison : -comparison;
  }
  // Deterministic tiebreak: stable id ordering regardless of direction.
  return a.agent.id.localeCompare(b.agent.id);
}

/**
 * Search, rank, and paginate registered agents. Only `active` agents are
 * candidates; the caller is responsible for validating the query at the trust
 * boundary first (see `capabilityDiscoveryQuerySchema`).
 */
export function searchCapabilities(
  agents: readonly RegisteredAgent[],
  query: CapabilityDiscoveryQuery,
): CapabilityDiscoveryResult {
  const scored: ScoredAgent[] = [];
  for (const agent of agents) {
    if (matches(agent, query)) {
      scored.push({ agent, relevance: score(agent, query) });
    }
  }
  scored.sort((a, b) => compareScored(a, b, query));

  const total = scored.length;
  const items = scored
    .slice(query.offset, query.offset + query.limit)
    .map((entry) => toDiscoveryItem(entry.agent));

  return {
    contractVersion: CAPABILITY_DISCOVERY_API_VERSION,
    total,
    limit: query.limit,
    offset: query.offset,
    items,
  };
}
