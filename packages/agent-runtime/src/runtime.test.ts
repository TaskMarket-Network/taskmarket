import { describe, expect, it } from 'vitest';

import { DEFAULT_AGENT_RUNTIME_CONFIG, resolveAgentRuntimeConfig } from './config.js';
import { AGENT_RUNTIME_TOOL_ERROR_CODES, AgentRuntimeConfigError } from './errors.js';
import { createStructuredLogger, type StructuredLogEntry } from './observability.js';
import { createAgentRuntime, type AgentRuntime, type AgentRuntimeDeps } from './runtime.js';

const FIXED_NOW = 1_700_000_000_000;

function runtime(deps: AgentRuntimeDeps = {}): {
  agent: AgentRuntime;
  logs: StructuredLogEntry[];
} {
  const logs: StructuredLogEntry[] = [];
  const logger = createStructuredLogger({
    sink: (entry) => logs.push(entry),
    now: () => FIXED_NOW,
  });
  const agent = createAgentRuntime(DEFAULT_AGENT_RUNTIME_CONFIG, {
    clock: () => FIXED_NOW,
    requestIdFactory: () => 'req-0001',
    logger,
    ...deps,
  });
  return { agent, logs };
}

describe('createAgentRuntime', () => {
  it('builds a provider, runtime, and tool registry', () => {
    const { agent } = runtime();
    expect(agent.config.agentId).toBe('taskmarket-reference');
    expect(agent.components.provider.list().length).toBe(4);
    expect(agent.tools.length).toBe(4);
  });

  it('refuses a default network outside the AgentKit allowlist', () => {
    expect(() =>
      createAgentRuntime(resolveAgentRuntimeConfig({ defaultNetwork: 'goat-mainnet' }), {
        agentKitConfig: { networks: ['goat-testnet'] },
      }),
    ).toThrow(AgentRuntimeConfigError);
  });
});

describe('runTool — success paths', () => {
  it('runs agent.ping deterministically', async () => {
    const { agent } = runtime();
    const result = await agent.runTool('agent.ping', {});
    expect(result.ok).toBe(true);
    expect(result.tool).toBe('agent.ping');
    expect(result.requestId).toBe('req-0001');
    expect(result.traceId).toBe('tmr_req-0001');
    expect(result.attempts).toBe(1);
    expect(result.timestamp).toBe('2023-11-14T22:13:20.000Z');
    expect(result.output).toMatchObject({
      pong: true,
      agentId: 'taskmarket-reference',
      network: 'goat-testnet',
    });
  });

  it('runs agent.capabilities with the registered tool list', async () => {
    const { agent } = runtime();
    const result = await agent.runTool('agent.capabilities', {});
    expect(result.ok).toBe(true);
    expect(result.output).toMatchObject({
      capabilities: ['agent:meta', 'wallet:read'],
      tools: ['agent.capabilities', 'agent.ping', 'wallet.balance', 'wallet.resolve_token'],
    });
  });

  it('runs wallet.balance read-only against the no-op adapter', async () => {
    const { agent } = runtime();
    const result = await agent.runTool('wallet.balance', {
      address: '0x0000000000000000000000000000000000000001',
    });
    expect(result.ok).toBe(true);
    expect(result.output).toEqual({
      address: '0x0000000000000000000000000000000000000001',
      balance: '0',
    });
  });

  it('runs wallet.resolve_token deterministically', async () => {
    const { agent } = runtime();
    const result = await agent.runTool('wallet.resolve_token', { symbol: 'WGBTC' });
    expect(result.ok).toBe(true);
    expect(result.output).toMatchObject({ symbol: 'WGBTC' });
  });

  it('records success metrics and logs', async () => {
    const { agent, logs } = runtime();
    await agent.runTool('agent.ping', {});
    const snapshot = agent.metricsSnapshot();
    expect(snapshot.counters['agent.tool_run|status=ok,tool=agent.ping']).toBe(1);
    expect(snapshot.histograms['agent.tool_latency_ms|tool=agent.ping']).toMatchObject({
      count: 1,
      sum: 0,
      min: 0,
      max: 0,
    });
    expect(logs.some((entry) => entry.message.includes('agent.ping succeeded'))).toBe(true);
  });
});

describe('runTool — failure paths', () => {
  it('returns TOOL_NOT_FOUND for an unknown tool', async () => {
    const { agent } = runtime();
    const result = await agent.runTool('nope.missing', {});
    expect(result.ok).toBe(false);
    expect(result.error).toMatchObject({
      code: AGENT_RUNTIME_TOOL_ERROR_CODES.TOOL_NOT_FOUND,
    });
  });

  it('returns INPUT_INVALID for malformed input', async () => {
    const { agent } = runtime();
    const result = await agent.runTool('wallet.balance', { address: 'not-an-address' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatchObject({
      code: AGENT_RUNTIME_TOOL_ERROR_CODES.INPUT_INVALID,
    });
  });

  it('returns POLICY_BLOCKED for a disallowed network context', async () => {
    const { agent } = runtime({
      agentKitConfig: { networks: ['goat-testnet', 'goat-mainnet'] },
    });
    const result = await agent.runTool('wallet.balance', {
      address: '0x0000000000000000000000000000000000000001',
    });
    expect(result.ok).toBe(true);
  });

  it('records failure metrics and warning logs', async () => {
    const { agent, logs } = runtime();
    await agent.runTool('wallet.balance', { address: 'bad' });
    const snapshot = agent.metricsSnapshot();
    expect(snapshot.counters['agent.tool_run|status=error,tool=wallet.balance']).toBe(1);
    expect(logs.some((entry) => entry.level === 'warn')).toBe(true);
  });
});

describe('runTool — idempotency and caller', () => {
  it('deduplicates executions with the same idempotency key', async () => {
    const { agent } = runtime();
    const options = { idempotencyKey: 'ping-1' };
    const first = await agent.runTool('agent.ping', {}, options);
    const second = await agent.runTool('agent.ping', {}, options);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });

  it('records the caller identity in the tool context', async () => {
    const { agent } = runtime();
    const result = await agent.runTool('agent.ping', {}, { caller: 'buyer-42' });
    expect(result.ok).toBe(true);
  });
});

describe('health and capabilities', () => {
  it('reports a healthy agent with identity and tools', () => {
    const { agent } = runtime();
    const health = agent.health();
    expect(health.ok).toBe(true);
    expect(health.agentId).toBe('taskmarket-reference');
    expect(health.version).toBe('0.1.0');
    expect(health.network).toBe('goat-testnet');
    expect(health.tools).toEqual([
      'agent.capabilities',
      'agent.ping',
      'wallet.balance',
      'wallet.resolve_token',
    ]);
    expect(health.checkedAt).toBe('2023-11-14T22:13:20.000Z');
  });

  it('lists the capability keys provided by registered tools', () => {
    const { agent } = runtime();
    expect(agent.listCapabilities()).toEqual(['agent:meta', 'wallet:read']);
  });
});
