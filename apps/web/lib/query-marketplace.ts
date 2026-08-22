import type { MarketplaceSearchSortBy, MarketplaceSearchSortDirection } from '@taskmarket/catalog';

import type { SearchParamValue } from './query';
import { singleParam, splitCsv } from './query';

export type { SearchParamValue } from './query';

/**
 * Parse and bound marketplace search query-string parameters into a validated
 * marketplace search query. Pure and shared by the browse page (server) and the
 * search panel (client).
 */

const SORT_BY_VALUES: readonly MarketplaceSearchSortBy[] = [
  'relevance',
  'updatedAt',
  'createdAt',
  'rating',
  'name',
];

const SORT_DIRECTION_VALUES: readonly MarketplaceSearchSortDirection[] = ['asc', 'desc'];

const AVAILABILITY_VALUES = ['available', 'limited', 'unavailable'] as const;

export interface MarketplaceQuery {
  readonly query: string;
  readonly capabilities: readonly string[];
  readonly namespaces: readonly string[];
  readonly availability: (typeof AVAILABILITY_VALUES)[number] | undefined;
  readonly pricingCurrency: string;
  readonly sortBy: MarketplaceSearchSortBy;
  readonly sortDirection: MarketplaceSearchSortDirection;
  readonly limit: number;
  readonly offset: number;
}

export function parseMarketplaceSortBy(value: SearchParamValue): MarketplaceSearchSortBy {
  const candidate = singleParam(value);
  return (SORT_BY_VALUES as readonly string[]).includes(candidate)
    ? (candidate as MarketplaceSearchSortBy)
    : 'relevance';
}

export function parseMarketplaceSortDirection(
  value: SearchParamValue,
): MarketplaceSearchSortDirection {
  const candidate = singleParam(value);
  return (SORT_DIRECTION_VALUES as readonly string[]).includes(candidate)
    ? (candidate as MarketplaceSearchSortDirection)
    : 'desc';
}

export function parseAvailability(
  value: SearchParamValue,
): (typeof AVAILABILITY_VALUES)[number] | undefined {
  const candidate = singleParam(value);
  return (AVAILABILITY_VALUES as readonly string[]).includes(candidate)
    ? (candidate as (typeof AVAILABILITY_VALUES)[number])
    : undefined;
}

function clampInt(value: SearchParamValue, min: number, max: number, fallback: number): number {
  const candidate = Number(singleParam(value));
  if (!Number.isInteger(candidate) || candidate < min || candidate > max) {
    return fallback;
  }
  return candidate;
}

export function parseMarketplaceLimit(value: SearchParamValue): number {
  return clampInt(value, 1, 100, 20);
}

export function parseMarketplaceOffset(value: SearchParamValue): number {
  return clampInt(value, 0, 10_000, 0);
}

export function toMarketplaceQuery(params: Record<string, SearchParamValue>): MarketplaceQuery {
  return {
    query: singleParam(params.q),
    capabilities: splitCsv(params.capabilities),
    namespaces: splitCsv(params.namespaces),
    availability: parseAvailability(params.availability),
    pricingCurrency: singleParam(params.pricingCurrency),
    sortBy: parseMarketplaceSortBy(params.sortBy),
    sortDirection: parseMarketplaceSortDirection(params.sortDirection),
    limit: parseMarketplaceLimit(params.limit),
    offset: parseMarketplaceOffset(params.offset),
  };
}

/** Build a marketplace browse URL that preserves filters while overriding fields. */
export function buildMarketplaceHref(
  params: Record<string, SearchParamValue>,
  overrides: Record<string, string | number | undefined> = {},
): string {
  const query = new URLSearchParams();
  const current = toMarketplaceQuery(params);
  const values: Record<string, string> = {};
  if (current.query.length > 0) {
    values.q = current.query;
  }
  if (current.capabilities.length > 0) {
    values.capabilities = current.capabilities.join(',');
  }
  if (current.namespaces.length > 0) {
    values.namespaces = current.namespaces.join(',');
  }
  if (current.availability !== undefined) {
    values.availability = current.availability;
  }
  if (current.pricingCurrency.length > 0) {
    values.pricingCurrency = current.pricingCurrency;
  }
  values.sortBy = current.sortBy;
  values.sortDirection = current.sortDirection;
  values.limit = String(current.limit);
  values.offset = String(current.offset);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete values[key];
    } else {
      values[key] = String(value);
    }
  }
  const defaults: Record<string, string> = {
    sortBy: 'relevance',
    sortDirection: 'desc',
    limit: '20',
    offset: '0',
  };
  for (const [key, value] of Object.entries(values)) {
    if (defaults[key] === value) {
      delete values[key];
    } else {
      query.set(key, value);
    }
  }
  const qs = query.toString();
  return qs.length === 0 ? '/marketplace' : `/marketplace?${qs}`;
}
