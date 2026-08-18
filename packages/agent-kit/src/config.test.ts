import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AGENTKIT_CONFIG,
  GOAT_NETWORK_RPC_URLS,
  loadAgentKitConfig,
  resolveAgentKitConfig,
  type AgentKitConfig,
} from './config.js';
import { AgentKitConfigError } from './errors.js';

describe('resolveAgentKitConfig', () => {
  it('returns safe testnet-oriented defaults when given no input', () => {
    const config = resolveAgentKitConfig();
    expect(config.networks).toEqual(['goat-testnet']);
    expect(config.maxRiskWithoutConfirm).toBe('low');
    expect(config.writeEnabled).toBe(true);
    expect(config.idempotency).toEqual({ mode: 'memory', ttlSeconds: 3600 });
    expect(config.metrics).toEqual({ port: 9464 });
    expect(config.runtime).toMatchObject({ maxRetries: 2, retryDelayMs: 200 });
  });

  it('merges provided overrides with the defaults', () => {
    const config = resolveAgentKitConfig({
      networks: ['goat-testnet', 'goat-mainnet'],
      maxRiskWithoutConfirm: 'medium',
      writeEnabled: false,
      metricsPort: 9999,
      maxRetries: 0,
      retryDelayMs: 50,
    });
    expect(config.networks).toEqual(['goat-testnet', 'goat-mainnet']);
    expect(config.maxRiskWithoutConfirm).toBe('medium');
    expect(config.writeEnabled).toBe(false);
    expect(config.metrics.port).toBe(9999);
    expect(config.runtime.maxRetries).toBe(0);
    expect(config.runtime.retryDelayMs).toBe(50);
    expect(config.idempotency.mode).toBe('memory');
  });

  it('accepts redis idempotency mode when a redis URL is provided', () => {
    const config = resolveAgentKitConfig({
      idempotencyMode: 'redis',
      redisUrl: 'redis://localhost:6379',
    });
    expect(config.idempotency.mode).toBe('redis');
    expect(config.idempotency.redisUrl).toBe('redis://localhost:6379');
  });

  it('rejects redis idempotency mode without a redis URL', () => {
    expect(() => resolveAgentKitConfig({ idempotencyMode: 'redis' })).toThrow(AgentKitConfigError);
  });

  it('rejects an empty networks array', () => {
    expect(() => resolveAgentKitConfig({ networks: [] })).toThrow(AgentKitConfigError);
  });

  it('rejects an unknown network name', () => {
    expect(() =>
      resolveAgentKitConfig({ networks: ['goat-testnet', 'ethereum'] as never[] }),
    ).toThrow(AgentKitConfigError);
  });

  it('rejects an unknown risk level', () => {
    expect(() => resolveAgentKitConfig({ maxRiskWithoutConfirm: 'extreme' as never })).toThrow(
      AgentKitConfigError,
    );
  });

  it('rejects an invalid metrics port', () => {
    expect(() => resolveAgentKitConfig({ metricsPort: 0 })).toThrow(AgentKitConfigError);
    expect(() => resolveAgentKitConfig({ metricsPort: 70000 })).toThrow(AgentKitConfigError);
  });

  it('rejects unknown config keys', () => {
    expect(() => resolveAgentKitConfig({ surprises: true } as never)).toThrow(AgentKitConfigError);
  });
});

describe('loadAgentKitConfig', () => {
  it('uses defaults when no AGENTKIT_* variables are present', () => {
    expect(loadAgentKitConfig({})).toEqual(DEFAULT_AGENTKIT_CONFIG);
  });

  it('parses the documented AgentKit environment variables', () => {
    const config = loadAgentKitConfig({
      AGENTKIT_IDEMPOTENCY_MODE: 'redis',
      AGENTKIT_REDIS_URL: 'redis://redis.example.internal:6379',
      AGENTKIT_METRICS_PORT: '9000',
      AGENTKIT_NETWORKS: 'goat-testnet,goat-mainnet',
      AGENTKIT_MAX_RISK_WITHOUT_CONFIRM: 'medium',
      AGENTKIT_WRITE_ENABLED: 'false',
      AGENTKIT_RUNTIME_MAX_RETRIES: '3',
      AGENTKIT_RUNTIME_RETRY_DELAY_MS: '100',
      AGENTKIT_RUNTIME_DEFAULT_TIMEOUT_MS: '30000',
    });
    expect(config.idempotency).toMatchObject({
      mode: 'redis',
      redisUrl: 'redis://redis.example.internal:6379',
    });
    expect(config.metrics.port).toBe(9000);
    expect(config.networks).toEqual(['goat-testnet', 'goat-mainnet']);
    expect(config.maxRiskWithoutConfirm).toBe('medium');
    expect(config.writeEnabled).toBe(false);
    expect(config.runtime).toMatchObject({
      maxRetries: 3,
      retryDelayMs: 100,
      defaultTimeoutMs: 30000,
    });
  });

  it('ignores unrelated environment variables', () => {
    const config = loadAgentKitConfig({
      PATH: '/usr/bin',
      NODE_ENV: 'test',
      GOAT_TESTNET_RPC_URL: 'https://rpc.testnet3.goat.network',
    });
    expect(config).toEqual(DEFAULT_AGENTKIT_CONFIG);
  });

  it('rejects an invalid idempotency mode', () => {
    expect(() => loadAgentKitConfig({ AGENTKIT_IDEMPOTENCY_MODE: 'file' })).toThrow(
      AgentKitConfigError,
    );
  });

  it('rejects an invalid metrics port value', () => {
    expect(() => loadAgentKitConfig({ AGENTKIT_METRICS_PORT: 'not-a-port' })).toThrow(
      AgentKitConfigError,
    );
  });

  it('rejects an invalid network list', () => {
    expect(() => loadAgentKitConfig({ AGENTKIT_NETWORKS: 'goat-testnet,bogus' })).toThrow(
      AgentKitConfigError,
    );
  });

  it('rejects redis mode without a redis URL', () => {
    expect(() => loadAgentKitConfig({ AGENTKIT_IDEMPOTENCY_MODE: 'redis' })).toThrow(
      AgentKitConfigError,
    );
  });

  it('rejects an invalid WRITE_ENABLED value', () => {
    expect(() => loadAgentKitConfig({ AGENTKIT_WRITE_ENABLED: 'yes' })).toThrow(
      AgentKitConfigError,
    );
  });
});

describe('verified network facts', () => {
  it('uses the official GOAT RPC endpoints', () => {
    expect(GOAT_NETWORK_RPC_URLS['goat-testnet']).toBe('https://rpc.testnet3.goat.network');
    expect(GOAT_NETWORK_RPC_URLS['goat-mainnet']).toBe('https://rpc.goat.network');
  });

  it('defaults to the testnet only', () => {
    const config: AgentKitConfig = DEFAULT_AGENTKIT_CONFIG;
    expect(config.networks).toEqual(['goat-testnet']);
  });
});
