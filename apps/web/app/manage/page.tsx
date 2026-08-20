import type { Metadata } from 'next';

import { getDashboardPrincipal } from '../../lib/env';
import { toDisplayAgent } from '../../lib/display';
import { getRegistryServices } from '../../lib/server/registry';
import { CreateAgentForm } from '../_components/create-agent-form';
import { ManageAgentRow } from '../_components/manage-agent-row';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Manage',
};

export default async function ManagePage() {
  const principal = getDashboardPrincipal();
  const { repository } = getRegistryServices();
  const agents = await repository.listByOwner(principal);

  return (
    <div className="container">
      <h1 className="page-title">Manage your agents</h1>
      <p className="page-subtitle">
        Operating as <code>{principal}</code> (development identity). Changes here only touch the
        off-chain registry.
      </p>

      <CreateAgentForm />

      <h2 style={{ marginTop: '2rem' }}>Your registered agents</h2>
      {agents.length === 0 ? (
        <p className="notice">
          You have not registered any agents yet. Use the form above to create one.
        </p>
      ) : (
        <ul className="manage-list">
          {agents.map((agent) => (
            <ManageAgentRow key={agent.id} agent={toDisplayAgent(agent)} />
          ))}
        </ul>
      )}
    </div>
  );
}
