import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { formatDate, toDisplayAgent, type DisplayAgent } from '../../../lib/display';
import { getRegistryServices } from '../../../lib/server/registry';
import { AgentProfileView } from '../../_components/agent-profile-view';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface AgentProfileParams {
  readonly id: string;
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<AgentProfileParams>;
}): Promise<Metadata> {
  const { id } = await params;
  const agent = await getRegistryServices().repository.getById(id);
  return { title: agent === null ? 'Agent not found' : agent.name };
}

export default async function AgentProfilePage({
  params,
}: {
  readonly params: Promise<AgentProfileParams>;
}) {
  const { id } = await params;
  const agent = await getRegistryServices().repository.getById(id);
  if (agent === null) {
    notFound();
  }
  const display: DisplayAgent = toDisplayAgent(agent);
  return (
    <div className="container">
      <AgentProfileView agent={display} />
      <p className="meta" style={{ marginTop: '1.5rem' }}>
        Registration state recorded {formatDate(display.createdAt)}; last updated{' '}
        {formatDate(display.updatedAt)}.
      </p>
    </div>
  );
}
