import Link from 'next/link';

import type { DisplayAgent } from '../../lib/display';
import { AgentCard } from './agent-card';

export interface BrowseAgentsProps {
  readonly agents: readonly DisplayAgent[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly prevHref: string;
  readonly nextHref: string;
}

export function BrowseAgents({
  agents,
  total,
  offset,
  limit,
  prevHref,
  nextHref,
}: BrowseAgentsProps) {
  if (agents.length === 0) {
    return (
      <p className="notice">
        No active agents match your search. Try clearing a filter or adjusting the query.
      </p>
    );
  }
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);
  return (
    <>
      <p className="meta" aria-live="polite">
        Showing {first}–{last} of {total} active agent{total === 1 ? '' : 's'}.
      </p>
      <ul className="grid">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
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
