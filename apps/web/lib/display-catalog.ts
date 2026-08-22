import type {
  ListingAvailability,
  ListingPricing,
  ListingTrust,
  MarketplaceListing,
  MarketplaceSearchItem,
  ServiceOffering,
  ServiceInput,
  ServiceOutput,
} from '@taskmarket/catalog';

/**
 * Safe display projections for marketplace catalog data. Only whitelisted
 * fields are rendered; pricing stays informational and trust indicators stay
 * explicitly self-reported (display signals, never evidence).
 */

/** Display-ready availability of a listing. */
export interface DisplayAvailability {
  readonly status: ListingAvailability['status'];
  readonly statusLabel: string;
  readonly note?: string | undefined;
}

const AVAILABILITY_LABELS: Record<ListingAvailability['status'], string> = {
  available: 'Available',
  limited: 'Limited',
  unavailable: 'Unavailable',
};

export function availabilityLabel(status: ListingAvailability['status']): string {
  return AVAILABILITY_LABELS[status];
}

/** Self-reported trust indicators. Always labeled as self-reported. */
export interface DisplayTrust {
  readonly selfReported: true;
  readonly rating?: string | undefined;
  readonly reviews?: number | undefined;
  readonly completionRate?: string | undefined;
  readonly completedTasks?: number | undefined;
}

/** Display-ready pricing metadata (informational; never used for payment). */
export interface DisplayListingPricing {
  readonly name: string;
  readonly currency: string;
  readonly amount: string;
  readonly per?: string | undefined;
  readonly description?: string | undefined;
  readonly label: string;
}

/** Display-ready ranking of a search result (explainable). */
export interface DisplayRanking {
  readonly score: number;
  readonly explanation: string;
  readonly signalCount: number;
}

/** Display-ready search result item (safe projection). */
export interface DisplayListingSearchItem {
  readonly id: string;
  readonly agentId: string;
  readonly agentName: string;
  readonly title: string;
  readonly description: string;
  readonly capabilities: readonly string[];
  readonly pricing: readonly DisplayListingPricing[];
  readonly availability: DisplayAvailability;
  readonly trust: DisplayTrust | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly ranking: DisplayRanking;
}

