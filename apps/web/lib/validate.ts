import type { AgentUpdateInput, RegisteredAgentInput } from '@taskmarket/agent-registry';

/**
 * Client- and server-shared, pure input parsing for the dashboard forms. The
 * authoritative validation still happens inside the registration service at
 * the trust boundary; these helpers give the UI fast, consistent feedback and
 * produce payloads in the shape the service expects.
 */

const CAPABILITY_PATTERN = /^[a-z][a-z0-9-]*:[a-z0-9-]+$/;
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;
const ENDPOINT_TYPES = ['mcp', 'http', 'webhook'] as const;

export type EndpointType = (typeof ENDPOINT_TYPES)[number];

export interface ParsedEndpoint {
  readonly type: EndpointType;
  readonly url: string;
}

/** Split a free-text capability input into validated, deduplicated keys. */
export function parseCapabilities(raw: string): {
  readonly capabilities: string[];
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  const seen = new Set<string>();
  const capabilities: string[] = [];
  for (const token of raw.split(/[\s,]+/)) {
    const value = token.trim().toLowerCase();
    if (value.length === 0) {
      continue;
    }
    if (!CAPABILITY_PATTERN.test(value)) {
      issues.push(`Capability "${token}" must look like "agent:meta".`);
      continue;
    }
    if (!seen.has(value)) {
      seen.add(value);
      capabilities.push(value);
    }
  }
  return { capabilities, issues };
}

/** Parse endpoint lines ("type url" or just "url", defaulting to http). */
export function parseEndpoints(raw: string): {
  readonly endpoints: readonly ParsedEndpoint[];
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  const seen = new Set<string>();
  const endpoints: ParsedEndpoint[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const parts = trimmed.split(/\s+/);
    let type: EndpointType = 'http';
    let url = trimmed;
    if (parts.length >= 2 && (ENDPOINT_TYPES as readonly string[]).includes(parts[0] ?? '')) {
      type = parts[0] as EndpointType;
      url = parts.slice(1).join(' ');
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      issues.push(`Endpoint "${trimmed}" is not a valid URL.`);
      continue;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      issues.push(`Endpoint "${trimmed}" must use http or https.`);
      continue;
    }
    if (seen.has(parsed.href)) {
      continue;
    }
    seen.add(parsed.href);
    endpoints.push({ type, url: parsed.href });
  }
  return { endpoints, issues };
}

export interface PricingFormInput {
  readonly currency: string;
  readonly minAmount: string;
  readonly maxAmount: string;
  readonly description: string;
}

export function parsePricing(input: PricingFormInput): {
  readonly pricing:
    | {
        readonly currency: string;
        readonly minAmount?: string;
        readonly maxAmount?: string;
        readonly description?: string;
      }
    | undefined;
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  const currency = (input.currency ?? '').trim();
  const min = (input.minAmount ?? '').trim();
  const max = (input.maxAmount ?? '').trim();
  const description = (input.description ?? '').trim();
  const hasAny = currency.length > 0 || min.length > 0 || max.length > 0 || description.length > 0;
  if (!hasAny) {
    return { pricing: undefined, issues };
  }
  const result: {
    currency: string;
    minAmount?: string;
    maxAmount?: string;
    description?: string;
  } = { currency };
  if (currency.length === 0) {
    issues.push('Currency is required when pricing is provided.');
  } else if (currency.length > 16) {
    issues.push('Currency must be 16 characters or fewer.');
  }
  if (min.length > 0) {
    if (!DECIMAL_PATTERN.test(min)) {
      issues.push('Minimum amount must be a non-negative decimal string.');
    } else {
      result.minAmount = min;
    }
  }
  if (max.length > 0) {
    if (!DECIMAL_PATTERN.test(max)) {
      issues.push('Maximum amount must be a non-negative decimal string.');
    } else {
      result.maxAmount = max;
    }
  }
  if (description.length > 512) {
    issues.push('Pricing note must be 512 characters or fewer.');
  } else if (description.length > 0) {
    result.description = description;
  }
  if (
    result.minAmount !== undefined &&
    result.maxAmount !== undefined &&
    Number(result.maxAmount) < Number(result.minAmount)
  ) {
    issues.push('Maximum amount must be greater than or equal to the minimum amount.');
  }
  if (issues.length > 0) {
    return { pricing: undefined, issues };
  }
  return { pricing: result, issues };
}

