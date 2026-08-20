import type { DisplayAgent } from '../../lib/display';
import { StatusBadge } from './status-badge';

export function AgentProfileView({ agent }: { readonly agent: DisplayAgent }) {
  const discoverable = agent.status === 'active';
  return (
    <article className="stack">
      <header>
        <h1 className="page-title">{agent.name}</h1>
        <div className="profile-meta">
          <StatusBadge status={agent.status} />
          <span className="meta">v{agent.version}</span>
        </div>
        {!discoverable ? (
          <p className="notice">
            This agent is <strong>not publicly discoverable</strong> (registration state:{' '}
            {agent.statusLabel}). Only <em>active</em> agents appear in browse/discovery.
          </p>
        ) : null}
        <p>{agent.description}</p>
      </header>

      <section className="card">
        <h2>Capabilities</h2>
        {agent.capabilities.length > 0 ? (
          <p aria-label="Declared capabilities">
            {agent.capabilities.map((capability) => (
              <span className="chip" key={capability}>
                {capability}
              </span>
            ))}
          </p>
        ) : (
          <p className="meta">None declared.</p>
        )}
        <p className="meta">
          Capability keys are matched as identifiers only — they are never executed here.
        </p>
      </section>

      <section className="card">
        <h2>Endpoints</h2>
        {agent.endpoints.length > 0 ? (
          <ul>
            {agent.endpoints.map((endpoint) => (
              <li key={endpoint.id}>
                <strong>{endpoint.type}</strong> —{' '}
                <a href={endpoint.url} target="_blank" rel="noopener noreferrer">
                  {endpoint.url}
                </a>{' '}
                <span className="meta">
                  (registered; reachability checking is planned, not active)
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="meta">No endpoints declared.</p>
        )}
        <p className="meta">
          Endpoint URLs are displayed for reference only; this page never fetches them.
        </p>
      </section>

      <section className="card">
        <h2>Pricing</h2>
        {agent.pricing !== null ? (
          <p>{agent.pricing.label}</p>
        ) : (
          <p className="meta">
            No pricing metadata declared. Informational only — never used for payment here.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Registration state</h2>
        <dl className="definition-list">
          <dt>Agent id</dt>
          <dd>
            <code>{agent.id}</code>
          </dd>
          <dt>Status</dt>
          <dd>{agent.statusLabel}</dd>
          <dt>Version</dt>
          <dd>{agent.version}</dd>
          <dt>Created</dt>
          <dd>{agent.createdAt}</dd>
          <dt>Last updated</dt>
          <dd>{agent.updatedAt}</dd>
        </dl>
        <p className="meta">
          Off-chain registry data only. This profile makes no on-chain identity claim.
        </p>
      </section>
    </article>
  );
}
