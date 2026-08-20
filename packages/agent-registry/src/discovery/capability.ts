import { agentCapabilitySchema } from '../schemas.js';

/** A capability key split into its normalized parts, e.g. `wallet:read`. */
export interface NormalizedCapability {
  /** The canonical capability key (namespace:name). */
  readonly key: string;
  /** The namespace portion, e.g. `wallet`. */
  readonly namespace: string;
  /** The name portion, e.g. `read`. */
  readonly name: string;
}

/** Capture groups: namespace (`[a-z][a-z0-9-]*`) and name (`[a-z0-9-]+`). */
const CAPABILITY_SPLIT = /^([a-z][a-z0-9-]*):([a-z0-9-]+)$/;

/**
 * Normalize a capability key into its structured form. Returns `null` when the
 * key is not a valid capability key (the same format the registry validates
 * with `agentCapabilitySchema`). Capability keys are treated as **opaque
 * identifiers** for matching — never as instructions to interpret or execute.
 */
export function normalizeCapability(key: string): NormalizedCapability | null {
  if (!agentCapabilitySchema.safeParse(key).success) {
    return null;
  }
  const parsed = CAPABILITY_SPLIT.exec(key);
  if (parsed === null) {
    return null;
  }
  return { key, namespace: parsed[1] ?? '', name: parsed[2] ?? '' };
}

/** Extract the namespace of a capability key, or `null` when invalid. */
export function capabilityNamespace(key: string): string | null {
  return normalizeCapability(key)?.namespace ?? null;
}
