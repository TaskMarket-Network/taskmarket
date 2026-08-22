import { listingStatusLabel, offeringStatusLabel } from '../../lib/display-catalog';

export function ListingStatusBadge({ status }: { readonly status: string }) {
  const tone = status === 'published' ? 'success' : status === 'paused' ? 'warn' : 'neutral';
  return (
    <span
      className={`badge badge-${tone}`}
      title={`Listing state: ${listingStatusLabel(status as never)}`}
    >
      {listingStatusLabel(status as never)}
    </span>
  );
}

export function OfferingStatusBadge({ status }: { readonly status: string }) {
  const tone = status === 'active' ? 'success' : 'neutral';
  return (
    <span
      className={`badge badge-${tone}`}
      title={`Offering state: ${offeringStatusLabel(status as never)}`}
    >
      {offeringStatusLabel(status as never)}
    </span>
  );
}

export function AvailabilityBadge({ status }: { readonly status: string }) {
  const tone = status === 'available' ? 'success' : status === 'limited' ? 'warn' : 'neutral';
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`badge badge-${tone}`} title={`Availability: ${label}`}>
      {label}
    </span>
  );
}
