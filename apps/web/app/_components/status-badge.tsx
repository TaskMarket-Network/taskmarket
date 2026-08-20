import type { AgentStatus } from '@taskmarket/agent-registry';

import { statusLabel, statusTone } from '../../lib/display';

export function StatusBadge({ status }: { readonly status: AgentStatus }) {
  const tone = statusTone(status);
  return (
    <span className={`badge badge-${tone}`} title={`Registration state: ${statusLabel(status)}`}>
      {statusLabel(status)}
    </span>
  );
}
