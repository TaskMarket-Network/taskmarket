/** The current version of the TaskMarket service offerings API contract. */
export const SERVICE_OFFERING_API_VERSION = '1.0.0';

/** Contract versions this implementation understands. */
export const SERVICE_OFFERING_API_SUPPORTED_VERSIONS = ['1.0.0'] as const;
export type ServiceOfferingApiContractVersion =
  (typeof SERVICE_OFFERING_API_SUPPORTED_VERSIONS)[number];
