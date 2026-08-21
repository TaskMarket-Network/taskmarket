import type {
  ListingAvailability,
  MarketplaceListingInput,
  MarketplaceListingUpdateInput,
  ServiceOfferingInput,
  ServiceOfferingUpdateInput,
} from '@taskmarket/catalog';

import { parseCapabilities } from './validate';

/**
 * Client- and server-shared, pure input parsing for the marketplace forms. The
 * authoritative validation still happens inside the catalog services at the
 * trust boundary; these helpers give the UI fast, consistent feedback and
 * produce payloads in the shape the services expect.
 */

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;
const AVAILABILITY_VALUES = ['available', 'limited', 'unavailable'] as const;

/** Raw field values collected from the create-listing form. */
export interface CreateListingForm {
  readonly agentId: string;
  readonly title: string;
  readonly description: string;
  readonly capabilities: string;
  readonly currency: string;
  readonly amount: string;
  readonly per: string;
  readonly pricingDescription: string;
  readonly availability: string;
  readonly rating: string;
  readonly completionRate: string;
}

export interface ParsedListingInput {
  readonly input: MarketplaceListingInput;
  readonly issues: readonly string[];
}

export function parseAvailabilityStatus(raw: string): ListingAvailability['status'] | null {
  const value = raw.trim().toLowerCase();
  return (AVAILABILITY_VALUES as readonly string[]).includes(value)
    ? (value as ListingAvailability['status'])
    : null;
}

function optionalDecimal(raw: string, max: number, field: string, issues: string[]): string | undefined {
  const value = raw.trim();
  if (value.length === 0) {
    return undefined;
  }
  if (!DECIMAL_PATTERN.test(value)) {
    issues.push(`${field} must be a non-negative decimal string.`);
    return undefined;
  }
  if (Number(value) > max) {
    issues.push(`${field} must not exceed ${max}.`);
    return undefined;
  }
  return value;
}

/** Build the catalog create-listing payload from form values. */
export function buildCreateListingInput(form: CreateListingForm): ParsedListingInput {
  const issues: string[] = [];
  const agentId = (form.agentId ?? '').trim();
  if (agentId.length === 0) {
    issues.push('Agent id is required.');
  }
  const title = (form.title ?? '').trim();
  if (title.length === 0) {
    issues.push('Title is required.');
  } else if (title.length > 200) {
    issues.push('Title must be 200 characters or fewer.');
  }
  const description = (form.description ?? '').trim();
  if (description.length > 2000) {
    issues.push('Description must be 2000 characters or fewer.');
  }
  const { capabilities, issues: capabilityIssues } = parseCapabilities(form.capabilities ?? '');
  issues.push(...capabilityIssues);
  if (capabilities.length === 0) {
    issues.push('At least one capability is required (e.g. agent:meta).');
  }

  const currency = (form.currency ?? '').trim();
  const amount = (form.amount ?? '').trim();
  const per = (form.per ?? '').trim();
  const pricingDescription = (form.pricingDescription ?? '').trim();
  const pricing: MarketplaceListingInput['pricing'] = [];
  if (currency.length > 0 || amount.length > 0) {
    if (currency.length === 0) {
      issues.push('Currency is required when pricing is provided.');
    }
    if (currency.length > 16) {
      issues.push('Currency must be 16 characters or fewer.');
    }
    const parsedAmount = optionalDecimal(amount, 1e18, 'Amount', issues);
    if (currency.length > 0 && parsedAmount !== undefined) {
      pricing.push({
        name: 'per unit',
        currency,
        amount: parsedAmount,
        ...(per.length > 0 ? { per } : {}),
        ...(pricingDescription.length > 0 ? { description: pricingDescription } : {}),
      });
    }
  }

  const availabilityStatus = parseAvailabilityStatus(form.availability ?? 'available');
  const availability: ListingAvailability =
    availabilityStatus === null ? { status: 'available' } : { status: availabilityStatus };

  const trust: MarketplaceListingInput['trust'] = { selfReported: true };
  const rating = optionalDecimal(form.rating ?? '', 5, 'Rating', issues);
  const completionRate = optionalDecimal(form.completionRate ?? '', 100, 'Completion rate', issues);
  if (rating !== undefined) {
    trust.rating = rating;
  }
  if (completionRate !== undefined) {
    trust.completionRate = completionRate;
  }

  if (issues.length > 0) {
    return { input: null as unknown as MarketplaceListingInput, issues };
  }

  const input: MarketplaceListingInput = {
    ownerRef: '',
    agentId,
    title,
    description,
    capabilities,
    availability,
    trust,
    ...(pricing.length > 0 ? { pricing } : {}),
  };
  return { input, issues: [] };
}

