import Link from 'next/link';

import type { DisplayListingSearchItem } from '../../lib/display-catalog';
import { ListingCard } from './listing-card';

export interface BrowseListingsProps {
  readonly listings: readonly DisplayListingSearchItem[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly prevHref: string;
  readonly nextHref: string;
}

export function BrowseListings({
  listings,
  total,
  offset,
  limit,
  prevHref,
  nextHref,
}: BrowseListingsProps) {
  if (listings.length === 0) {
    return (
      <p className="notice">
        No published listings match your search. Try clearing a filter or adjusting the query.
      </p>
    );
  }
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);
  return (
    <>
      <p className="meta" aria-live="polite">
        Showing {first}–{last} of {total} published listing{total === 1 ? '' : 's'}.
      </p>
      <ul className="grid">
        {listings.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </ul>
      <nav className="pagination" aria-label="Pagination">
        {offset > 0 ? (
          <Link className="btn" href={prevHref}>
            Previous
          </Link>
        ) : (
          <span className="btn" aria-disabled="true">
            Previous
          </span>
        )}
        {last < total ? (
          <Link className="btn" href={nextHref}>
            Next
          </Link>
        ) : (
          <span className="btn" aria-disabled="true">
            Next
          </span>
        )}
      </nav>
    </>
  );
}