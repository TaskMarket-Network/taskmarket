import Link from 'next/link';

import {
  formatDate,
  toDisplayPricing,
  type DisplayListingSearchItem,
} from '../../lib/display-catalog';
import { AvailabilityBadge } from './catalog-badges';

export function ListingCard({ listing }: { readonly listing: DisplayListingSearchItem }) {
  const primaryPricing =
    listing.pricing.length > 0 ? listing.pricing[0] : null;
  return (
    <li className="card listing-card">
      <h2>
        <Link href={`/marketplace/listings/${encodeURIComponent(listing.id)}`}>
          {listing.title}
        </Link>
      </h2>
      <p className="meta">
        by {listing.agentName} · <AvailabilityBadge status={listing.availability.status} /> · v
        {listing.version} · updated {formatDate(listing.updatedAt)}
      </p>
      <p>{listing.description}</p>
      <p aria-label="Capabilities">
        {listing.capabilities.map((capability) => (
          <span className="chip" key={capability}>
            {capability}
          </span>
        ))}
      </p>
      {primaryPricing ? (
        <p className="meta">Pricing: {toDisplayPricing(primaryPricing!).label}</p>
      ) : null}
      {listing.trust !== null ? (
        <p className="meta">
          Self-reported: {listing.trust.rating !== undefined ? `★ ${listing.trust.rating}` : 'no rating'} ·{' '}
          {listing.trust.completionRate !== undefined
            ? `${listing.trust.completionRate}% completion`
            : 'no completion rate'}
        </p>
      ) : null}
      {listing.ranking !== undefined ? (
        <p className="meta" title={listing.ranking.explanation}>
          Match score {listing.ranking.score.toFixed(2)} · {listing.ranking.signalCount} signal
          {listing.ranking.signalCount === 1 ? '' : 's'}
        </p>
      ) : null}
    </li>
  );
}