/** Raw field values collected from the create-agent form. */
export interface CreateAgentForm {
  readonly name: string;
  readonly description: string;
  readonly capabilities: string;
  readonly endpoints: string;
  readonly status: 'draft' | 'active';
  readonly currency: string;
  readonly minAmount: string;
  readonly maxAmount: string;
  readonly pricingDescription: string;
}

/**
 * Build the registration payload from form values. `ownerRef` is filled by the
 * server (the authenticated principal); `id` is domain-owned.
 */
export function buildCreateAgentInput(form: CreateAgentForm): {
  readonly input: RegisteredAgentInput | null;
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  const name = (form.name ?? '').trim();
  if (name.length === 0) {
    issues.push('Name is required.');
  } else if (name.length > 256) {
    issues.push('Name must be 256 characters or fewer.');
  }
  const description = (form.description ?? '').trim();
  if (description.length > 2048) {
    issues.push('Description must be 2048 characters or fewer.');
  }
  const { capabilities, issues: capabilityIssues } = parseCapabilities(form.capabilities ?? '');
  issues.push(...capabilityIssues);
  if (capabilities.length === 0) {
    issues.push('At least one capability is required (e.g. agent:meta).');
  } else if (capabilities.length > 100) {
    issues.push('At most 100 capabilities are allowed.');
  }
  const { endpoints, issues: endpointIssues } = parseEndpoints(form.endpoints ?? '');
  issues.push(...endpointIssues);
  if (endpoints.length > 50) {
    issues.push('At most 50 endpoints are allowed.');
  }
  const { pricing, issues: pricingIssues } = parsePricing({
    currency: form.currency ?? '',
    minAmount: form.minAmount ?? '',
    maxAmount: form.maxAmount ?? '',
    description: form.pricingDescription ?? '',
  });
  issues.push(...pricingIssues);
  if (issues.length > 0) {
    return { input: null, issues };
  }
  const input: RegisteredAgentInput = {
    ownerRef: '',
    name,
    description,
    capabilities,
    endpoints: endpoints.map((endpoint) => ({ type: endpoint.type, url: endpoint.url })),
    status: form.status ?? 'draft',
  };
  if (pricing !== undefined) {
    input.pricing = pricing;
  }
  return { input, issues: [] };
}

/** Raw field values collected from the edit-agent form (all optional). */
export interface EditAgentForm {
  readonly name: string;
  readonly description: string;
  readonly capabilities: string;
  readonly endpoints: string;
  readonly status?: string;
}

const STATUS_VALUES = ['draft', 'active', 'suspended', 'retired'] as const;

/** Build an update payload from the edit form; only changed fields are sent. */
export function buildUpdateInput(form: EditAgentForm): {
  readonly update: AgentUpdateInput | null;
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  const update: Record<string, unknown> = {};
  if (form.name !== undefined) {
    const name = form.name.trim();
    if (name.length > 0) {
      if (name.length > 256) {
        issues.push('Name must be 256 characters or fewer.');
      } else {
        update.name = name;
      }
    }
  }
  if (form.description !== undefined) {
    const description = form.description.trim();
    if (description.length > 2048) {
      issues.push('Description must be 2048 characters or fewer.');
    } else {
      update.description = description;
    }
  }
  if (form.capabilities !== undefined) {
    const { capabilities, issues: capabilityIssues } = parseCapabilities(form.capabilities);
    issues.push(...capabilityIssues);
    if (capabilities.length > 0) {
      if (capabilities.length > 100) {
        issues.push('At most 100 capabilities are allowed.');
      } else {
        update.capabilities = capabilities;
      }
    }
  }
  if (form.endpoints !== undefined) {
    const { endpoints, issues: endpointIssues } = parseEndpoints(form.endpoints);
    issues.push(...endpointIssues);
    if (endpoints.length > 0) {
      if (endpoints.length > 50) {
        issues.push('At most 50 endpoints are allowed.');
      } else {
        update.endpoints = endpoints;
      }
    }
  }
  if (form.status !== undefined && form.status.trim().length > 0) {
    const status = form.status.trim();
    if (!(STATUS_VALUES as readonly string[]).includes(status)) {
      issues.push(`Status "${status}" is not a valid registration state.`);
    } else {
      update.status = status;
    }
  }
  if (issues.length > 0) {
    return { update: null, issues };
  }
  return { update: update as AgentUpdateInput, issues: [] };
}
