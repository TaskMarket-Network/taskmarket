import { describe, expect, it } from 'vitest';

import {
  buildCreateListingInput,
  buildCreateOfferingInput,
  buildUpdateListingInput,
  buildUpdateOfferingInput,
  parseAvailabilityStatus,
} from './validate-catalog.js';

describe('parseAvailabilityStatus', () => {
  it('accepts known statuses and rejects others', () => {
    expect(parseAvailabilityStatus('limited')).toBe('limited');
    expect(parseAvailabilityStatus('UNKNOWN')).toBeNull();
  });
});

describe('buildCreateListingInput', () => {
  const valid = {
    agentId: 'agent-1',
    title: 'Limit order execution',
    description: 'Executes limit orders.',
    capabilities: 'trades:create, agent:meta',
    currency: 'BTC',
    amount: '0.001',
    per: 'order',
    pricingDescription: '',
    availability: 'available',
    rating: '4.5',
    completionRate: '97',
  };

  it('builds a listing input with pricing and self-reported trust', () => {
    const result = buildCreateListingInput(valid);
    expect(result.issues).toEqual([]);
    expect(result.input).toMatchObject({
      agentId: 'agent-1',
      title: 'Limit order execution',
      capabilities: ['trades:create', 'agent:meta'],
      availability: { status: 'available' },
      trust: { selfReported: true, rating: '4.5', completionRate: '97' },
    });
    expect(result.input.pricing?.[0]).toMatchObject({
      currency: 'BTC',
      amount: '0.001',
      per: 'order',
    });
  });

  it('reports issues instead of building a payload', () => {
    const result = buildCreateListingInput({ ...valid, title: '', capabilities: '' });
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe('buildUpdateListingInput', () => {
  it('builds a partial update and requires a change', () => {
    const result = buildUpdateListingInput({
      title: 'Renamed',
      description: '',
      capabilities: '',
      availability: '',
    });
    expect(result.update).toEqual({ title: 'Renamed' });
    expect(
      buildUpdateListingInput({ title: '', description: '', capabilities: '', availability: '' })
        .issues,
    ).toContain('At least one field must change.');
  });
});

describe('buildCreateOfferingInput', () => {
  const valid = {
    agentId: 'agent-1',
    name: 'Limit order execution',
    description: '',
    capabilities: 'trades:create',
    inputs: 'symbol:string\namount:number',
    outputs: 'orderId:string',
    currency: 'BTC',
    amount: '0.001',
    per: 'order',
    pricingDescription: '',
    averageMs: '500',
    maxMs: '2000',
    timeoutMs: '5000',
    maxConcurrency: '10',
    maxInputBytes: '',
  };

  it('builds an offering input with typed I/O and constraints', () => {
    const result = buildCreateOfferingInput(valid);
    expect(result.issues).toEqual([]);
    expect(result.input).toMatchObject({
      agentId: 'agent-1',
      name: 'Limit order execution',
      capabilities: ['trades:create'],
      inputs: [
        { name: 'symbol', type: 'string', required: true },
        { name: 'amount', type: 'number', required: true },
      ],
      outputs: [{ name: 'orderId', type: 'string' }],
      estimatedExecutionTime: { averageMs: 500, maxMs: 2000 },
      constraints: { timeoutMs: 5000, maxConcurrency: 10 },
    });
  });

  it('reports invalid I/O lines and timing issues', () => {
    const result = buildCreateOfferingInput({
      ...valid,
      inputs: 'bad line here',
      maxMs: '100',
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        '"bad line here" is not a valid input entry (use "name:type").',
        'Max execution time must be an integer (ms) at least the average.',
      ]),
    );
  });
});

describe('buildUpdateOfferingInput', () => {
  it('builds a partial update and requires a change', () => {
    const result = buildUpdateOfferingInput({
      name: 'Renamed',
      description: '',
      capabilities: '',
      inputs: '',
      outputs: '',
    });
    expect(result.update).toEqual({ name: 'Renamed' });
    expect(
      buildUpdateOfferingInput({
        name: '',
        description: '',
        capabilities: '',
        inputs: '',
        outputs: '',
      }).issues,
    ).toContain('At least one field must change.');
  });
});
