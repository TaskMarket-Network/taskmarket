import { describe, expect, it } from 'vitest';

import {
  listingPricingSchema,
  listingTrustSchema,
  marketplaceListingInputSchema,
  marketplaceListingUpdateSchema,
} from './schemas.js';

const VALID_INPUT = {
  ownerRef: 'owner-1',
  agentId: 'agent-0001',
  title: 'Limit order execution',
  capabilities: ['agent:meta', 'trades:create'],
};

describe('marketplaceListingInputSchema', () => {
  it('accepts a valid input with defaults applied', () => {
    const parsed = marketplaceListingInputSchema.safeParse(VALID_INPUT);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe('draft');
      expect(parsed.data.description).toBe('');
      expect(parsed.data.pricing).toEqual([]);
      expect(parsed.data.availability).toEqual({ status: 'available' });
      expect(parsed.data.trust).toEqual({ selfReported: true });
    }
  });

  it('rejects an empty title and missing capabilities', () => {
    const result = marketplaceListingInputSchema.safeParse({
      ...VALID_INPUT,
      title: '',
      capabilities: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects capability keys that do not look like "agent:meta"', () => {
    const result = marketplaceListingInputSchema.safeParse({
      ...VALID_INPUT,
      capabilities: ['bad key', 'UPPER:Case'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 50 capabilities', () => {
    const result = marketplaceListingInputSchema.safeParse({
      ...VALID_INPUT,
      capabilities: Array.from({ length: 51 }, (_, index) => `ns:cap${index}`),
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown (strict) fields', () => {
    const result = marketplaceListingInputSchema.safeParse({ ...VALID_INPUT, ownerRefX: 'x' });
    expect(result.success).toBe(false);
  });
});

describe('listingPricingSchema', () => {
  it('accepts a valid pricing model', () => {
    const parsed = listingPricingSchema.safeParse({
      name: 'per task',
      currency: 'USDC',
      amount: '0.01',
      per: 'task',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a negative or malformed amount', () => {
    expect(
      listingPricingSchema.safeParse({ name: 'x', currency: 'USDC', amount: '-1' }).success,
    ).toBe(false);
    expect(
      listingPricingSchema.safeParse({ name: 'x', currency: 'USDC', amount: '1e3' }).success,
    ).toBe(false);
  });
});

describe('listingTrustSchema', () => {
  it('requires the selfReported marker', () => {
    expect(listingTrustSchema.safeParse({ rating: '4.5' }).success).toBe(false);
    expect(listingTrustSchema.safeParse({ selfReported: true, rating: '4.5' }).success).toBe(true);
  });

  it('bounds rating to 0-5 and completionRate to 0-100', () => {
    expect(listingTrustSchema.safeParse({ selfReported: true, rating: '6' }).success).toBe(false);
    expect(
      listingTrustSchema.safeParse({ selfReported: true, completionRate: '101' }).success,
    ).toBe(false);
  });
});

describe('marketplaceListingUpdateSchema', () => {
  it('accepts a partial update', () => {
    const parsed = marketplaceListingUpdateSchema.safeParse({ title: 'Renamed' });
    expect(parsed.success).toBe(true);
  });

  it('rejects an empty update', () => {
    expect(marketplaceListingUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('rejects immutable fields via strict mode', () => {
    const result = marketplaceListingUpdateSchema.safeParse({ ownerRef: 'other' });
    expect(result.success).toBe(false);
  });
});
