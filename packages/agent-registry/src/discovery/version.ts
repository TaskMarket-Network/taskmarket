/** The current version of the TaskMarket capability discovery contract. */
export const CAPABILITY_DISCOVERY_API_VERSION = '1.0.0';

/** Contract versions this implementation understands. */
export const CAPABILITY_DISCOVERY_API_SUPPORTED_VERSIONS = ['1.0.0'] as const;
export type CapabilityDiscoveryApiContractVersion =
  (typeof CAPABILITY_DISCOVERY_API_SUPPORTED_VERSIONS)[number];
