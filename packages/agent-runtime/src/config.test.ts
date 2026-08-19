import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AGENT_RUNTIME_CONFIG,
  loadAgentRuntimeConfig,
  resolveAgentRuntimeConfig,
} from './config.js';
import { AgentRuntimeConfigError } from './errors.js';

describe('resolveAgentRuntimeConfig', () => {
  it('returns safe defaults when given no input', () => {
    const config = resolveAgentRuntimeConfig();
    expect(config.agentId).toBe('taskmarket-reference');
    expect(config.defaultNetwork).toBe('goat-testnet');
    expect(config.logLevel).toBe('info');
    expect(config.capabilities).toEqual(['agent:meta', 'wallet:read']);
  });

  it('merges provided overrides with the defaults', () => {
    const config = resolveAgentRuntimeConfig({
      agentId: 'ref-002',
      name: 'Probe Agent',
      description: 'A probe agent.',
      version: '0.2.0',
      capabilities: ['agent:meta', 'wallet:read', 'custom:probe'],
      defaultNetwork: 'goat-mainnet',
      logLevel: 'debug',
    });
    expect(config.agentId).toBe('ref-002');
    expect(config.name).toBe('Probe Agent');
    expect(config.description).toBe('A probe agent.');
    expect(config.version).toBe('0.2.0');
    expect(config.capabilities).toContain('custom:probe');
    expect(config.defaultNetwork).toBe('goat-mainnet');
    expect(config.logLevel).toBe('debug');
  });

  it('rejects an empty agent id', () => {
    expect(() => resolveAgentRuntimeConfig({ agentId: '' })).toThrow(AgentRuntimeConfigError);
  });

  it('rejects malformed capability keys', () => {
    expect(() => resolveAgentRuntimeConfig({ capabilities: ['Not A Capability'] })).toThrow(
      AgentRuntimeConfigError,
    );
    expect(() => resolveAgentRuntimeConfig({ capabilities: [] })).toThrow(AgentRuntimeConfigError);
  });

  it('rejects an unknown network', () => {
    expect(() => resolveAgentRuntimeConfig({ defaultNetwork: 'ethereum' as never })).toThrow(
      AgentRuntimeConfigError,
    );
  });

  it('rejects an unknown log level', () => {
    expect(() => resolveAgentRuntimeConfig({ logLevel: 'trace' as never })).toThrow(
      AgentRuntimeConfigError,
    );
  });

  it('rejects unknown config keys', () => {
    expect(() => resolveAgentRuntimeConfig({ surprises: true } as never)).toThrow(
      AgentRuntimeConfigError,
    );
  });
});

describe('loadAgentRuntimeConfig', () => {
  it('uses defaults when no AGENT_RUNTIME_* variables are present', () => {
    expect(loadAgentRuntimeConfig({})).toEqual(DEFAULT_AGENT_RUNTIME_CONFIG);
  });

  it('parses the documented environment variables', () => {
    const config = loadAgentRuntimeConfig({
      AGENT_RUNTIME_AGENT_ID: 'ref-003',
      AGENT_RUNTIME_AGENT_NAME: 'Env Agent',
      AGENT_RUNTIME_AGENT_DESCRIPTION: 'From the environment.',
      AGENT_RUNTIME_AGENT_VERSION: '1.0.0',
      AGENT_RUNTIME_CAPABILITIES: 'agent:meta,wallet:read,custom:x',
      AGENT_RUNTIME_DEFAULT_NETWORK: 'goat-testnet',
      AGENT_RUNTIME_LOG_LEVEL: 'warn',
    });
    expect(config.agentId).toBe('ref-003');
    expect(config.name).toBe('Env Agent');
    expect(config.description).toBe('From the environment.');
    expect(config.version).toBe('1.0.0');
    expect(config.capabilities).toEqual(['agent:meta', 'wallet:read', 'custom:x']);
    expect(config.defaultNetwork).toBe('goat-testnet');
    expect(config.logLevel).toBe('warn');
  });

  it('ignores unrelated environment variables', () => {
    const config = loadAgentRuntimeConfig({
      PATH: '/usr/bin',
      AGENTKIT_IDEMPOTENCY_MODE: 'redis',
    });
    expect(config).toEqual(DEFAULT_AGENT_RUNTIME_CONFIG);
  });

  it('rejects an invalid network value', () => {
    expect(() => loadAgentRuntimeConfig({ AGENT_RUNTIME_DEFAULT_NETWORK: 'bogus' })).toThrow(
      AgentRuntimeConfigError,
    );
  });

  it('rejects an invalid capabilities list', () => {
    expect(() =>
      loadAgentRuntimeConfig({ AGENT_RUNTIME_CAPABILITIES: 'agent:meta,bogus,thing' }),
    ).toThrow(AgentRuntimeConfigError);
  });

  it('rejects an invalid log level', () => {
    expect(() => loadAgentRuntimeConfig({ AGENT_RUNTIME_LOG_LEVEL: 'loud' })).toThrow(
      AgentRuntimeConfigError,
    );
  });
});
