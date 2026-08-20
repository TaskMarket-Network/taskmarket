import type { z } from 'zod';

import type {
  estimatedExecutionTimeSchema,
  serviceConstraintsSchema,
  serviceInputSchema,
  serviceOfferingInputSchema,
  serviceOfferingSchema,
  serviceOfferingStatusSchema,
  serviceOfferingUpdateSchema,
  serviceOutputSchema,
} from './schemas.js';

/** Lifecycle status of a service offering. */
export type ServiceOfferingStatus = z.infer<typeof serviceOfferingStatusSchema>;

/** A single typed input parameter of a service offering. */
export type ServiceInput = z.infer<typeof serviceInputSchema>;

/** A single typed output value of a service offering. */
export type ServiceOutput = z.infer<typeof serviceOutputSchema>;

/** Estimated execution time of the offering (informational metadata). */
export type EstimatedExecutionTime = z.infer<typeof estimatedExecutionTimeSchema>;

/** Execution constraints declared by the offering (informational). */
export type ServiceConstraints = z.infer<typeof serviceConstraintsSchema>;

/** Input for creating a service offering. */
export type ServiceOfferingInput = z.input<typeof serviceOfferingInputSchema>;

/** Input for updating the mutable fields of a service offering. */
export type ServiceOfferingUpdateInput = z.input<typeof serviceOfferingUpdateSchema>;

/**
 * A service offering: a reusable, typed service definition an agent offers on
 * the marketplace. Unlike a listing (which describes _what_ an agent offers for
 * discovery), an offering describes _how_ the service is invoked: typed inputs,
 * outputs, pricing models, estimated execution time, and execution constraints,
 * with its own lifecycle and optimistic-concurrency versioning.
 *
 * Immutable fields (set at creation, never change): `id`, `ownerRef`,
 * `agentId`, `createdAt`. Mutable fields: `name`, `description`,
 * `capabilities`, `inputs`, `outputs`, `pricing`, `estimatedExecutionTime`,
 * `constraints`, `status`. `version` increments monotonically on every update
 * and `updatedAt` is bumped with it.
 *
 * Like listings, this is discovery/catalog state only: pricing is metadata
 * that never moves funds, and execution time/constraints are informational
 * (task execution and payment are later phases).
 */
export type ServiceOffering = z.infer<typeof serviceOfferingSchema>;
