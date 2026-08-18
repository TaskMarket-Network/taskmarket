import { z } from 'zod';

import { AgentKitConfigError } from './errors.js';

/** GOAT Network logical network keys supported by AgentKit. */
export const GOAT_NETWORKS = ['goat-testnet', 'goat-mainnet'] as const;
export type GoatNetwork = (typeof GOAT_NETWORKS)[number];

/** AgentKit action risk levels, ordered read < low < medium < high. */
export const RISK_LEVELS = ['read', 'low', 'medium', 'high'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** AgentKit idempotency store backends. */
export const IDEMPOTENCY_MODES = ['memory', 'redis'] as const;
export type IdempotencyMode = (typeof IDEMPOTENCY_MODES)[number];

/** Verified RPC endpoints from the official GOAT Network documentation. */
export const GOAT_NETWORK_RPC_URLS = {
  'goat-testnet': 'https://rpc.testnet3.goat.network',
  'goat-mainnet': 'https://rpc.goat.network',
} as const satisfies Record<GoatNetwork, string>;

export const DEFAULT_AGENTKIT_METRICS_PORT = 9464;
export const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 3600;

/**
 * Normalized AgentKit configuration for TaskMarket. Domain code never depends
 * on AgentKit directly; it consumes this shape through the helpers in
 * `agent-kit.ts`.
 */
export interface AgentKitConfig {
  /** Networks the policy engine allows. Defaults to testnet only. */
  networks: GoatNetwork[];
  /** Highest risk level an action may have without explicit confirmation. */
  maxRiskWithoutConfirm: RiskLevel;
  /** Whether non-read (write) actions are permitted at all. */
  writeEnabled: boolean;
  idempotency: {
    mode: IdempotencyMode;
    /** Required when `mode` is `redis`. */
    redisUrl?: string;
    ttlSeconds: number;
  };
  metrics: {
    /** Prometheus metrics port exposed by AgentKit. */
    port: number;
  };
  runtime: {
    maxRetries: number;
    retryDelayMs: number;
    defaultTimeoutMs?: number;
    noRetryHighRiskWrites: boolean;
    validateOutput: boolean;
  };
}

/** Partial, validated input accepted by {@link resolveAgentKitConfig}. */
export interface AgentKitConfigInput {
  networks?: GoatNetwork[];
  maxRiskWithoutConfirm?: RiskLevel;
  writeEnabled?: boolean;
  idempotencyMode?: IdempotencyMode;
  redisUrl?: string;
  idempotencyTtlSeconds?: number;
  metricsPort?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  defaultTimeoutMs?: number;
  noRetryHighRiskWrites?: boolean;
  validateOutput?: boolean;
}

export const agentKitConfigInputSchema = z
  .object({
    networks: z.array(z.enum(GOAT_NETWORKS)).min(1).optional(),
    maxRiskWithoutConfirm: z.enum(RISK_LEVELS).optional(),
    writeEnabled: z.boolean().optional(),
    idempotencyMode: z.enum(IDEMPOTENCY_MODES).optional(),
    redisUrl: z.string().min(1).optional(),
    idempotencyTtlSeconds: z.number().int().positive().optional(),
    metricsPort: z.number().int().min(1).max(65535).optional(),
    maxRetries: z.number().int().nonnegative().optional(),
    retryDelayMs: z.number().nonnegative().optional(),
    defaultTimeoutMs: z.number().int().positive().optional(),
    noRetryHighRiskWrites: z.boolean().optional(),
    validateOutput: z.boolean().optional(),
  })
  .strict();

export const DEFAULT_AGENTKIT_CONFIG: AgentKitConfig = {
  networks: ['goat-testnet'],
  maxRiskWithoutConfirm: 'low',
  writeEnabled: true,
  idempotency: {
    mode: 'memory',
    ttlSeconds: DEFAULT_IDEMPOTENCY_TTL_SECONDS,
  },
  metrics: {
    port: DEFAULT_AGENTKIT_METRICS_PORT,
  },
  runtime: {
    maxRetries: 2,
    retryDelayMs: 200,
    noRetryHighRiskWrites: true,
    validateOutput: true,
  },
};

/**
 * Validate a partial config against the schema and merge it with safe,
 * testnet-oriented defaults. Throws {@link AgentKitConfigError} on invalid or
 * unsafe input.
 */
export function resolveAgentKitConfig(input: AgentKitConfigInput = {}): AgentKitConfig {
  const parsed = agentKitConfigInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AgentKitConfigError(parsed.error.issues);
  }

  const value = parsed.data;
  const idempotencyMode = value.idempotencyMode ?? DEFAULT_AGENTKIT_CONFIG.idempotency.mode;

  if (idempotencyMode === 'redis' && value.redisUrl === undefined) {
    throw new AgentKitConfigError([
      {
        code: 'custom',
        path: ['redisUrl'],
        message: 'redisUrl is required when idempotencyMode is "redis".',
      },
    ]);
  }

  return {
    networks: value.networks ?? [...DEFAULT_AGENTKIT_CONFIG.networks],
    maxRiskWithoutConfirm:
      value.maxRiskWithoutConfirm ?? DEFAULT_AGENTKIT_CONFIG.maxRiskWithoutConfirm,
    writeEnabled: value.writeEnabled ?? DEFAULT_AGENTKIT_CONFIG.writeEnabled,
    idempotency: {
      mode: idempotencyMode,
      ...(value.redisUrl !== undefined ? { redisUrl: value.redisUrl } : {}),
      ttlSeconds: value.idempotencyTtlSeconds ?? DEFAULT_AGENTKIT_CONFIG.idempotency.ttlSeconds,
    },
    metrics: {
      port: value.metricsPort ?? DEFAULT_AGENTKIT_CONFIG.metrics.port,
    },
    runtime: {
      maxRetries: value.maxRetries ?? DEFAULT_AGENTKIT_CONFIG.runtime.maxRetries,
      retryDelayMs: value.retryDelayMs ?? DEFAULT_AGENTKIT_CONFIG.runtime.retryDelayMs,
      ...(value.defaultTimeoutMs !== undefined ? { defaultTimeoutMs: value.defaultTimeoutMs } : {}),
      noRetryHighRiskWrites:
        value.noRetryHighRiskWrites ?? DEFAULT_AGENTKIT_CONFIG.runtime.noRetryHighRiskWrites,
      validateOutput: value.validateOutput ?? DEFAULT_AGENTKIT_CONFIG.runtime.validateOutput,
    },
  };
}

