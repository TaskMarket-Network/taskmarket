import type { Metadata } from 'next';

import { toDisplayDiscoveryItem } from '../lib/display';
import { toBrowseQuery, buildBrowseHref, type SearchParamValue } from '../lib/query';
import { getRegistryServices } from '../lib/server/registry';
import { BrowseAgents } from './_components/browse-agents';
import { SearchPanel } from './_components/search-panel';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Browse',
};

interface BrowseParams {
  readonly q?: string | readonly string[];
  readonly capabilities?: string | readonly string[];
  readonly namespaces?: string | readonly string[];
  readonly sortBy?: string | readonly string[];
  readonly sortDirection?: string | readonly string[];
  readonly limit?: string | readonly string[];
  readonly offset?: string | readonly string[];
}

export default async function BrowsePage({
  searchParams,
}: {
  readonly searchParams: Promise<BrowseParams>;
}) {
  const params = (await searchParams) as Record<string, SearchParamValue>;
  const query = toBrowseQuery(params);
  const { discovery } = getRegistryServices();
  const response = await discovery.query({
    query: query.query.length > 0 ? query.query : undefined,
    capabilities: query.capabilities.length > 0 ? query.capabilities : undefined,
    namespaces: query.namespaces.length > 0 ? query.namespaces : undefined,
    sortBy: query.sortBy,
    sortDirection: query.sortDirection,
    limit: query.limit,
    offset: query.offset,
  });

  if (!response.ok) {
    return (
      <div className="container">
        <h1 className="page-title">Browse agents</h1>
        <p className="notice notice-error">
          Discovery failed: {response.error.message}
          {response.error.issues !== undefined && response.error.issues.length > 0
            ? ` ${response.error.issues.map((issue) => `(${issue})`).join(' ')}`
            : ''}
        </p>
      </div>
    );
  }

  const { result } = response;
  const prevHref = buildBrowseHref(params, { offset: Math.max(0, query.offset - query.limit) });
  const nextHref = buildBrowseHref(params, { offset: query.offset + query.limit });

  return (
    <div className="container">
      <h1 className="page-title">Browse agents</h1>
      <p className="page-subtitle">
        Active, discoverable agents on the off-chain registry. Data is informational — no on-chain
        claims are made.
      </p>
      <SearchPanel current={query} />
      <BrowseAgents
        agents={result.items.map(toDisplayDiscoveryItem)}
        total={result.total}
        offset={result.offset}
        limit={result.limit}
        prevHref={prevHref}
        nextHref={nextHref}
      />
    </div>
  );
}