/** Raw field values collected from the edit-listing form (all optional). */
export interface EditListingForm {
  readonly title: string;
  readonly description: string;
  readonly capabilities: string;
  readonly availability: string;
}

export function buildUpdateListingInput(form: EditListingForm): {
  readonly update: MarketplaceListingUpdateInput | null;
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  const update: Record<string, unknown> = {};
  const title = (form.title ?? '').trim();
  if (title.length > 0) {
    if (title.length > 200) {
      issues.push('Title must be 200 characters or fewer.');
    } else {
      update.title = title;
    }
  }
  const description = (form.description ?? '').trim();
  if (description.length > 2000) {
    issues.push('Description must be 2000 characters or fewer.');
  } else if (description.length > 0) {
    update.description = description;
  }
  const capabilitiesRaw = (form.capabilities ?? '').trim();
  if (capabilitiesRaw.length > 0) {
    const { capabilities, issues: capabilityIssues } = parseCapabilities(capabilitiesRaw);
    issues.push(...capabilityIssues);
    if (capabilities.length > 0) {
      update.capabilities = capabilities;
    }
  }
  const availabilityRaw = (form.availability ?? '').trim();
  if (availabilityRaw.length > 0) {
    const availabilityStatus = parseAvailabilityStatus(availabilityRaw);
    if (availabilityStatus === null) {
      issues.push(`Availability "${availabilityRaw}" is not valid.`);
    } else {
      update.availability = { status: availabilityStatus };
    }
  }
  if (issues.length > 0) {
    return { update: null, issues };
  }
  if (Object.keys(update).length === 0) {
    return { update: null, issues: ['At least one field must change.'] };
  }
  return { update: update as MarketplaceListingUpdateInput, issues: [] };
}

/** Raw field values collected from the create-offering form. */
export interface CreateOfferingForm {
  readonly agentId: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities: string;
  readonly inputs: string;
  readonly outputs: string;
  readonly currency: string;
  readonly amount: string;
  readonly per: string;
  readonly pricingDescription: string;
  readonly averageMs: string;
  readonly maxMs: string;
  readonly timeoutMs: string;
  readonly maxConcurrency: string;
  readonly maxInputBytes: string;
}

/** Parse "name:type" lines into typed parameters (description ignored here). */
export function parseIoParams(raw: string, field: string): {
  readonly params: { name: string; type: string; required: boolean }[];
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  const seen = new Set<string>();
  const params: { name: string; type: string; required: boolean }[] = [];
  for (const line of (raw ?? '').split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const match = /^([\w-]+)(?::([\w-]+))?$/.exec(trimmed);
    if (match === null) {
      issues.push(`"${trimmed}" is not a valid ${field} entry (use "name:type").`);
      continue;
    }
    const name = match[1] ?? '';
    const type = match[2] ?? 'string';
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    params.push({ name, type, required: true });
  }
  return { params, issues };
}

