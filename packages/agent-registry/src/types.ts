import type { z } from 'zod';

import type {
  agentEndpointInputSchema,
  agentStatusSchema,
  agentUpdateInputSchema,
  registeredAgentInputSchema,
} from './schemas.js';

/** Lifecycle status of a registered agent. */
export type AgentStatus = z.infer<typeof agentStatusSchema>;

/** How an agent endpoint is reached. */
export type AgentEndpointType = 'mcp' | 'http' | 'webhook';

/** A reachable endpoint a registered agent declares. */
export interface AgentEndpoint {
  /** Stable endpoint identifier within the agent. */
  readonly id: string;
  /** How the endpoint is reached. */
  readonly type: AgentEndpointType;
  /** Absolute http(s) URL (SSRF-guarded at the input boundary). */
  readonly url: string;
  /** Optional endpoint metadata (informational). */
  readonly metadata?: Record<string, unknown> | undefined;
}

/** Pricing metadata used for discovery/matching only (not payment). */
export interface AgentPricing {
  /** Currency code, e.g. `USD`, `USDC`, or `BTC`. Metadata only. */
  readonly currency: string;
  /** Optional minimum amount as a decimal string (avoids float issues). */
  readonly minAmount?: string | undefined;
  /** Optional maximum amount as a decimal string. */
  readonly maxAmount?: string | undefined;
  /** Optional human-readable pricing note. */
  readonly description?: string | undefined;
}

/**
 * The off-chain domain model of a registered agent. All fields are readonly:
 * updates produce a new object via the domain functions in `domain.ts`.
 *
 * Immutable fields (set at registration, never change): `id`, `ownerRef`,
 * `createdAt`. Mutable fields: `name`, `description`, `capabilities`,
 * `endpoints`, `status`, `pricing`. `version` increments monotonically on
 * every update and `updatedAt` is bumped with it.
 *
 * This is TaskMarket's **off-chain catalog** and is NOT ERC-8004 identity;
 * protocol identity is introduced in a later phase.
 */
export interface RegisteredAgent {
  /** Stable unique identifier of the registered agent. */
  readonly id: string;
  /** Ownership reference (TaskMarket account id or agent owner reference). */
  readonly ownerRef: string;
  /** Human-readable agent name. */
  readonly name: string;
  /** One-line description. */
  readonly description: string;
  /** Declared capability keys, e.g. `agent:meta`, `wallet:read`. */
  readonly capabilities: string[];
  /** Reachable endpoints the agent declares. */
  readonly endpoints: AgentEndpoint[];
  /** Lifecycle status. */
  readonly status: AgentStatus;
  /** Pricing metadata (informational; no payment behavior). */
  readonly pricing?: AgentPricing | undefined;
  /** Monotonically increasing revision counter. */
  readonly version: number;
  /** ISO-8601 registration timestamp (immutable). */
  readonly createdAt: string;
  /** ISO-8601 last-update timestamp. */
  readonly updatedAt: string;
}

/** Endpoints as validated at the input boundary (id optional; filled by the domain). */
export type AgentEndpointInput = z.infer<typeof agentEndpointInputSchema>;

/** Input for registering a new agent. Defaulted fields are optional. */
export type RegisteredAgentInput = z.input<typeof registeredAgentInputSchema>;

/** Input for updating the mutable fields of a registered agent. */
export type AgentUpdateInput = z.input<typeof agentUpdateInputSchema>;
