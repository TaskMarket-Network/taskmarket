import { describe, expect, it } from 'vitest';

import {
  buildMarketplaceHref,
  parseMarketplaceLimit,
  parseMarketplaceOffset,
  parseMarketplaceSortBy,
  parseAvailability,
  toMarketplaceQuery,
} from './query-marketplace.js';

describe('marketplace query parameter parsing', () => {
  it('bounds sort, limit, and offset', () => {
    expect(parseMarketplaceSortBy('bogus')).toBe('relevance');
    expect(parseMarketplaceSortBy('rating')).toBe('rating');
    expect(parseMarketplaceLimit('1000')).toBe(20);
    expect(parseMarketplaceLimit('7')).toBe(7);
    expect(parseMarketplaceOffset('-3')).toBe(0);
    expect(parseMarketplaceOffset('50')).toBe(50);
  });

  it('parses availability only for known values', () => {
    expect(parseAvailability('limited')).toBe('limited');
    expect(parseAvailability('bogus')).toBeUndefined();
    expect(parseAvailability(undefined)).toBeUndefined();
  });

  it('builds a marketplace query from params', () => {
    const query = toMarketplaceQuery({
      q: 'trade',
      capabilities: 'trades:create',
      namespaces: 'wallet',
      availability: 'limited',
      pricingCurrency: 'BTC',
      sortBy: 'rating',
      limit: '5',
    });
    expect(query).toMatchObject({
      query: 'trade',
      capabilities: ['trades:create'],
      namespaces: ['wallet'],
      availability: 'limited',
      pricingCurrency: 'BTC',
      sortBy: 'rating',
      sortDirection: 'desc',
      limit: 5,
      offset: 0,
    });
  });
});

describe('buildMarketplaceHref', () => {
  it('produces a stable URL for an empty query', () => {
    expect(buildMarketplaceHref({})).toBe('/marketplace');
  });

  it('preserves filters while overriding fields', () => {
    const params = {
      q: 'trade',
      capabilities: 'trades:create',
      sortBy: 'rating',
      offset: '20',
      limit: '10',
    };
    expect(buildMarketplaceHref(params)).toBe(
      '/marketplace?q=trade&capabilities=trades%3Acreate&sortBy=rating&limit=10&offset=20',
    );
    expect(buildMarketplaceHref(params, { offset: 40 })).toBe(
      '/marketplace?q=trade&capabilities=trades%3Acreate&sortBy=rating&limit=10&offset=40',
    );
    expect(buildMarketplaceHref(params, { q: undefined })).toBe(
      '/marketplace?capabilities=trades%3Acreate&sortBy=rating&limit=10&offset=20',
    );
  });

  it('omits default sort/direction values', () => {
    expect(
      buildMarketplaceHref({ sortBy: 'relevance', sortDirection: 'desc', limit: '20', offset: '0' }),
    ).toBe('/marketplace');
  });
});