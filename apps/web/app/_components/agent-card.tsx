import Link from 'next/link';

import { formatDate, type DisplayAgent } from '../../lib/display';
import { StatusBadge } from './status-badge';

export function AgentCard({ agent }: { readonly agent: DisplayAgent }) {
  return (
    <li className="card agent-card">
      <h2>
        <Link href={`/agents/${encodeURIComponent(agent.id)}`}>{agent.name}</Link>
      </h2>
      <p className="meta">
        <StatusBadge status={agent.status} /> · v{agent.version} · updated{' '}
        {formatDate(agent.updatedAt)}
      </p>
      <p>{agent.description}</p>
      <p aria-label="Capabilities">
        {agent.capabilities.map((capability) => (
          <span className="chip" key={capability}>
            {capability}
          </span>
        ))}
      </p>
      {agent.pricing !== null ? <p className="meta">Pricing: {agent.pricing.label}</p> : null}
    </li>
  );
}
