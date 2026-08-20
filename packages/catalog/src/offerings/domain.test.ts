import { describe, expect, it } from 'vitest';

import { ServiceOfferingInputError, ServiceOfferingStatusTransitionError } from './errors.js';
import {
  applyServiceOfferingUpdate,
  assertServiceOfferingStatusTransition,
  createServiceOffering,
  SERVICE_OFFERING_STATUS_TRANSITIONS,
  type OfferingDeps,
} from './domain.js';

const NOW_MS = 1_700_000_000_000;

const deps: OfferingDeps = {
  clock: () => NOW_MS,
  offeringIdFactory: () => 'offering-0001',
};

const INPUT = {
  ownerRef: 'owner-1',
  agentId: 'agent-0001',
  name: 'Limit order execution',
  description: 'Executes limit orders on GOAT.',
  capabilities: ['trades:create'],
  inputs: [{ name: 'symbol', type: 'string', required: true }],
  outputs: [{ name: 'orderId', type: 'string' }],
  pricing: [{ name: 'per order', currency: 'BTC', amount: '0.001' }],
  estimatedExecutionTime: { averageMs: 500, maxMs: 2000 },
  constraints: { timeoutMs: 5000 },
};

describe('createServiceOffering', () => {
  it('assigns id, timestamps, version 1, and the default status', () => {
    const offering = createServiceOffering(INPUT, deps);
    expect(offering).toMatchObject({
      id: 'offering-0001',
      ownerRef: 'owner-1',
      agentId: 'agent-0001',
      name: 'Limit order execution',
      status: 'active',
      version: 1,
      createdAt: new Date(NOW_MS).toISOString(),
      updatedAt: new Date(NOW_MS).toISOString(),
    });
  });

  it('copies nested collections so the caller cannot mutate the entity', () => {
    const input = { ...INPUT, inputs: [{ name: 'symbol', type: 'string', required: true }] };
    const offering = createServiceOffering(input, deps);
    expect(offering.inputs[0]?.name).toBe('symbol');
    offering.inputs[0]!.required = false;
    expect(input.inputs[0]?.required).toBe(true);
  });

  it('throws a structured error on invalid input', () => {
    expect(() => createServiceOffering({ ...INPUT, name: '' }, deps)).toThrow(
      ServiceOfferingInputError,
    );
  });
});

describe('applyServiceOfferingUpdate', () => {
  it('applies mutable-field changes and increments the version', () => {
    const offering = createServiceOffering(INPUT, deps);
    const updated = applyServiceOfferingUpdate(
      offering,
      { name: 'Renamed', constraints: { timeoutMs: 10_000 } },
      deps,
    );
    expect(updated).toMatchObject({
      id: 'offering-0001',
      name: 'Renamed',
      constraints: { timeoutMs: 10_000 },
      version: 2,
      createdAt: offering.createdAt,
    });
    expect(offering.name).toBe('Limit order execution');
  });

  it('rejects unknown fields (strict schema)', () => {
    const offering = createServiceOffering(INPUT, deps);
    expect(() =>
      applyServiceOfferingUpdate(offering, { ownerRef: 'someone-else' } as never, deps),
    ).toThrow(ServiceOfferingInputError);
  });

  it('rejects an invalid status transition', () => {
    const offering = createServiceOffering({ ...INPUT, status: 'active' }, deps);
    expect(() =>
      applyServiceOfferingUpdate(offering, { status: 'bogus' as never }, deps),
    ).toThrow();
  });
});

describe('SERVICE_OFFERING_STATUS_TRANSITIONS', () => {
  it('defines active <-> archived and nothing else', () => {
    expect(SERVICE_OFFERING_STATUS_TRANSITIONS).toEqual({
      active: ['archived'],
      archived: ['active'],
    });
  });

  it('asserts allowed transitions', () => {
    expect(() => assertServiceOfferingStatusTransition('active', 'archived')).not.toThrow();
    expect(() => assertServiceOfferingStatusTransition('active', 'active')).not.toThrow();
    expect(() => assertServiceOfferingStatusTransition('archived', 'archived')).not.toThrow();
  });

  it('rejects disallowed transitions', () => {
    expect(() => assertServiceOfferingStatusTransition('active', 'bogus' as never)).toThrow(
      ServiceOfferingStatusTransitionError,
    );
  });
});
