import { describe, expect, it } from 'vitest';

import {
  buildBrowseHref,
  parseLimit,
  parseOffset,
  parseSortBy,
  splitCsv,
  toBrowseQuery,
} from './query.js';

describe('query parameter parsing', () => {
  it('parses csv filters', () => {
    expect(splitCsv('Wallet:Read, wallet:read, agent:meta')).toEqual(['wallet:read', 'agent:meta']);
    expect(splitCsv(undefined)).toEqual([]);
    expect(splitCsv(['a:b', 'c:d'])).toEqual(['a:b', 'c:d']);
  });

  it('bounds sort, limit, and offset', () => {
    expect(parseSortBy('bogus')).toBe('relevance');
    expect(parseSortBy('name')).toBe('name');
    expect(parseLimit('1000')).toBe(20);
    expect(parseLimit('7')).toBe(7);
    expect(parseOffset('-3')).toBe(0);
    expect(parseOffset('50')).toBe(50);
  });

  it('builds a browse query from params', () => {
    const query = toBrowseQuery({
      q: 'trade',
      capabilities: 'wallet:read',
      sortBy: 'name',
      limit: '5',
    });
    expect(query).toMatchObject({
      query: 'trade',
      capabilities: ['wallet:read'],
      sortBy: 'name',
      sortDirection: 'desc',
      limit: 5,
      offset: 0,
    });
  });
});

describe('buildBrowseHref', () => {
  it('produces a stable URL for an empty query', () => {
    expect(buildBrowseHref({})).toBe('/');
  });

  it('preserves filters while overriding fields', () => {
    const params = {
      q: 'trade',
      capabilities: 'wallet:read',
      sortBy: 'name',
      offset: '20',
      limit: '10',
    };
    expect(buildBrowseHref(params)).toBe(
      '/?q=trade&capabilities=wallet%3Aread&sortBy=name&limit=10&offset=20',
    );
    expect(buildBrowseHref(params, { offset: 40 })).toBe(
      '/?q=trade&capabilities=wallet%3Aread&sortBy=name&limit=10&offset=40',
    );
    expect(buildBrowseHref(params, { q: undefined })).toBe(
      '/?capabilities=wallet%3Aread&sortBy=name&limit=10&offset=20',
    );
  });

  it('omits default sort/direction values', () => {
    expect(
      buildBrowseHref({ sortBy: 'relevance', sortDirection: 'desc', limit: '20', offset: '0' }),
    ).toBe('/');
  });
});