/** AgentKit environment variable names recognized by {@link loadAgentKitConfig}. */
export const AGENTKIT_ENV_KEYS = [
  'AGENTKIT_IDEMPOTENCY_MODE',
  'AGENTKIT_REDIS_URL',
  'AGENTKIT_METRICS_PORT',
  'AGENTKIT_NETWORKS',
  'AGENTKIT_MAX_RISK_WITHOUT_CONFIRM',
  'AGENTKIT_WRITE_ENABLED',
  'AGENTKIT_RUNTIME_MAX_RETRIES',
  'AGENTKIT_RUNTIME_RETRY_DELAY_MS',
  'AGENTKIT_RUNTIME_DEFAULT_TIMEOUT_MS',
] as const;

const agentKitEnvSchema = z
  .object({
    AGENTKIT_IDEMPOTENCY_MODE: z.enum(IDEMPOTENCY_MODES).optional(),
    AGENTKIT_REDIS_URL: z.string().min(1).optional(),
    AGENTKIT_METRICS_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    AGENTKIT_NETWORKS: z
      .string()
      .optional()
      .transform((value) =>
        value === undefined ? undefined : value.split(',').map((name) => name.trim()),
      )
      .pipe(z.array(z.enum(GOAT_NETWORKS)).min(1).optional()),
    AGENTKIT_MAX_RISK_WITHOUT_CONFIRM: z.enum(RISK_LEVELS).optional(),
    AGENTKIT_WRITE_ENABLED: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === 'true')),
    AGENTKIT_RUNTIME_MAX_RETRIES: z.coerce.number().int().nonnegative().optional(),
    AGENTKIT_RUNTIME_RETRY_DELAY_MS: z.coerce.number().nonnegative().optional(),
    AGENTKIT_RUNTIME_DEFAULT_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  })
  .strict();

/**
 * Load and validate AgentKit configuration from an environment record (for
 * example `process.env`). Only the documented `AGENTKIT_*` variables are read;
 * all other values use safe, testnet-oriented defaults. Throws
 * {@link AgentKitConfigError} on invalid or unsafe values.
 */
export function loadAgentKitConfig(env: Record<string, string | undefined>): AgentKitConfig {
  const picked: Record<string, string | undefined> = {};
  for (const key of AGENTKIT_ENV_KEYS) {
    if (env[key] !== undefined) {
      picked[key] = env[key];
    }
  }

  const parsed = agentKitEnvSchema.safeParse(picked);
  if (!parsed.success) {
    throw new AgentKitConfigError(parsed.error.issues);
  }

  const value = parsed.data;
  const input: AgentKitConfigInput = {};
  if (value.AGENTKIT_IDEMPOTENCY_MODE !== undefined) {
    input.idempotencyMode = value.AGENTKIT_IDEMPOTENCY_MODE;
  }
  if (value.AGENTKIT_REDIS_URL !== undefined) {
    input.redisUrl = value.AGENTKIT_REDIS_URL;
  }
  if (value.AGENTKIT_METRICS_PORT !== undefined) {
    input.metricsPort = value.AGENTKIT_METRICS_PORT;
  }
  if (value.AGENTKIT_NETWORKS !== undefined) {
    input.networks = value.AGENTKIT_NETWORKS;
  }
  if (value.AGENTKIT_MAX_RISK_WITHOUT_CONFIRM !== undefined) {
    input.maxRiskWithoutConfirm = value.AGENTKIT_MAX_RISK_WITHOUT_CONFIRM;
  }
  if (value.AGENTKIT_WRITE_ENABLED !== undefined) {
    input.writeEnabled = value.AGENTKIT_WRITE_ENABLED;
  }
  if (value.AGENTKIT_RUNTIME_MAX_RETRIES !== undefined) {
    input.maxRetries = value.AGENTKIT_RUNTIME_MAX_RETRIES;
  }
  if (value.AGENTKIT_RUNTIME_RETRY_DELAY_MS !== undefined) {
    input.retryDelayMs = value.AGENTKIT_RUNTIME_RETRY_DELAY_MS;
  }
  if (value.AGENTKIT_RUNTIME_DEFAULT_TIMEOUT_MS !== undefined) {
    input.defaultTimeoutMs = value.AGENTKIT_RUNTIME_DEFAULT_TIMEOUT_MS;
  }

  return resolveAgentKitConfig(input);
}
