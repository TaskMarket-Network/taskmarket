import { capabilityNamespace } from '@taskmarket/agent-registry';

import type { MarketplaceListing } from '../types.js';
import type {
  MarketplaceSearchQuery,
  MarketplaceSearchRanking,
  MarketplaceSearchSignal,
} from './types.js';

/**
 * Fixed, documented ranking weights. They are deterministic and stable, and
 * deliberately small for self-reported signals: price is excluded from the
 * score entirely (it is a self-set metadata value), and the self-reported
 * rating/completion contribute at most 0.4 of a maximum possible score of
 * ~8.9 (≈4.5%), so reputation claims can influence ordering only slightly.
 */
export const MARKETPLACE_SEARCH_WEIGHTS = {
  capabilityRelevance: 4.0,
  namespaceRelevance: 2.0,
  textRelevance: 1.0,
  freshness: 1.0,
  pricingCompleteness: 0.5,
  selfReportedRating: 0.2,
  selfReportedCompletion: 0.2,
} as const;

/** Freshness decays to zero over this window (90 days). */
export const MARKETPLACE_SEARCH_FRESHNESS_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const signal = (
  name: string,
  value: number,
  weight: number,
  note?: string,
): MarketplaceSearchSignal => ({
  name,
  value: clamp(value, 0, 1),
  weight,
  contribution: clamp(value, 0, 1) * weight,
  ...(note === undefined ? {} : { note }),
});

const has = (value: string | undefined): value is string => value !== undefined && value.length > 0;

/** Fraction of the requested capability keys the listing offers (0..1). */
function capabilityRelevanceValue(
  listing: MarketplaceListing,
  query: MarketplaceSearchQuery,
): number {
  const requested = query.capabilities ?? [];
  if (requested.length === 0) {
    return 0;
  }
  const offered = new Set(listing.capabilities);
  const matched = requested.filter((key) => offered.has(key)).length;
  return matched / requested.length;
}

/** Fraction of the requested namespaces the listing offers (0..1). */
function namespaceRelevanceValue(
  listing: MarketplaceListing,
  query: MarketplaceSearchQuery,
): number {
  const requested = query.namespaces ?? [];
  if (requested.length === 0) {
    return 0;
  }
  const offered = new Set(
    listing.capabilities
      .map((key) => capabilityNamespace(key))
      .filter((namespace): namespace is string => namespace !== null),
  );
  const matched = requested.filter((key) => offered.has(key)).length;
  return matched / requested.length;
}

/** 1 when the free-text query matches the listing, else 0. */
function textRelevanceValue(
  listing: MarketplaceListing,
  agentName: string,
  query: MarketplaceSearchQuery,
): number {
  const needle = query.query ?? '';
  if (!has(needle)) {
    return 0;
  }
  const haystack = [listing.title, listing.description, agentName, ...listing.capabilities]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle.toLowerCase()) ? 1 : 0;
}

/** Recency of `updatedAt` relative to `now`, decaying over the freshness window. */
function freshnessValue(listing: MarketplaceListing, nowMs: number): number {
  const updatedMs = Date.parse(listing.updatedAt);
  if (Number.isNaN(updatedMs)) {
    return 0;
  }
  const age = Math.max(0, nowMs - updatedMs);
  return clamp(1 - age / MARKETPLACE_SEARCH_FRESHNESS_WINDOW_MS, 0, 1);
}

/** Self-reported rating normalized to 0..1, or 0 when absent. */
function ratingValue(listing: MarketplaceListing): number {
  const rating = listing.trust.rating;
  if (rating === undefined) {
    return 0;
  }
  const parsed = Number(rating);
  return Number.isFinite(parsed) ? clamp(parsed / 5, 0, 1) : 0;
}

/** Self-reported completion rate normalized to 0..1, or 0 when absent. */
function completionValue(listing: MarketplaceListing): number {
  const completionRate = listing.trust.completionRate;
  if (completionRate === undefined) {
    return 0;
  }
  const parsed = Number(completionRate);
  return Number.isFinite(parsed) ? clamp(parsed / 100, 0, 1) : 0;
}

/**
 * Compute the explainable ranking for one listing. Pure and deterministic for
 * a fixed `now`; every contributing signal is listed with its value, weight,
 * and contribution, and the explanation is a readable account of the result.
 *
 * Trust stance: price is never part of the score; self-reported rating and
 * completion rate carry small fixed weights and are labeled as such.
 */
export function scoreListing(
  listing: MarketplaceListing,
  agentName: string,
  query: MarketplaceSearchQuery,
  now: string,
): MarketplaceSearchRanking {
  const nowMs = Date.parse(now);
  const signals: MarketplaceSearchSignal[] = [];

  const capValue = capabilityRelevanceValue(listing, query);
  if ((query.capabilities ?? []).length > 0) {
    signals.push(
      signal('capabilityRelevance', capValue, MARKETPLACE_SEARCH_WEIGHTS.capabilityRelevance),
    );
  }

  const nsValue = namespaceRelevanceValue(listing, query);
  if ((query.namespaces ?? []).length > 0) {
    signals.push(
      signal('namespaceRelevance', nsValue, MARKETPLACE_SEARCH_WEIGHTS.namespaceRelevance),
    );
  }

  if (has(query.query)) {
    signals.push(
      signal(
        'textRelevance',
        textRelevanceValue(listing, agentName, query),
        MARKETPLACE_SEARCH_WEIGHTS.textRelevance,
      ),
    );
  }

  signals.push(
    signal('freshness', freshnessValue(listing, nowMs), MARKETPLACE_SEARCH_WEIGHTS.freshness),
    signal(
      'pricingCompleteness',
      listing.pricing.length > 0 ? 1 : 0,
      MARKETPLACE_SEARCH_WEIGHTS.pricingCompleteness,
    ),
  );

  if (listing.trust.rating !== undefined) {
    signals.push(
      signal(
        'selfReportedRating',
        ratingValue(listing),
        MARKETPLACE_SEARCH_WEIGHTS.selfReportedRating,
        'self-reported; down-weighted',
      ),
    );
  }
  if (listing.trust.completionRate !== undefined) {
    signals.push(
      signal(
        'selfReportedCompletion',
        completionValue(listing),
        MARKETPLACE_SEARCH_WEIGHTS.selfReportedCompletion,
        'self-reported; down-weighted',
      ),
    );
  }

  const score = signals.reduce((total, current) => total + current.contribution, 0);

  const parts = signals.map((current) => {
    const base = `${current.name} ${current.value.toFixed(2)}x${current.weight.toFixed(2)}=${current.contribution.toFixed(2)}`;
    return current.note === undefined ? base : `${base} (${current.note})`;
  });
  parts.push('price excluded from ranking (self-set)');
  const explanation = `score ${score.toFixed(2)}: ${parts.join('; ')}.`;

  return { score, signals, explanation };
}
