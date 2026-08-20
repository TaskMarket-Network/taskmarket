import { describe, expect, it } from 'vitest';

import {
  estimatedExecutionTimeSchema,
  serviceConstraintsSchema,
  serviceInputSchema,
  serviceOfferingInputSchema,
  serviceOfferingUpdateSchema,
} from './schemas.js';

const VALID_INPUT = {
  ownerRef: 'owner-1',
  agentId: 'agent-0001',
  name: 'Limit order execution',
  description: 'Executes limit orders on GOAT.',
  capabilities: ['trades:create'],
  inputs: [{ name: 'symbol', type: 'string', required: true }],
  outputs: [{ name: 'orderId', type: 'string' }],
  pricing: [{ name: 'per order', currency: 'BTC', amount: '0.001' }],
  estimatedExecutionTime: { averageMs: 500, maxMs: 2000 },
  constraints: { timeoutMs: 5000, maxConcurrency: 10 },
};

describe('serviceOfferingInputSchema', () => {
  it('accepts a well-formed offering input', () => {
    expect(serviceOfferingInputSchema.safeParse(VALID_INPUT).success).toBe(true);
  });

  it('defaults description, capabilities, inputs, outputs, pricing, and status', () => {
    const parsed = serviceOfferingInputSchema.parse({
      ownerRef: 'owner-1',
      agentId: 'agent-0001',
      name: 'Ping',
      estimatedExecutionTime: { averageMs: 0, maxMs: 1000 },
    });
    expect(parsed.description).toBe('');
    expect(parsed.capabilities).toEqual([]);
    expect(parsed.inputs).toEqual([]);
    expect(parsed.outputs).toEqual([]);
    expect(parsed.pricing).toEqual([]);
    expect(parsed.status).toBe('active');
  });

  it('rejects unknown/immutable fields (strict)', () => {
    const result = serviceOfferingInputSchema.safeParse({ ...VALID_INPUT, version: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects maxMs smaller than averageMs', () => {
    const result = serviceOfferingInputSchema.safeParse({
      ...VALID_INPUT,
      estimatedExecutionTime: { averageMs: 5000, maxMs: 100 },
    });
    expect(result.success).toBe(false);
  });
});

describe('serviceOfferingUpdateSchema', () => {
  it('requires at least one mutable field', () => {
    expect(serviceOfferingUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a single mutable-field change', () => {
    expect(serviceOfferingUpdateSchema.safeParse({ name: 'New name' }).success).toBe(true);
  });
});

describe('estimatedExecutionTimeSchema', () => {
  it('rejects negative and excessively large values', () => {
    expect(estimatedExecutionTimeSchema.safeParse({ averageMs: -1, maxMs: 100 }).success).toBe(
      false,
    );
    expect(
      estimatedExecutionTimeSchema.safeParse({
        averageMs: 0,
        maxMs: 8 * 24 * 60 * 60 * 1000,
      }).success,
    ).toBe(false);
  });
});

describe('serviceConstraintsSchema', () => {
  it('accepts an empty constraints object', () => {
    expect(serviceConstraintsSchema.safeParse({}).success).toBe(true);
  });

  it('rejects non-positive concurrency', () => {
    expect(serviceConstraintsSchema.safeParse({ maxConcurrency: 0 }).success).toBe(false);
  });
});

describe('serviceInputSchema', () => {
  it('defaults required to false', () => {
    expect(serviceInputSchema.parse({ name: 'x', type: 'string' }).required).toBe(false);
  });
});
