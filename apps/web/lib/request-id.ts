import { randomUUID } from 'node:crypto';

/**
 * Request identifiers for the registration envelope. URL-safe so they survive
 * headers, logs, and storage; bounded to the 128-char contract limit.
 */
export function newRequestId(prefix = 'tmw'): string {
  return `${prefix}_${randomUUID()}`;
}
