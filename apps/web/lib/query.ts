import type {
  CapabilityDiscoverySortBy,
  CapabilityDiscoverySortDirection,
} from '@taskmarket/agent-registry';

/**
 * Parse and bound browse/search query-string parameters into a validated
 * capability discovery query. Pure and shared by the browse page (server) and
 * the search panel (client).
 */

const SORT_BY_VALUES: readonly CapabilityDiscoverySortBy[] = [
  'relevance',
  'updatedAt',
  'createdAt',
  'name',
  'version',
];

const SORT_DIRECTION_VALUES: readonly CapabilityDiscoverySortDirection[] = ['asc', 'desc'];

export interface BrowseQuery {
  readonly query: string;
  readonly capabilities: readonly string[];
  readonly namespaces: readonly string[];
  readonly sortBy: CapabilityDiscoverySortBy;
  readonly sortDirection: CapabilityDiscoverySortDirection;
  readonly limit: number;
  readonly offset: number;
}

export type SearchParamValue = string | readonly string[] | undefined;

export function singleParam(value: SearchParamValue): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return String(value[0] ?? '');
  }
  return '';
}

/** Split a CSV query-string value into deduplicated tokens (max 50). */
export function splitCsv(value: SearchParamValue): string[] {
  const seen = new Set<string>();
  const values = Array.isArray(value) ? value : [value];
  for (const entry of values) {
    for (const token of String(entry ?? '').split(/[\s,]+/)) {
      const item = token.trim().toLowerCase();
      if (item.length > 0 && !seen.has(item)) {
        seen.add(item);
      }
    }
  }
  return [...seen].slice(0, 50);
}

export function parseSortBy(value: SearchParamValue): CapabilityDiscoverySortBy {
  const candidate = singleParam(value);
  return (SORT_BY_VALUES as readonly string[]).includes(candidate)
    ? (candidate as CapabilityDiscoverySortBy)
    : 'relevance';
}

export function parseSortDirection(value: SearchParamValue): CapabilityDiscoverySortDirection {
  const candidate = singleParam(value);
  return (SORT_DIRECTION_VALUES as readonly string[]).includes(candidate)
    ? (candidate as CapabilityDiscoverySortDirection)
    : 'desc';
}

function clampInt(value: SearchParamValue, min: number, max: number, fallback: number): number {
  const candidate = Number(singleParam(value));
  if (!Number.isInteger(candidate) || candidate < min || candidate > max) {
    return fallback;
  }
  return candidate;
}

export function parseLimit(value: SearchParamValue): number {
  return clampInt(value, 1, 100, 20);
}

export function parseOffset(value: SearchParamValue): number {
  return clampInt(value, 0, 10_000, 0);
}

export function toBrowseQuery(params: Record<string, SearchParamValue>): BrowseQuery {
  return {
    query: singleParam(params.q),
    capabilities: splitCsv(params.capabilities),
    namespaces: splitCsv(params.namespaces),
    sortBy: parseSortBy(params.sortBy),
    sortDirection: parseSortDirection(params.sortDirection),
    limit: parseLimit(params.limit),
    offset: parseOffset(params.offset),
  };
}

/** Build a browse URL that preserves current filters while overriding fields. */
export function buildBrowseHref(
  params: Record<string, SearchParamValue>,
  overrides: Record<string, string | number | undefined> = {},
): string {
  const query = new URLSearchParams();
  const current = toBrowseQuery(params);
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
  return qs.length === 0 ? '/' : `/?${qs}`;
}
