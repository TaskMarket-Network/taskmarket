import { NextResponse } from 'next/server';

import { toMarketplaceQuery, type SearchParamValue } from '../../../../lib/query-marketplace';
import { getCatalogServices } from '../../../../lib/server/catalog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Public marketplace search over published listings (read-only). */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries()) as Record<string, SearchParamValue>;
  const query = toMarketplaceQuery(params);
  const { search } = getCatalogServices();
  const response = await search.search({
    query: query.query.length > 0 ? query.query : undefined,
    capabilities: query.capabilities.length > 0 ? query.capabilities : undefined,
    namespaces: query.namespaces.length > 0 ? query.namespaces : undefined,
    availability: query.availability,
    pricingCurrency: query.pricingCurrency.length > 0 ? query.pricingCurrency : undefined,
    sortBy: query.sortBy,
    sortDirection: query.sortDirection,
    limit: query.limit,
    offset: query.offset,
  });
  if (!response.ok) {
    return NextResponse.json({ ok: false, error: response.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, result: response.result });
}