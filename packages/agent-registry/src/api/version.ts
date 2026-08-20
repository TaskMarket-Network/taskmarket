/** The current version of the TaskMarket agent registration API contract. */
export const AGENT_REGISTRATION_API_VERSION = '1.0.0';

/** Contract versions this implementation understands. */
export const AGENT_REGISTRATION_API_SUPPORTED_VERSIONS = ['1.0.0'] as const;
export type AgentRegistrationApiContractVersion =
  (typeof AGENT_REGISTRATION_API_SUPPORTED_VERSIONS)[number];
