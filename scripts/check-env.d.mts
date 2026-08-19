/**
 * Minimal type declaration for `scripts/check-env.mjs`, shared by TypeScript
 * tests that reuse the environment parser.
 */

export function parseEnv(text: string): Record<string, string>;
