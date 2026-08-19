import { GOAT_NETWORKS, type GoatNetwork } from '@taskmarket/agent-kit';
import { z } from 'zod';

import { AGENT_LOG_LEVELS, AgentRuntimeConfigError, type AgentLogLevel } from './errors.js';

/** A single declared agent capability key (informational metadata). */
export const AGENT_CAPABILITY_SCHEMA = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9-]*:[a-z0-9-]+$/, 'capabilities must look like "agent:meta"');

/** Normalized configuration for a TaskMarket agent runtime. */
export interface AgentRuntimeConfig {
  /** Stable identifier of the agent instance. */
  agentId: string;
  /** Human-readable agent name. */
  name: string;
  /** One-line description of the agent. */
  description: string;
  /** Agent build/semantic version reported by metadata tools and health. */
  version: string;
  /** Declared capabilities (informational metadata for discovery). */
  capabilities: string[];
  /** Network tools execute against; must be in the AgentKit allowlist. */
  defaultNetwork: GoatNetwork;
  /** Minimum log level emitted by the runtime logger. */
  logLevel: AgentLogLevel;
}

/** Partial, validated input accepted by {@link resolveAgentRuntimeConfig}. */
export interface AgentRuntimeConfigInput {
  agentId?: string;
  name?: string;
  description?: string;
  version?: string;
  capabilities?: string[];
  defaultNetwork?: GoatNetwork;
  logLevel?: AgentLogLevel;
}

export const DEFAULT_AGENT_RUNTIME_CONFIG: AgentRuntimeConfig = {
  agentId: 'taskmarket-reference',
  name: 'TaskMarket Reference Agent',
  description: 'Minimal TaskMarket agent runtime (Phase 1).',
  version: '0.1.0',
  capabilities: ['agent:meta', 'wallet:read'],
  defaultNetwork: 'goat-testnet',
  logLevel: 'info',
};

export const agentRuntimeConfigSchema = z
  .object({
    agentId: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    capabilities: z.array(AGENT_CAPABILITY_SCHEMA).min(1).optional(),
    defaultNetwork: z.enum(GOAT_NETWORKS).optional(),
    logLevel: z.enum(AGENT_LOG_LEVELS).optional(),
  })
  .strict();

/**
 * Validate a partial config and merge it with the safe defaults. Throws
 * {@link AgentRuntimeConfigError} on invalid or unsafe input.
 */
export function resolveAgentRuntimeConfig(input: AgentRuntimeConfigInput = {}): AgentRuntimeConfig {
  const parsed = agentRuntimeConfigSchema.safeParse(input);
  if (!parsed.success) {
    throw new AgentRuntimeConfigError(
      `Invalid agent runtime configuration: ${parsed.error.issues
        .map((issue) => issue.message)
        .join('; ')}`,
    );
  }

  const value = parsed.data;
  return {
    agentId: value.agentId ?? DEFAULT_AGENT_RUNTIME_CONFIG.agentId,
    name: value.name ?? DEFAULT_AGENT_RUNTIME_CONFIG.name,
    description: value.description ?? DEFAULT_AGENT_RUNTIME_CONFIG.description,
    version: value.version ?? DEFAULT_AGENT_RUNTIME_CONFIG.version,
    capabilities: value.capabilities ?? [...DEFAULT_AGENT_RUNTIME_CONFIG.capabilities],
    defaultNetwork: value.defaultNetwork ?? DEFAULT_AGENT_RUNTIME_CONFIG.defaultNetwork,
    logLevel: value.logLevel ?? DEFAULT_AGENT_RUNTIME_CONFIG.logLevel,
  };
}

/** Agent runtime environment variable names recognized by {@link loadAgentRuntimeConfig}. */
export const AGENT_RUNTIME_ENV_KEYS = [
  'AGENT_RUNTIME_AGENT_ID',
  'AGENT_RUNTIME_AGENT_NAME',
  'AGENT_RUNTIME_AGENT_DESCRIPTION',
  'AGENT_RUNTIME_AGENT_VERSION',
  'AGENT_RUNTIME_CAPABILITIES',
  'AGENT_RUNTIME_DEFAULT_NETWORK',
  'AGENT_RUNTIME_LOG_LEVEL',
] as const;

const agentRuntimeEnvSchema = z
  .object({
    AGENT_RUNTIME_AGENT_ID: z.string().min(1).optional(),
    AGENT_RUNTIME_AGENT_NAME: z.string().min(1).optional(),
    AGENT_RUNTIME_AGENT_DESCRIPTION: z.string().min(1).optional(),
    AGENT_RUNTIME_AGENT_VERSION: z.string().min(1).optional(),
    AGENT_RUNTIME_CAPABILITIES: z
      .string()
      .optional()
      .transform((value) =>
        value === undefined
          ? undefined
          : value
              .split(',')
              .map((item) => item.trim())
              .filter((item) => item.length > 0),
      )
      .pipe(z.array(AGENT_CAPABILITY_SCHEMA).min(1).optional()),
    AGENT_RUNTIME_DEFAULT_NETWORK: z.enum(GOAT_NETWORKS).optional(),
    AGENT_RUNTIME_LOG_LEVEL: z.enum(AGENT_LOG_LEVELS).optional(),
  })
  .strict();

/**
 * Load and validate agent runtime configuration from an environment record (for
 * example `process.env`). Only the documented `AGENT_RUNTIME_*` variables are
 * read; all other values use safe, testnet-oriented defaults. Throws
 * {@link AgentRuntimeConfigError} on invalid values.
 */
export function loadAgentRuntimeConfig(
  env: Record<string, string | undefined>,
): AgentRuntimeConfig {
  const picked: Record<string, string | undefined> = {};
  for (const key of AGENT_RUNTIME_ENV_KEYS) {
    if (env[key] !== undefined) {
      picked[key] = env[key];
    }
  }

  const parsed = agentRuntimeEnvSchema.safeParse(picked);
  if (!parsed.success) {
    throw new AgentRuntimeConfigError(
      `Invalid agent runtime environment: ${parsed.error.issues
        .map((issue) => issue.message)
        .join('; ')}`,
    );
  }

  const value = parsed.data;
  const input: AgentRuntimeConfigInput = {};
  if (value.AGENT_RUNTIME_AGENT_ID !== undefined) {
    input.agentId = value.AGENT_RUNTIME_AGENT_ID;
  }
  if (value.AGENT_RUNTIME_AGENT_NAME !== undefined) {
    input.name = value.AGENT_RUNTIME_AGENT_NAME;
  }
  if (value.AGENT_RUNTIME_AGENT_DESCRIPTION !== undefined) {
    input.description = value.AGENT_RUNTIME_AGENT_DESCRIPTION;
  }
  if (value.AGENT_RUNTIME_AGENT_VERSION !== undefined) {
    input.version = value.AGENT_RUNTIME_AGENT_VERSION;
  }
  if (value.AGENT_RUNTIME_CAPABILITIES !== undefined) {
    input.capabilities = value.AGENT_RUNTIME_CAPABILITIES;
  }
  if (value.AGENT_RUNTIME_DEFAULT_NETWORK !== undefined) {
    input.defaultNetwork = value.AGENT_RUNTIME_DEFAULT_NETWORK;
  }
  if (value.AGENT_RUNTIME_LOG_LEVEL !== undefined) {
    input.logLevel = value.AGENT_RUNTIME_LOG_LEVEL;
  }

  return resolveAgentRuntimeConfig(input);
}