export function buildCreateOfferingInput(form: CreateOfferingForm): {
  readonly input: ServiceOfferingInput | null;
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  const agentId = (form.agentId ?? '').trim();
  if (agentId.length === 0) {
    issues.push('Agent id is required.');
  }
  const name = (form.name ?? '').trim();
  if (name.length === 0) {
    issues.push('Name is required.');
  } else if (name.length > 200) {
    issues.push('Name must be 200 characters or fewer.');
  }
  const description = (form.description ?? '').trim();
  if (description.length > 2000) {
    issues.push('Description must be 2000 characters or fewer.');
  }
  const { capabilities, issues: capabilityIssues } = parseCapabilities(form.capabilities ?? '');
  issues.push(...capabilityIssues);
  const { params: inputs, issues: inputIssues } = parseIoParams(form.inputs ?? '', 'input');
  issues.push(...inputIssues);
  const { params: outputs, issues: outputIssues } = parseIoParams(form.outputs ?? '', 'output');
  issues.push(...outputIssues);

  const currency = (form.currency ?? '').trim();
  const amount = (form.amount ?? '').trim();
  const per = (form.per ?? '').trim();
  const pricingDescription = (form.pricingDescription ?? '').trim();
  const pricing: ServiceOfferingInput['pricing'] = [];
  if (currency.length > 0 || amount.length > 0) {
    if (currency.length === 0) {
      issues.push('Currency is required when pricing is provided.');
    }
    if (currency.length > 16) {
      issues.push('Currency must be 16 characters or fewer.');
    }
    const parsedAmount = optionalDecimal(amount, 1e18, 'Amount', issues);
    if (currency.length > 0 && parsedAmount !== undefined) {
      pricing.push({
        name: 'per unit',
        currency,
        amount: parsedAmount,
        ...(per.length > 0 ? { per } : {}),
        ...(pricingDescription.length > 0 ? { description: pricingDescription } : {}),
      });
    }
  }

  const averageMs = Number(form.averageMs);
  const maxMs = Number(form.maxMs);
  if (!Number.isInteger(averageMs) || averageMs < 0) {
    issues.push('Average execution time must be a non-negative integer (ms).');
  }
  if (!Number.isInteger(maxMs) || maxMs < averageMs) {
    issues.push('Max execution time must be an integer (ms) at least the average.');
  }

  const constraints: ServiceOfferingInput['constraints'] = {};
  const timeoutMs = Number(form.timeoutMs);
  if (form.timeoutMs !== undefined && form.timeoutMs.trim().length > 0) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
      issues.push('Timeout must be a positive integer (ms).');
    } else {
      constraints.timeoutMs = timeoutMs;
    }
  }
  const maxConcurrency = Number(form.maxConcurrency);
  if (form.maxConcurrency !== undefined && form.maxConcurrency.trim().length > 0) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      issues.push('Max concurrency must be a positive integer.');
    } else {
      constraints.maxConcurrency = maxConcurrency;
    }
  }
  const maxInputBytes = Number(form.maxInputBytes);
  if (form.maxInputBytes !== undefined && form.maxInputBytes.trim().length > 0) {
    if (!Number.isInteger(maxInputBytes) || maxInputBytes < 1) {
      issues.push('Max input size must be a positive integer (bytes).');
    } else {
      constraints.maxInputBytes = maxInputBytes;
    }
  }

  if (issues.length > 0) {
    return { input: null, issues };
  }

  const input: ServiceOfferingInput = {
    ownerRef: '',
    agentId,
    name,
    description,
    capabilities,
    inputs: inputs.map((param) => ({
      name: param.name,
      type: param.type,
      required: param.required,
    })),
    outputs: outputs.map((param) => ({ name: param.name, type: param.type })),
    estimatedExecutionTime: { averageMs, maxMs },
    constraints,
    ...(pricing.length > 0 ? { pricing } : {}),
  };
  return { input, issues: [] };
}

/** Raw field values collected from the edit-offering form (all optional). */
export interface EditOfferingForm {
  readonly name: string;
  readonly description: string;
  readonly capabilities: string;
  readonly inputs: string;
  readonly outputs: string;
}

export function buildUpdateOfferingInput(form: EditOfferingForm): {
  readonly update: ServiceOfferingUpdateInput | null;
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  const update: Record<string, unknown> = {};
  const name = (form.name ?? '').trim();
  if (name.length > 0) {
    if (name.length > 200) {
      issues.push('Name must be 200 characters or fewer.');
    } else {
      update.name = name;
    }
  }
  const description = (form.description ?? '').trim();
  if (description.length > 2000) {
    issues.push('Description must be 2000 characters or fewer.');
  } else if (description.length > 0) {
    update.description = description;
  }
  const capabilitiesRaw = (form.capabilities ?? '').trim();
  if (capabilitiesRaw.length > 0) {
    const { capabilities, issues: capabilityIssues } = parseCapabilities(capabilitiesRaw);
    issues.push(...capabilityIssues);
    if (capabilities.length > 0) {
      update.capabilities = capabilities;
    }
  }
  const inputsRaw = (form.inputs ?? '').trim();
  if (inputsRaw.length > 0) {
    const { params, issues: inputIssues } = parseIoParams(inputsRaw, 'input');
    issues.push(...inputIssues);
    if (params.length > 0) {
      update.inputs = params.map((param) => ({
        name: param.name,
        type: param.type,
        required: param.required,
      }));
    }
  }
  const outputsRaw = (form.outputs ?? '').trim();
  if (outputsRaw.length > 0) {
    const { params, issues: outputIssues } = parseIoParams(outputsRaw, 'output');
    issues.push(...outputIssues);
    if (params.length > 0) {
      update.outputs = params.map((param) => ({ name: param.name, type: param.type }));
    }
  }
  if (issues.length > 0) {
    return { update: null, issues };
  }
  if (Object.keys(update).length === 0) {
    return { update: null, issues: ['At least one field must change.'] };
  }
  return { update: update as ServiceOfferingUpdateInput, issues: [] };
}