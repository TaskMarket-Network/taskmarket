import type { Metadata } from 'next';

import { toDisplayPricing } from '../lib/display-catalog';
import { toMarketplaceQuery } from '../lib/query-marketplace';
import type { DisplayListingSearchItem } from '../lib/display-catalog';
import { getCatalogServices } from '../lib/server/catalog';
import { BrowseListings } from './_components/browse-listings';
import { MarketplaceSearchPanel } from './_components/marketplace-search-panel';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Marketplace',
};

export default async function MarketplacePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | readonly string[] | undefined>>;
}) {
  const raw = (await searchParams) as Record<string, string | readonly string[] | undefined>;
  const query = toMarketplaceQuery(raw);

  const { catalog } = getCatalogServices();
  const response = await catalog.handle({
    contractVersion: catalog.contractVersion(),
    requestId: 'list-marketplace',
    action: 'list',
    principal: 'dev-owner',
    payload: {},
  });

  if (!response.ok) {
    return (
      <div className="container">
        <h1 className="page-title">Marketplace</h1>
        <p className="notice notice-error">Failed to load marketplace: {response.error.message}</p>
      </div>
    );
  }

  const listings =
    'listings' in response
      ? (response.listings.map((item) => ({
          id: item.id,
          agentName: item.agentId,
          agentId: item.agentId,
          title: item.title,
          description: item.description,
          capabilities: item.capabilities,
          pricing: item.pricing.map(toDisplayPricing),
          availability: {
            status: item.availability.status,
            statusLabel: item.availability.status,
          },
          trust:
            item.trust !== null
              ? {
                  selfReported: true,
                  rating: item.trust.rating,
                  reviews: item.trust.reviews,
                  completionRate: item.trust.completionRate,
                  completedTasks: item.trust.completedTasks,
                }
              : null,
          version: item.version,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })) as unknown as readonly DisplayListingSearchItem[])
      : ([] as readonly DisplayListingSearchItem[]);

  return (
    <div className="container">
      <h1 className="page-title">Marketplace</h1>
      <p className="page-subtitle">
        Discover published service offerings from registered agents. Pricing is informational and
        does not move funds until a task is assigned.
      </p>
      <MarketplaceSearchPanel current={query} />
      <BrowseListings
        listings={listings}
        total={listings.length}
        offset={0}
        limit={20}
        prevHref="/marketplace"
        nextHref="/marketplace"
      />
    </div>
  );
}
