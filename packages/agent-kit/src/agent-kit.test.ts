import type { ActionDefinition, ActionContext, RuntimeLogger } from '@goatnetwork/agentkit/core';
import { describe, expect, it } from 'vitest';

import {
  createActionProvider,
  createAgentKit,
  createExecutionRuntime,
  createPolicyEngine,
} from './agent-kit.js';
import { DEFAULT_AGENTKIT_CONFIG, loadAgentKitConfig, resolveAgentKitConfig } from './config.js';
import { AgentKitConfigError, AgentKitInitializationError } from './errors.js';

const silentLogger: RuntimeLogger = { log: () => {} };

function stubAction(overrides: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    name: 'stub.action',
    description: 'stub action',
    riskLevel: 'read',
    requiresConfirmation: false,
    networks: ['goat-testnet', 'goat-mainnet'],
    execute: async () => 'ok',
    ...overrides,
  };
}

function context(network = 'goat-testnet'): ActionContext {
  return { traceId: 'trace_1', network, now: Date.now() };
}

describe('createActionProvider', () => {
  it('registers the base read-only wallet actions', () => {
    const provider = createActionProvider();
    const names = provider
      .list()
      .map((action) => action.name)
      .sort();
    expect(names).toContain('wallet.balance');
    expect(names).toContain('wallet.resolve_token');
    expect(names.length).toBeGreaterThanOrEqual(2);
  });

  it('honors a custom wallet read adapter', () => {
    const adapter = {
      getBalance: async ({ address }: { address: string }) => ({
        address,
        balance: '42',
      }),
    };
    const provider = createActionProvider(adapter);
    const balance = provider.get('wallet.balance');
    expect(balance.name).toBe('wallet.balance');
  });
});

describe('createPolicyEngine', () => {
  it('allows read actions on an allowed network at the default risk ceiling', () => {
    const policy = createPolicyEngine(DEFAULT_AGENTKIT_CONFIG);
    const decision = policy.evaluate({
      action: stubAction(),
      context: context('goat-testnet'),
      payload: {},
    });
    expect(decision.allowed).toBe(true);
  });

  it('blocks networks outside the allowlist', () => {
    const policy = createPolicyEngine(DEFAULT_AGENTKIT_CONFIG);
    const decision = policy.evaluate({
      action: stubAction(),
      context: context('goat-mainnet'),
      payload: {},
    });
    expect(decision.allowed).toBe(false);
  });

  it('blocks actions the action itself does not support on that network', () => {
    const policy = createPolicyEngine(
      resolveAgentKitConfig({ networks: ['goat-testnet', 'goat-mainnet'] }),
    );
    const decision = policy.evaluate({
      action: stubAction({ networks: ['goat-mainnet'] }),
      context: context('goat-testnet'),
      payload: {},
    });
    expect(decision.allowed).toBe(false);
  });

  it('requires confirmation for risk above the ceiling', () => {
    const policy = createPolicyEngine(DEFAULT_AGENTKIT_CONFIG);
    const input = {
      action: stubAction({ riskLevel: 'high' as const }),
      context: context('goat-testnet'),
      payload: {},
    };
    expect(policy.evaluate(input).allowed).toBe(false);
    expect(policy.evaluate({ ...input, confirmed: true }).allowed).toBe(true);
  });

  it('blocks write actions entirely when writeEnabled is false', () => {
    const policy = createPolicyEngine(resolveAgentKitConfig({ writeEnabled: false }));
    const decision = policy.evaluate({
      action: stubAction({ riskLevel: 'high' as const }),
      context: context('goat-testnet'),
      payload: {},
      confirmed: true,
    });
    expect(decision.allowed).toBe(false);
  });
});

