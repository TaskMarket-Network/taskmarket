import { describe, expect, it } from 'vitest';

import {
  agentCapabilitySchema,
  agentEndpointInputSchema,
  agentPricingSchema,
  agentUpdateInputSchema,
  httpUrlSchema,
  registeredAgentInputSchema,
} from './schemas.js';

describe('httpUrlSchema', () => {
  it('accepts http and https URLs', () => {
    expect(httpUrlSchema.safeParse('https://example.com/mcp').success).toBe(true);
    expect(httpUrlSchema.safeParse('http://localhost:8080/x').success).toBe(true);
  });

  it('rejects non-http(s) schemes', () => {
    expect(httpUrlSchema.safeParse('ftp://example.com/x').success).toBe(false);
    expect(httpUrlSchema.safeParse('file:///etc/passwd').success).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(httpUrlSchema.safeParse('not-a-url').success).toBe(false);
    expect(httpUrlSchema.safeParse('').success).toBe(false);
  });
});

describe('agentCapabilitySchema', () => {
  it('accepts the established capability format', () => {
    expect(agentCapabilitySchema.safeParse('agent:meta').success).toBe(true);
    expect(agentCapabilitySchema.safeParse('wallet:read').success).toBe(true);
  });

  it('rejects malformed capability keys', () => {
    expect(agentCapabilitySchema.safeParse('agent').success).toBe(false);
    expect(agentCapabilitySchema.safeParse(':meta').success).toBe(false);
    expect(agentCapabilitySchema.safeParse('agent:').success).toBe(false);
    expect(agentCapabilitySchema.safeParse('').success).toBe(false);
  });
});

describe('agentEndpointInputSchema', () => {
  it('accepts a minimal endpoint without an id', () => {
    const parsed = agentEndpointInputSchema.safeParse({
      type: 'mcp',
      url: 'https://example.com/mcp',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown endpoint type', () => {
    expect(agentEndpointInputSchema.safeParse({ type: 'grpc', url: 'https://x' }).success).toBe(
      false,
    );
  });

  it('rejects unknown fields (strict)', () => {
    expect(
      agentEndpointInputSchema.safeParse({
        type: 'http',
        url: 'https://x',
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe('agentPricingSchema', () => {
  it('accepts valid pricing metadata', () => {
    expect(agentPricingSchema.safeParse({ currency: 'BTC', minAmount: '0.001' }).success).toBe(
      true,
    );
  });

  it('rejects a negative amount', () => {
    expect(agentPricingSchema.safeParse({ currency: 'USD', minAmount: '-1' }).success).toBe(false);
  });

  it('rejects maxAmount below minAmount', () => {
    expect(
      agentPricingSchema.safeParse({ currency: 'USD', minAmount: '10', maxAmount: '5' }).success,
    ).toBe(false);
  });
});

describe('registeredAgentInputSchema', () => {
  it('accepts a complete registration input', () => {
    expect(
      registeredAgentInputSchema.safeParse({
        ownerRef: 'account-1',
        name: 'Agent',
        capabilities: ['agent:meta'],
        endpoints: [{ type: 'mcp', url: 'https://x' }],
        pricing: { currency: 'USD' },
        status: 'active',
      }).success,
    ).toBe(true);
  });

  it('defaults description, endpoints, and status', () => {
    const parsed = registeredAgentInputSchema.safeParse({
      ownerRef: 'account-1',
      name: 'Agent',
      capabilities: ['agent:meta'],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.description).toBe('');
      expect(parsed.data.endpoints).toEqual([]);
      expect(parsed.data.status).toBe('draft');
    }
  });

  it('requires at least one capability', () => {
    expect(
      registeredAgentInputSchema.safeParse({
        ownerRef: 'account-1',
        name: 'Agent',
        capabilities: [],
      }).success,
    ).toBe(false);
  });
});

describe('agentUpdateInputSchema', () => {
  it('rejects immutable fields', () => {
    expect(agentUpdateInputSchema.safeParse({ id: 'x' }).success).toBe(false);
    expect(agentUpdateInputSchema.safeParse({ ownerRef: 'x' }).success).toBe(false);
    expect(agentUpdateInputSchema.safeParse({ createdAt: '2020-01-01' }).success).toBe(false);
    expect(agentUpdateInputSchema.safeParse({ version: 2 }).success).toBe(false);
  });

  it('rejects an empty update', () => {
    expect(agentUpdateInputSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a partial update of mutable fields', () => {
    expect(agentUpdateInputSchema.safeParse({ name: 'New' }).success).toBe(true);
    expect(
      agentUpdateInputSchema.safeParse({ capabilities: ['wallet:read'], status: 'active' }).success,
    ).toBe(true);
  });
});
