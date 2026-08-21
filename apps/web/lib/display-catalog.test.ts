import { describe, expect, it } from 'vitest';

import {
  availabilityLabel,
  formatBytes,
  formatDuration,
  toDisplayAvailability,
  toDisplayListing,
  toDisplayListingSearchItem,
  toDisplayOffering,
  toDisplayPricing,
  toDisplayTrust,
} from './display-catalog.js';

describe('display-catalog projections', () => {
  it('labels availability', () => {
    expect(availabilityLabel('available')).toBe('Available');
    expect(availabilityLabel('limited')).toBe('Limited');
  });

  it('formats durations and byte counts', () => {
    expect(formatDuration(500)).toBe('500 ms');
    expect(formatDuration(1500)).toBe('1.5 s');
    expect(formatDuration(90_000)).toBe('1.5 min');
    expect(formatDuration(7_200_000)).toBe('2 h');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5_242_880)).toBe('5 MB');
  });

  it('labels pricing with amount, currency, per, and description', () => {
    expect(
      toDisplayPricing({ name: 'per order', currency: 'BTC', amount: '0.001', per: 'order' }),
    ).toMatchObject({ label: '0.001 BTC per order' });
    expect(
      toDisplayPricing({
        name: 'flat',
        currency: 'USDC',
        amount: '10',
        description: 'per task',
      }),
    ).toMatchObject({ label: '10 USDC — per task' });
  });

  it('keeps trust indicators self-reported', () => {
    expect(
      toDisplayTrust({ selfReported: true, rating: '4.5', completionRate: '97' }),
    ).toMatchObject({ selfReported: true, rating: '4.5', completionRate: '97' });
  });

  it('projects a search item with an explainable ranking', () => {
    const item = {
      id: 'listing-1',
      agentId: 'agent-1',
      agentName: 'Trade Bot',
      title: 'Limit order execution',
      description: 'Executes limit orders on GOAT.',
      capabilities: ['trades:create'],
      pricing: [{ name: 'per order', currency: 'BTC', amount: '0.001' }],
      availability: { status: 'available' } as const,
      trust: { selfReported: true, rating: '4.5' } as const,
      status: 'published' as const,
      version: 1,
      createdAt: '2023-01-01T00:00:00.000Z',
      updatedAt: '2023-01-02T00:00:00.000Z',
      ranking: {
        score: 5.7,
        signals: [
          { name: 'freshness', value: 1, weight: 1, contribution: 1 },
        ],
        explanation: 'score 5.70: ...',
      },
    };
    const display = toDisplayListingSearchItem(item);
    expect(display).toMatchObject({
      id: 'listing-1',
      agentName: 'Trade Bot',
      availability: { statusLabel: 'Available' },
      trust: { rating: '4.5' },
      ranking: { score: 5.7, signalCount: 1 },
    });
  });

  it('projects a listing and an offering', () => {
    const listing = {
      id: 'listing-1',
      ownerRef: 'owner-1',
      agentId: 'agent-1',
      title: 'T',
      description: '',
      capabilities: ['trades:create'],
      pricing: [],
      availability: { status: 'available' } as const,
      trust: { selfReported: true } as const,
      status: 'published' as const,
      version: 2,
      createdAt: '2023-01-01T00:00:00.000Z',
      updatedAt: '2023-01-02T00:00:00.000Z',
    };
    const displayListing = toDisplayListing(listing);
    expect(displayListing.statusLabel).toBe('Published');
    expect(displayListing.availability.statusLabel).toBe('Available');

    const offering = {
      id: 'offering-1',
      ownerRef: 'owner-1',
      agentId: 'agent-1',
      name: 'Limit order execution',
      description: '',
      capabilities: ['trades:create'],
      inputs: [{ name: 'symbol', type: 'string', required: true }],
      outputs: [{ name: 'orderId', type: 'string' }],
      pricing: [],
      estimatedExecutionTime: { averageMs: 500, maxMs: 2000 },
      constraints: { timeoutMs: 5000 },
      status: 'active' as const,
      version: 1,
      createdAt: '2023-01-01T00:00:00.000Z',
      updatedAt: '2023-01-01T00:00:00.000Z',
    };
    const displayOffering = toDisplayOffering(offering);
    expect(displayOffering.statusLabel).toBe('Active');
    expect(displayOffering.inputs[0]).toMatchObject({ name: 'symbol', type: 'string' });
  });

  it('projects availability including the note', () => {
    expect(
      toDisplayAvailability({ status: 'limited', note: 'Peak hours only' }),
    ).toMatchObject({ status: 'limited', statusLabel: 'Limited', note: 'Peak hours only' });
  });
});