/** Display-ready listing for management and detail views. */
export interface DisplayListing {
  readonly id: string;
  readonly ownerRef: string;
  readonly agentId: string;
  readonly title: string;
  readonly description: string;
  readonly capabilities: readonly string[];
  readonly pricing: readonly DisplayListingPricing[];
  readonly availability: DisplayAvailability;
  readonly trust: DisplayTrust | null;
  readonly status: MarketplaceListing['status'];
  readonly statusLabel: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Display-ready typed input/output parameter of an offering. */
export interface DisplayIoParam {
  readonly name: string;
  readonly type: string;
  readonly description?: string | undefined;
  readonly required?: boolean | undefined;
}

/** Display-ready service offering for management views. */
export interface DisplayOffering {
  readonly id: string;
  readonly ownerRef: string;
  readonly agentId: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities: readonly string[];
  readonly inputs: readonly DisplayIoParam[];
  readonly outputs: readonly DisplayIoParam[];
  readonly pricing: readonly DisplayListingPricing[];
  readonly estimatedExecutionTime: {
    readonly averageMs: number;
    readonly maxMs: number;
  };
  readonly constraints: {
    readonly timeoutMs?: number | undefined;
    readonly maxConcurrency?: number | undefined;
    readonly maxInputBytes?: number | undefined;
  };
  readonly status: ServiceOffering['status'];
  readonly statusLabel: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const LISTING_STATUS_LABELS: Record<MarketplaceListing['status'], string> = {
  draft: 'Draft',
  published: 'Published',
  paused: 'Paused',
  delisted: 'Delisted',
};

const OFFERING_STATUS_LABELS: Record<ServiceOffering['status'], string> = {
  active: 'Active',
  archived: 'Archived',
};

export function listingStatusLabel(status: MarketplaceListing['status']): string {
  return LISTING_STATUS_LABELS[status];
}

export function offeringStatusLabel(status: ServiceOffering['status']): string {
  return OFFERING_STATUS_LABELS[status];
}

export function toDisplayAvailability(availability: ListingAvailability): DisplayAvailability {
  return {
    status: availability.status,
    statusLabel: availabilityLabel(availability.status),
    note: availability.note,
  };
}

export function toDisplayTrust(trust: ListingTrust): DisplayTrust | null {
  if (!trust.selfReported) {
    return null;
  }
  return {
    selfReported: true,
    rating: trust.rating,
    reviews: trust.reviews,
    completionRate: trust.completionRate,
    completedTasks: trust.completedTasks,
  };
}

export function toDisplayPricing(pricing: ListingPricing): DisplayListingPricing {
  const per = pricing.per === undefined ? '' : ` per ${pricing.per}`;
  const suffix = pricing.description === undefined ? '' : ` — ${pricing.description}`;
  return {
    name: pricing.name,
    currency: pricing.currency,
    amount: pricing.amount,
    per: pricing.per,
    description: pricing.description,
    label: `${pricing.amount} ${pricing.currency}${per}${suffix}`,
  };
}

export function toDisplayListingSearchItem(item: MarketplaceSearchItem): DisplayListingSearchItem {
  return {
    id: item.id,
    agentId: item.agentId,
    agentName: item.agentName,
    title: item.title,
    description: item.description,
    capabilities: item.capabilities,
    pricing: item.pricing.map(toDisplayPricing),
    availability: toDisplayAvailability(item.availability),
    trust: toDisplayTrust(item.trust),
    version: item.version,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    ranking: {
      score: item.ranking.score,
      explanation: item.ranking.explanation,
      signalCount: item.ranking.signals.length,
    },
  };
}

export function toDisplayListing(listing: MarketplaceListing): DisplayListing {
  return {
    id: listing.id,
    ownerRef: listing.ownerRef,
    agentId: listing.agentId,
    title: listing.title,
    description: listing.description,
    capabilities: listing.capabilities,
    pricing: listing.pricing.map(toDisplayPricing),
    availability: toDisplayAvailability(listing.availability),
    trust: toDisplayTrust(listing.trust),
    status: listing.status,
    statusLabel: listingStatusLabel(listing.status),
    version: listing.version,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
  };
}

function toDisplayIoParam(input: ServiceInput): DisplayIoParam {
  return {
    name: input.name,
    type: input.type,
    description: input.description,
    required: input.required,
  };
}

function toDisplayOutput(output: ServiceOutput): DisplayIoParam {
  return {
    name: output.name,
    type: output.type,
    description: output.description,
  };
}

export function toDisplayOffering(offering: ServiceOffering): DisplayOffering {
  return {
    id: offering.id,
    ownerRef: offering.ownerRef,
    agentId: offering.agentId,
    name: offering.name,
    description: offering.description,
    capabilities: offering.capabilities,
    inputs: offering.inputs.map(toDisplayIoParam),
    outputs: offering.outputs.map(toDisplayOutput),
    pricing: offering.pricing.map(toDisplayPricing),
    estimatedExecutionTime: { ...offering.estimatedExecutionTime },
    constraints: { ...offering.constraints },
    status: offering.status,
    statusLabel: offeringStatusLabel(offering.status),
    version: offering.version,
    createdAt: offering.createdAt,
    updatedAt: offering.updatedAt,
  };
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toUTCString();
}

/** Format a duration in milliseconds as a compact human-readable string. */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms} ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return formatCompact(seconds, 's');
  }
  const minutes = seconds / 60;
  if (minutes < 60) {
    return formatCompact(minutes, 'min');
  }
  const hours = minutes / 60;
  return formatCompact(hours, 'h');
}

/** Format a unit value, trimming trailing zeros for whole values. */
function formatCompact(value: number, unit: string): string {
  const text =
    value >= 10 ? value.toFixed(0) : Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${text} ${unit}`;
}

/** Format a byte count as a compact human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(0)} KB`;
  }
  const megabytes = kilobytes / 1024;
  if (megabytes < 1024) {
    return `${megabytes.toFixed(0)} MB`;
  }
  return `${(megabytes / 1024).toFixed(1)} GB`;
}
