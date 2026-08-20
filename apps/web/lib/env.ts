/** Safe local development default, matching `scripts/migrate.mjs`. */
export const DEFAULT_DATABASE_URL =
  'postgres://taskmarket_dev:taskmarket_dev@localhost:5432/taskmarket_dev';

/** Principal the dashboard operates as until real authentication exists. */
export const DEFAULT_DASHBOARD_PRINCIPAL = 'dev-owner';

/** The dashboard's development network label (display only, no behavior). */
export const DEVELOPMENT_NETWORK_LABEL = 'GOAT Testnet (development)';

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
}

/**
 * Development identity placeholder. A real adapter derives the principal from
 * verified credentials; until then the dashboard uses an environment-configured
 * identity so the registry's ownership boundary is still exercised.
 */
export function getDashboardPrincipal(): string {
  return process.env.AGENT_DASHBOARD_PRINCIPAL?.trim() || DEFAULT_DASHBOARD_PRINCIPAL;
}
