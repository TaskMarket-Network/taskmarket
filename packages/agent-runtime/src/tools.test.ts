import { describe, expect, it } from 'vitest';

import { DEFAULT_AGENT_RUNTIME_CONFIG } from './config.js';
import {
  createBaseTools,
  createCapabilitiesTool,
  createPingTool,
  createResolveTokenTool,
  createWalletBalanceTool,
  toActionDefinition,
} from './tools.js';
import type { ToolContext } from './types.js';

const ctx: ToolContext = {
  traceId: 'trace_1',
  network: 'goat-testnet',
  caller: 'test',
  now: 1_700_000_000_000,
};

describe('createPingTool', () => {
  it('returns deterministic identity metadata', async () => {
    const tool = createPingTool(DEFAULT_AGENT_RUNTIME_CONFIG);
    const output = await tool.execute({}, ctx);
    expect(output).toEqual({
      pong: true,
      agentId: 'taskmarket-reference',
      name: 'TaskMarket Reference Agent',
      version: '0.1.0',
      network: 'goat-testnet',
      timestamp: '2023-11-14T22:13:20.000Z',
    });
  });
});

describe('createCapabilitiesTool', () => {
  it('reports declared capabilities and the current tool list', async () => {
    const tool = createCapabilitiesTool(DEFAULT_AGENT_RUNTIME_CONFIG, () => [
      'agent.capabilities',
      'agent.ping',
      'wallet.balance',
    ]);
    const output = await tool.execute({}, ctx);
    expect(output).toEqual({
      agentId: 'taskmarket-reference',
      capabilities: ['agent:meta', 'wallet:read'],
      tools: ['agent.capabilities', 'agent.ping', 'wallet.balance'],
    });
  });
});

describe('createWalletBalanceTool', () => {
  it('validates EVM addresses at the trust boundary', async () => {
    const tool = createWalletBalanceTool({
      getBalance: async ({ address }) => ({ address, balance: '1' }),
    });
    const bad = tool.inputSchema.safeParse({ address: 'nope' });
    expect(bad.success).toBe(false);
    const ok = tool.inputSchema.safeParse({
      address: '0x0000000000000000000000000000000000000001',
    });
    expect(ok.success).toBe(true);
  });

  it('forwards validated input to the wallet adapter', async () => {
    const tool = createWalletBalanceTool({
      getBalance: async ({ address }) => ({ address, balance: '7' }),
    });
    const output = await tool.execute(
      { address: '0x0000000000000000000000000000000000000001' },
      ctx,
    );
    expect(output).toEqual({
      address: '0x0000000000000000000000000000000000000001',
      balance: '7',
    });
  });
});

describe('createResolveTokenTool', () => {
  it('resolves a token symbol deterministically', async () => {
    const tool = createResolveTokenTool();
    const output = (await tool.execute({ symbol: 'WGBTC' }, ctx)) as {
      symbol: string;
      address: string;
    };
    expect(output.symbol).toBe('WGBTC');
    expect(output.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('rejects empty symbols', async () => {
    const tool = createResolveTokenTool();
    expect(tool.inputSchema.safeParse({ symbol: '' }).success).toBe(false);
  });
});

describe('createBaseTools', () => {
  it('registers exactly the minimal read-only tool set', () => {
    const tools = createBaseTools(
      DEFAULT_AGENT_RUNTIME_CONFIG,
      {
        getBalance: async ({ address }) => ({ address, balance: '0' }),
      },
      () => [],
    );
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      'agent.capabilities',
      'agent.ping',
      'wallet.balance',
      'wallet.resolve_token',
    ]);
    for (const tool of tools) {
      expect(tool.riskLevel).toBe('read');
    }
  });
});

describe('toActionDefinition', () => {
  it('produces an AgentKit action bound to the allowlist', () => {
    const action = toActionDefinition(createPingTool(DEFAULT_AGENT_RUNTIME_CONFIG), [
      'goat-testnet',
    ]);
    expect(action.name).toBe('agent.ping');
    expect(action.networks).toEqual(['goat-testnet']);
    expect(action.requiresConfirmation).toBe(false);
    expect(action.zodInputSchema).toBeDefined();
  });
});