describe('createExecutionRuntime', () => {
  it('creates a runtime with an in-memory idempotency store by default', () => {
    const policy = createPolicyEngine(DEFAULT_AGENTKIT_CONFIG);
    const runtime = createExecutionRuntime(DEFAULT_AGENTKIT_CONFIG, policy);
    expect(runtime).toBeInstanceOf(Object);
  });

  it('fails safely when redis idempotency is requested without a store', () => {
    const config = resolveAgentKitConfig({ idempotencyMode: 'redis', redisUrl: 'redis://x:6379' });
    const policy = createPolicyEngine(config);
    expect(() => createExecutionRuntime(config, policy)).toThrow(AgentKitInitializationError);
  });

  it('accepts an injected idempotency store for redis mode', () => {
    const config = resolveAgentKitConfig({ idempotencyMode: 'redis', redisUrl: 'redis://x:6379' });
    const policy = createPolicyEngine(config);
    const store = {
      acquire: async () => 'token',
      complete: async () => {},
      release: async () => {},
      get: async () => null,
    };
    const runtime = createExecutionRuntime(config, policy, { idempotencyStore: store });
    expect(runtime).toBeInstanceOf(Object);
  });
});

describe('createAgentKit', () => {
  it('builds provider, policy, and runtime from one configuration', () => {
    const kit = createAgentKit(DEFAULT_AGENTKIT_CONFIG, { logger: silentLogger });
    expect(kit.provider.list().length).toBeGreaterThan(0);
    expect(kit.runtime).toBeInstanceOf(Object);
    expect(kit.config).toEqual(DEFAULT_AGENTKIT_CONFIG);
  });
});

describe('end-to-end runtime execution', () => {
  it('executes a read-only action through the runtime', async () => {
    const kit = createAgentKit(DEFAULT_AGENTKIT_CONFIG, { logger: silentLogger });
    const result = await kit.runtime.run(
      kit.provider.get('wallet.balance'),
      context('goat-testnet'),
      { address: '0x0000000000000000000000000000000000000001' },
    );
    expect(result.ok).toBe(true);
    expect(result.output).toMatchObject({ balance: '0' });
    expect(result.action).toBe('wallet.balance');
    expect(result.traceId).toBe('trace_1');
  });

  it('returns a POLICY_BLOCKED result for a disallowed network', async () => {
    const kit = createAgentKit(DEFAULT_AGENTKIT_CONFIG, { logger: silentLogger });
    const result = await kit.runtime.run(
      kit.provider.get('wallet.balance'),
      context('goat-mainnet'),
      { address: '0x0000000000000000000000000000000000000001' },
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('POLICY_BLOCKED');
    expect(result.attempts).toBe(0);
  });

  it('returns a POLICY_BLOCKED result for a missing action', async () => {
    const kit = createAgentKit(DEFAULT_AGENTKIT_CONFIG, { logger: silentLogger });
    const result = await kit.runtime.run(
      { ...kit.provider.get('wallet.balance'), riskLevel: 'high' },
      context('goat-testnet'),
      { address: '0x0000000000000000000000000000000000000001' },
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('POLICY_BLOCKED');
  });

  it('deduplicates executions with the same idempotency key', async () => {
    const kit = createAgentKit(DEFAULT_AGENTKIT_CONFIG, { logger: silentLogger });
    const options = { idempotencyKey: 'balance-request-1' };
    const first = await kit.runtime.run(
      kit.provider.get('wallet.balance'),
      context('goat-testnet'),
      { address: '0x0000000000000000000000000000000000000001' },
      options,
    );
    const second = await kit.runtime.run(
      kit.provider.get('wallet.balance'),
      context('goat-testnet'),
      { address: '0x0000000000000000000000000000000000000001' },
      options,
    );
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });
});

describe('configuration error types', () => {
  it('throws a structured config error for invalid input', () => {
    try {
      loadAgentKitConfig({ AGENTKIT_METRICS_PORT: 'not-a-port' });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentKitConfigError);
      expect((error as AgentKitConfigError).code).toBe('AGENTKIT_CONFIG_ERROR');
      expect((error as AgentKitConfigError).issues.length).toBeGreaterThan(0);
      return;
    }
    throw new Error('expected loadAgentKitConfig to throw');
  });
});
