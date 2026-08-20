import { describe, expect, it } from 'vitest';

import {
  buildCreateAgentInput,
  buildUpdateInput,
  parseCapabilities,
  parseEndpoints,
  parsePricing,
} from './validate.js';

const BASE_FORM = {
  name: 'Trader Agent',
  description: 'Trades tokens.',
  capabilities: 'agent:meta, wallet:read',
  endpoints: 'mcp https://example.com/trader',
  status: 'draft' as const,
  currency: 'USDC',
  minAmount: '0.01',
  maxAmount: '10',
  pricingDescription: 'per trade',
};

describe('parseCapabilities', () => {
  it('parses, lowercases, and deduplicates keys', () => {
    const { capabilities, issues } = parseCapabilities('Agent:Meta, wallet:read, wallet:READ');
    expect(capabilities).toEqual(['agent:meta', 'wallet:read']);
    expect(issues).toEqual([]);
  });

  it('reports invalid keys and skips them', () => {
    const { capabilities, issues } = parseCapabilities('wallet:read, not-a-key, 3rd:key');
    expect(capabilities).toEqual(['wallet:read']);
    expect(issues[0]).toMatch(/must look like/);
  });

  it('handles empty input', () => {
    expect(parseCapabilities('  ')).toEqual({ capabilities: [], issues: [] });
  });
});

describe('parseEndpoints', () => {
  it('defaults bare URLs to http', () => {
    const { endpoints, issues } = parseEndpoints('https://example.com/agent');
    expect(issues).toEqual([]);
    expect(endpoints).toEqual([{ type: 'http', url: 'https://example.com/agent' }]);
  });

  it('honors an explicit type and deduplicates', () => {
    const { endpoints } = parseEndpoints(
      'mcp https://example.com/a\nhttp https://example.com/a\nwebhook https://example.com/b',
    );
    expect(endpoints).toEqual([
      { type: 'mcp', url: 'https://example.com/a' },
      { type: 'webhook', url: 'https://example.com/b' },
    ]);
  });

  it('rejects non-http(s) URLs and junk', () => {
    const { endpoints, issues } = parseEndpoints('ftp://example.com/x\nnot a url');
    expect(endpoints).toEqual([]);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatch(/must use http or https/);
  });
});

describe('parsePricing', () => {
  it('returns undefined pricing when all fields are empty', () => {
    const { pricing, issues } = parsePricing({
      currency: '',
      minAmount: '',
      maxAmount: '',
      description: '',
    });
    expect(pricing).toBeUndefined();
    expect(issues).toEqual([]);
  });

  it('builds pricing from valid values', () => {
    const { pricing, issues } = parsePricing({
      currency: 'BTC',
      minAmount: '0.001',
      maxAmount: '0.01',
      description: 'per tx',
    });
    expect(issues).toEqual([]);
    expect(pricing).toEqual({
      currency: 'BTC',
      minAmount: '0.001',
      maxAmount: '0.01',
      description: 'per tx',
    });
  });

  it('rejects an inverted range', () => {
    const { pricing, issues } = parsePricing({
      currency: 'USDC',
      minAmount: '10',
      maxAmount: '1',
      description: '',
    });
    expect(pricing).toBeUndefined();
    expect(issues.join(' ')).toMatch(/greater than or equal/);
  });
});

describe('buildCreateAgentInput', () => {
  it('builds a valid input from a clean form', () => {
    const { input, issues } = buildCreateAgentInput(BASE_FORM);
    expect(issues).toEqual([]);
    expect(input).not.toBeNull();
    expect(input).toMatchObject({
      ownerRef: '',
      name: 'Trader Agent',
      capabilities: ['agent:meta', 'wallet:read'],
      endpoints: [{ type: 'mcp', url: 'https://example.com/trader' }],
      status: 'draft',
      pricing: { currency: 'USDC', minAmount: '0.01', maxAmount: '10', description: 'per trade' },
    });
  });

  it('collects validation issues instead of building', () => {
    const { input, issues } = buildCreateAgentInput({
      ...BASE_FORM,
      name: '  ',
      capabilities: 'not a key',
      minAmount: 'abc',
    });
    expect(input).toBeNull();
    expect(issues.join(' ')).toMatch(/Name is required/);
    expect(issues.join(' ')).toMatch(/must look like/);
    expect(issues.join(' ')).toMatch(/non-negative decimal/);
  });
});

describe('buildUpdateInput', () => {
  it('includes only non-empty fields', () => {
    const { update, issues } = buildUpdateInput({
      name: 'Renamed',
      description: '',
      capabilities: '',
      endpoints: '',
    });
    expect(issues).toEqual([]);
    expect(update).toEqual({ name: 'Renamed', description: '' });
  });

  it('reports invalid input instead of building', () => {
    const bad = buildUpdateInput({
      name: '',
      description: '',
      capabilities: 'nope',
      endpoints: '',
    });
    expect(bad.update).toBeNull();
    expect(bad.issues.join(' ')).toMatch(/must look like/);
  });

  it('tolerates partial edit forms at the trust boundary', () => {
    const partial = buildUpdateInput({ status: 'active' } as unknown as Parameters<
      typeof buildUpdateInput
    >[0]);
    expect(partial.issues).toEqual([]);
    expect(partial.update).toEqual({ status: 'active' });
  });

  it('tolerates a sparse create form instead of crashing', () => {
    const sparse = buildCreateAgentInput({ status: 'active' } as unknown as Parameters<
      typeof buildCreateAgentInput
    >[0]);
    expect(sparse.input).toBeNull();
    expect(sparse.issues.join(' ')).toMatch(/Name is required/);
    expect(sparse.issues.join(' ')).toMatch(/capability is required/);
  });
});
