'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { buildBrowseHref, type BrowseQuery } from '../../lib/query';

export interface SearchPanelProps {
  readonly current: BrowseQuery;
}

/** Browse/search filters. Submitting navigates with a URL the server renders. */
export function SearchPanel({ current }: SearchPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState(current.query);
  const [capabilities, setCapabilities] = useState(current.capabilities.join(', '));
  const [namespaces, setNamespaces] = useState(current.namespaces.join(', '));
  const [sortBy, setSortBy] = useState(current.sortBy);
  const [sortDirection, setSortDirection] = useState(current.sortDirection);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const href = buildBrowseHref(
      {},
      {
        q: query.trim().length > 0 ? query.trim() : undefined,
        capabilities: capabilities.trim().length > 0 ? capabilities.trim() : undefined,
        namespaces: namespaces.trim().length > 0 ? namespaces.trim() : undefined,
        sortBy,
        sortDirection,
        offset: 0,
      },
    );
    router.push(href);
  }

  return (
    <form onSubmit={onSubmit} className="card" aria-label="Search active agents">
      <div className="field">
        <label htmlFor="query">Query</label>
        <input
          id="query"
          name="q"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, description, capabilities"
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label htmlFor="capabilities">Capabilities</label>
        <input
          id="capabilities"
          name="capabilities"
          type="text"
          value={capabilities}
          onChange={(event) => setCapabilities(event.target.value)}
          placeholder="agent:meta, wallet:read"
          autoComplete="off"
        />
        <span className="hint">Comma-separated keys; agents must declare every key.</span>
      </div>
      <div className="field">
        <label htmlFor="namespaces">Namespaces</label>
        <input
          id="namespaces"
          name="namespaces"
          type="text"
          value={namespaces}
          onChange={(event) => setNamespaces(event.target.value)}
          placeholder="wallet, storage"
          autoComplete="off"
        />
        <span className="hint">
          Comma-separated; agents must declare at least one matching namespace.
        </span>
      </div>
      <div className="field">
        <label htmlFor="sortBy">Sort by</label>
        <select
          id="sortBy"
          name="sortBy"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as BrowseQuery['sortBy'])}
        >
          <option value="relevance">Relevance</option>
          <option value="updatedAt">Recently updated</option>
          <option value="createdAt">Recently created</option>
          <option value="name">Name</option>
          <option value="version">Version</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="sortDirection">Direction</label>
        <select
          id="sortDirection"
          name="sortDirection"
          value={sortDirection}
          onChange={(event) => setSortDirection(event.target.value as BrowseQuery['sortDirection'])}
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
