'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  buildMarketplaceHref,
  type MarketplaceQuery,
} from '../../lib/query-marketplace';

export interface MarketplaceSearchPanelProps {
  readonly current: MarketplaceQuery;
}

/** Marketplace browse/search filters. Submitting navigates with a URL the server renders. */
export function MarketplaceSearchPanel({ current }: MarketplaceSearchPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState(current.query);
  const [capabilities, setCapabilities] = useState(current.capabilities.join(', '));
  const [namespaces, setNamespaces] = useState(current.namespaces.join(', '));
  const [availability, setAvailability] = useState(current.availability ?? '');
  const [pricingCurrency, setPricingCurrency] = useState(current.pricingCurrency);
  const [sortBy, setSortBy] = useState(current.sortBy);
  const [sortDirection, setSortDirection] = useState(current.sortDirection);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const href = buildMarketplaceHref(
      {},
      {
        q: query.trim().length > 0 ? query.trim() : undefined,
        capabilities: capabilities.trim().length > 0 ? capabilities.trim() : undefined,
        namespaces: namespaces.trim().length > 0 ? namespaces.trim() : undefined,
        availability: availability.length > 0 ? availability : undefined,
        pricingCurrency: pricingCurrency.trim().length > 0 ? pricingCurrency.trim() : undefined,
        sortBy,
        sortDirection,
        offset: 0,
      },
    );
    router.push(href);
  }

  return (
    <form onSubmit={onSubmit} className="card" aria-label="Search the marketplace">
      <div className="field">
        <label htmlFor="marketplace-query">Query</label>
        <input
          id="marketplace-query"
          name="q"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search title, description, capabilities"
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label htmlFor="marketplace-capabilities">Capabilities</label>
        <input
          id="marketplace-capabilities"
          name="capabilities"
          type="text"
          value={capabilities}
          onChange={(event) => setCapabilities(event.target.value)}
          placeholder="trades:create, wallet:read"
          autoComplete="off"
        />
        <span className="hint">Comma-separated keys; listings matching any key rank higher.</span>
      </div>
      <div className="field">
        <label htmlFor="marketplace-namespaces">Namespaces</label>
        <input
          id="marketplace-namespaces"
          name="namespaces"
          type="text"
          value={namespaces}
          onChange={(event) => setNamespaces(event.target.value)}
          placeholder="wallet, storage"
          autoComplete="off"
        />
        <span className="hint">Comma-separated; filter to a capability namespace.</span>
      </div>
      <div className="field">
        <label htmlFor="marketplace-availability">Availability</label>
        <select
          id="marketplace-availability"
          name="availability"
          value={availability}
          onChange={(event) => setAvailability(event.target.value)}
        >
          <option value="">Any</option>
          <option value="available">Available</option>
          <option value="limited">Limited</option>
          <option value="unavailable">Unavailable</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="marketplace-currency">Pricing currency</label>
        <input
          id="marketplace-currency"
          name="pricingCurrency"
          type="text"
          value={pricingCurrency}
          onChange={(event) => setPricingCurrency(event.target.value)}
          placeholder="USDC"
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label htmlFor="marketplace-sortBy">Sort by</label>
        <select
          id="marketplace-sortBy"
          name="sortBy"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as MarketplaceQuery['sortBy'])}
        >
          <option value="relevance">Relevance</option>
          <option value="rating">Rating</option>
          <option value="updatedAt">Recently updated</option>
          <option value="createdAt">Recently created</option>
          <option value="name">Title</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="marketplace-sortDirection">Direction</label>
        <select
          id="marketplace-sortDirection"
          name="sortDirection"
          value={sortDirection}
          onChange={(event) =>
            setSortDirection(event.target.value as MarketplaceQuery['sortDirection'])
          }
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>
      <button className="btn btn-primary" type="submit">
        Search
      </button>
    </form>
  );
}