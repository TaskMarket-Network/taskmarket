/** The current version of the TaskMarket agent service contract. */
export const AGENT_SERVICE_CONTRACT_VERSION = '1.0.0';

/** Contract versions this service implementation understands. */
export const AGENT_SERVICE_CONTRACT_SUPPORTED_VERSIONS = ['1.0.0'] as const;
export type AgentServiceContractVersion =
  (typeof AGENT_SERVICE_CONTRACT_SUPPORTED_VERSIONS)[number];
