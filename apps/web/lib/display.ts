import type {
  AgentEndpoint,
  AgentPricing,
  AgentStatus,
  CapabilityDiscoveryItem,
  RegisteredAgent,
} from '@taskmarket/agent-registry';

/** Safe projection of an endpoint: arbitrary metadata is never rendered. */
export interface DisplayEndpoint {
  readonly id: string;
  readonly type: AgentEndpoint['type'];
  readonly url: string;
}

/** Display-ready pricing metadata (informational; never used for payment). */
export interface DisplayPricing {
  readonly currency: string;
  readonly minAmount?: string | undefined;
  readonly maxAmount?: string | undefined;
  readonly description?: string | undefined;
  readonly label: string;
}

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

/** Display-ready projection of a registered agent (whitelist of safe fields). */
export interface DisplayAgent {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities: string[];
  readonly endpoints: DisplayEndpoint[];
  readonly status: AgentStatus;
  readonly statusLabel: string;
  readonly statusTone: StatusTone;
  readonly pricing: DisplayPricing | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const STATUS_META: Record<AgentStatus, { readonly label: string; readonly tone: StatusTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  active: { label: 'Active', tone: 'success' },
  suspended: { label: 'Suspended', tone: 'warning' },
  retired: { label: 'Retired', tone: 'danger' },
};

export function statusLabel(status: AgentStatus): string {
  return STATUS_META[status].label;
}

export function statusTone(status: AgentStatus): StatusTone {
  return STATUS_META[status].tone;
}

/** Endpoint projection: id/type/url only; `metadata` is deliberately stripped. */
export function toDisplayEndpoint(endpoint: AgentEndpoint): DisplayEndpoint {
  return { id: endpoint.id, type: endpoint.type, url: endpoint.url };
}

export function toDisplayPricing(pricing: AgentPricing): DisplayPricing {
  const amounts = [pricing.minAmount, pricing.maxAmount].filter((value) => value !== undefined);
  const range = amounts.length > 0 ? `${pricing.currency} ${amounts.join('–')}` : pricing.currency;
  return {
    currency: pricing.currency,
    minAmount: pricing.minAmount,
    maxAmount: pricing.maxAmount,
    description: pricing.description,
    label: pricing.description ? `${range} — ${pricing.description}` : range,
  };
}

export function toDisplayAgent(agent: RegisteredAgent): DisplayAgent {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    capabilities: agent.capabilities,
    endpoints: agent.endpoints.map(toDisplayEndpoint),
    status: agent.status,
    statusLabel: statusLabel(agent.status),
    statusTone: statusTone(agent.status),
    pricing: agent.pricing === undefined ? null : toDisplayPricing(agent.pricing),
    version: agent.version,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

/** Project a discovery item (already a safe projection) to the display shape. */
export function toDisplayDiscoveryItem(item: CapabilityDiscoveryItem): DisplayAgent {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    capabilities: item.capabilities,
    endpoints: item.endpoints.map((endpoint) => ({
      id: endpoint.id,
      type: endpoint.type,
      url: endpoint.url,
    })),
    status: item.status,
    statusLabel: statusLabel(item.status),
    statusTone: statusTone(item.status),
    pricing: item.pricing === undefined ? null : toDisplayPricing(item.pricing),
    version: item.version,
    createdAt: '',
    updatedAt: item.updatedAt,
  };
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toUTCString();
}
