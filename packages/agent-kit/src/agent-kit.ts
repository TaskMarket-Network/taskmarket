import {
  ExecutionRuntime,
  InMemoryIdempotencyStore,
  PolicyEngine,
  type ExecutionConfig,
  type IdempotencyStore,
  type RuntimeLogger,
  type RuntimeMetrics,
} from '@goatnetwork/agentkit/core';
import {
  NoopWalletReadAdapter,
  resolveTokenAction,
  walletBalanceAction,
  type WalletReadAdapter,
} from '@goatnetwork/agentkit/plugins';
import { ActionProvider } from '@goatnetwork/agentkit/providers';

import type { AgentKitConfig } from './config.js';
import { AgentKitInitializationError } from './errors.js';

/** The AgentKit components every TaskMarket caller needs. */
export interface AgentKitComponents {
  /** Registry of registered AgentKit actions. */
  provider: ActionProvider;
  /** Policy engine gating which networks, risks, and writes are allowed. */
  policy: PolicyEngine;
  /** Execution runtime wrapping policy, validation, idempotency, and retries. */
  runtime: ExecutionRuntime;
  /** The normalized configuration the components were built from. */
  config: AgentKitConfig;
}

export interface AgentKitInitOptions {
  /** Read adapter backing read-only wallet actions. Defaults to the AgentKit no-op adapter. */
  walletReadAdapter?: WalletReadAdapter;
  /** Idempotency store override; required when `config.idempotency.mode` is `redis`. */
  idempotencyStore?: IdempotencyStore;
  metrics?: RuntimeMetrics;
  logger?: RuntimeLogger;
}

/**
 * Create an {@link ActionProvider} with TaskMarket's base read-only wallet
 * actions registered. Write and payment actions are introduced by the phases
 * that add wallet providers, payments, and identity.
 */
export function createActionProvider(
  walletReadAdapter: WalletReadAdapter = new NoopWalletReadAdapter(),
): ActionProvider {
  const provider = new ActionProvider();
  provider.register(walletBalanceAction(walletReadAdapter));
  provider.register(resolveTokenAction());
  return provider;
}

/** Create the {@link PolicyEngine} for the given normalized configuration. */
export function createPolicyEngine(config: AgentKitConfig): PolicyEngine {
  return new PolicyEngine({
    allowedNetworks: [...config.networks],
    maxRiskWithoutConfirm: config.maxRiskWithoutConfirm,
    writeEnabled: config.writeEnabled,
  });
}

/**
 * Create the {@link ExecutionRuntime} for the given configuration and policy.
 * Fails safely when `redis` idempotency is requested without an injected
 * {@link IdempotencyStore}; distributed idempotency is wired up by the phase
 * that introduces the Redis-backed data store.
 */
export function createExecutionRuntime(
  config: AgentKitConfig,
  policy: PolicyEngine,
  options: AgentKitInitOptions = {},
): ExecutionRuntime {
  const executionConfig: Partial<ExecutionConfig> = {
    maxRetries: config.runtime.maxRetries,
    retryDelayMs: config.runtime.retryDelayMs,
    noRetryHighRiskWrites: config.runtime.noRetryHighRiskWrites,
    validateOutput: config.runtime.validateOutput,
  };

  if (config.runtime.defaultTimeoutMs !== undefined) {
    executionConfig.defaultTimeoutMs = config.runtime.defaultTimeoutMs;
  }
  if (options.logger !== undefined) {
    executionConfig.logger = options.logger;
  }
  if (options.metrics !== undefined) {
    executionConfig.metrics = options.metrics;
  }

  if (config.idempotency.mode === 'redis') {
    if (options.idempotencyStore === undefined) {
      throw new AgentKitInitializationError(
        'idempotency mode is "redis" but no idempotencyStore was provided; supply an IdempotencyStore to enable distributed idempotency.',
      );
    }
    executionConfig.idempotencyStore = options.idempotencyStore;
  } else {
    executionConfig.idempotencyStore = options.idempotencyStore ?? new InMemoryIdempotencyStore();
  }
  executionConfig.idempotencyTtlSeconds = config.idempotency.ttlSeconds;

  return new ExecutionRuntime(policy, executionConfig);
}

/**
 * Initialize the full AgentKit integration for a normalized configuration.
 * Returns the provider, policy engine, and runtime plus the config they were
 * built from.
 */
export function createAgentKit(
  config: AgentKitConfig,
  options: AgentKitInitOptions = {},
): AgentKitComponents {
  const provider = createActionProvider(options.walletReadAdapter);
  const policy = createPolicyEngine(config);
  const runtime = createExecutionRuntime(config, policy, options);
  return { provider, policy, runtime, config };
}
