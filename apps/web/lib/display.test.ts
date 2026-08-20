import { createRegisteredAgent } from '@taskmarket/agent-registry';
import { describe, expect, it } from 'vitest';

import {
  formatDate,
  statusLabel,
  statusTone,
  toDisplayAgent,
  toDisplayEndpoint,
  toDisplayPricing,
} from './display.js';

const FIXED_NOW = 1_700_000_000_000;

function sampleAgent() {
  return createRegisteredAgent(
    {
      ownerRef: 'owner-1',
      name: 'Wallet Bot',
      description: 'Reads balances.',
      capabilities: ['wallet:read', 'agent:meta'],
      endpoints: [
        {
          type: 'mcp',
          url: 'https://example.com/wallet',
          metadata: { internal: 'secret', eval: 'dangerous()' },
        },
      ],
      status: 'active',
      pricing: { currency: 'USDC', minAmount: '1', maxAmount: '100', description: 'per call' },
    },
    { clock: () => FIXED_NOW, agentIdFactory: () => 'agent-1', endpointIdFactory: () => 'ep-1' },
  );
}

describe('display projections', () => {
  it('labels and tones every status', () => {
    expect(statusLabel('active')).toBe('Active');
    expect(statusTone('active')).toBe('success');
    expect(statusLabel('retired')).toBe('Retired');
    expect(statusTone('retired')).toBe('danger');
  });

  it('strips endpoint metadata entirely', () => {
    const [endpoint] = sampleAgent().endpoints;
    if (endpoint === undefined) {
      throw new Error('expected a sample endpoint');
    }
    expect(toDisplayEndpoint(endpoint)).toEqual({
      id: 'ep-1',
      type: 'mcp',
      url: 'https://example.com/wallet',
    });
  });

  it('formats pricing ranges', () => {
    expect(toDisplayPricing({ currency: 'BTC', minAmount: '0.001' }).label).toBe('BTC 0.001');
    expect(toDisplayPricing({ currency: 'USDC', minAmount: '1', maxAmount: '100' }).label).toBe(
      'USDC 1–100',
    );
    expect(
      toDisplayPricing({
        currency: 'USDC',
        minAmount: '1',
        maxAmount: '100',
        description: 'per call',
      }).label,
    ).toBe('USDC 1–100 — per call');
    expect(toDisplayPricing({ currency: 'BTC' }).label).toBe('BTC');
  });

  it('projects a full agent to a safe display shape', () => {
    const display = toDisplayAgent(sampleAgent());
    const [endpoint] = display.endpoints;
    if (endpoint === undefined) {
      throw new Error('expected a projected endpoint');
    }
    expect(display.name).toBe('Wallet Bot');
    expect(display.statusLabel).toBe('Active');
    expect(display.capabilities).toEqual(['wallet:read', 'agent:meta']);
    expect(endpoint).toEqual({ id: 'ep-1', type: 'mcp', url: 'https://example.com/wallet' });
    expect('metadata' in endpoint).toBe(false);
    expect('ownerRef' in display).toBe(false);
    expect(display.pricing?.label).toBe('USDC 1–100 — per call');
    expect(display.version).toBe(1);
  });

  it('formats dates safely', () => {
    expect(formatDate('2023-11-14T22:13:20.000Z')).toBe('Tue, 14 Nov 2023 22:13:20 GMT');
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});
