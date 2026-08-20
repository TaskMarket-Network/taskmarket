import { randomUUID } from 'node:crypto';

import { ServiceOfferingInputError, ServiceOfferingStatusTransitionError } from './errors.js';
import { serviceOfferingInputSchema, serviceOfferingUpdateSchema } from './schemas.js';
import type {
  ServiceOffering,
  ServiceOfferingInput,
  ServiceOfferingStatus,
  ServiceOfferingUpdateInput,
} from './types.js';

/** Injectable clock returning epoch milliseconds (deterministic tests). */
export type OfferingClock = () => number;

/** Injectable id factories (deterministic tests). */
export interface OfferingDeps {
  /** Clock returning epoch milliseconds. Defaults to `Date.now`. */
  clock?: OfferingClock;
  /** Factory for offering ids. Defaults to `randomUUID`. */
  offeringIdFactory?: () => string;
}

/** Allowed status transitions: `active -> archived -> active`. */
export const SERVICE_OFFERING_STATUS_TRANSITIONS: Readonly<
  Record<ServiceOfferingStatus, readonly ServiceOfferingStatus[]>
> = {
  active: ['archived'],
  archived: ['active'],
};

/** Throw when `from -> to` is not an allowed offering status transition. */
export function assertServiceOfferingStatusTransition(
  from: ServiceOfferingStatus,
  to: ServiceOfferingStatus,
): void {
  if (from === to) {
    return;
  }
  if (!SERVICE_OFFERING_STATUS_TRANSITIONS[from].includes(to)) {
    throw new ServiceOfferingStatusTransitionError(from, to);
  }
}

function epochIso(now: number): string {
  return new Date(now).toISOString();
}

/**
 * Create a service offering from validated input. Immutable fields (`id`,
 * `ownerRef`, `agentId`, `createdAt`) are set here and never change; `version`
 * starts at 1. Returns a new readonly domain object.
 *
 * The caller (the offerings service) is responsible for enforcing ownership of
 * the referenced agent and that `capabilities` is a subset of the agent's
 * declared capabilities; this function only validates the shape of the input.
 */
export function createServiceOffering(
  input: ServiceOfferingInput,
  deps: OfferingDeps = {},
): ServiceOffering {
  const parsed = serviceOfferingInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ServiceOfferingInputError(parsed.error.issues.map((issue) => issue.message));
  }

  const clock = deps.clock ?? Date.now;
  const offeringIdFactory = deps.offeringIdFactory ?? randomUUID;
  const now = epochIso(clock());

  return {
    id: parsed.data.id ?? offeringIdFactory(),
    ownerRef: parsed.data.ownerRef,
    agentId: parsed.data.agentId,
    name: parsed.data.name,
    description: parsed.data.description,
    capabilities: [...parsed.data.capabilities],
    inputs: parsed.data.inputs.map((input) => ({ ...input })),
    outputs: parsed.data.outputs.map((output) => ({ ...output })),
    pricing: parsed.data.pricing.map((pricing) => ({ ...pricing })),
    estimatedExecutionTime: { ...parsed.data.estimatedExecutionTime },
    constraints: { ...parsed.data.constraints },
    status: parsed.data.status,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Apply an update to a service offering's mutable fields. Immutable fields are
 * rejected at the input boundary (the schema only admits mutable fields).
 * Status changes are validated against the allowed transitions. Returns a new
 * domain object with `version` incremented and `updatedAt` bumped; the input
 * object is never mutated.
 */
export function applyServiceOfferingUpdate(
  offering: ServiceOffering,
  input: ServiceOfferingUpdateInput,
  deps: OfferingDeps = {},
): ServiceOffering {
  const parsed = serviceOfferingUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new ServiceOfferingInputError(parsed.error.issues.map((issue) => issue.message));
  }

  if (parsed.data.status !== undefined) {
    assertServiceOfferingStatusTransition(offering.status, parsed.data.status);
  }

  const clock = deps.clock ?? Date.now;
  const now = epochIso(clock());

  const next: ServiceOffering = {
    id: offering.id,
    ownerRef: offering.ownerRef,
    agentId: offering.agentId,
    name: parsed.data.name ?? offering.name,
    description: parsed.data.description ?? offering.description,
    capabilities: parsed.data.capabilities
      ? [...parsed.data.capabilities]
      : [...offering.capabilities],
    inputs: parsed.data.inputs
      ? parsed.data.inputs.map((input) => ({ ...input }))
      : offering.inputs.map((input) => ({ ...input })),
    outputs: parsed.data.outputs
      ? parsed.data.outputs.map((output) => ({ ...output }))
      : offering.outputs.map((output) => ({ ...output })),
    pricing: parsed.data.pricing
      ? parsed.data.pricing.map((pricing) => ({ ...pricing }))
      : offering.pricing.map((pricing) => ({ ...pricing })),
    estimatedExecutionTime: parsed.data.estimatedExecutionTime
      ? { ...parsed.data.estimatedExecutionTime }
      : { ...offering.estimatedExecutionTime },
    constraints: parsed.data.constraints
      ? { ...parsed.data.constraints }
      : { ...offering.constraints },
    status: parsed.data.status ?? offering.status,
    version: offering.version + 1,
    createdAt: offering.createdAt,
    updatedAt: now,
  };

  return next;
}
