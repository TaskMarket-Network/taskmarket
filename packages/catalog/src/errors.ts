/** Structured error codes raised by the marketplace catalog domain and repositories. */
export const MARKETPLACE_CATALOG_ERROR_CODES = {
  INPUT_INVALID: 'CATALOG_INPUT_INVALID',
  IMMUTABLE_FIELD: 'CATALOG_IMMUTABLE_FIELD',
  STATUS_TRANSITION: 'CATALOG_STATUS_TRANSITION_INVALID',
  DUPLICATE: 'CATALOG_DUPLICATE',
  NOT_FOUND: 'CATALOG_NOT_FOUND',
  VERSION_CONFLICT: 'CATALOG_VERSION_CONFLICT',
  DATABASE: 'CATALOG_DATABASE',
  REQUEST_INVALID: 'CATALOG_REQUEST_INVALID',
  UNSUPPORTED_VERSION: 'CATALOG_UNSUPPORTED_VERSION',
  UNAUTHORIZED: 'CATALOG_UNAUTHORIZED',
  INTERNAL: 'CATALOG_INTERNAL',
  SCHEMA_UNSUPPORTED: 'CATALOG_SCHEMA_UNSUPPORTED',
  AGENT_UNKNOWN: 'CATALOG_AGENT_UNKNOWN',
  AGENT_INACTIVE: 'CATALOG_AGENT_INACTIVE',
} as const;
export type MarketplaceCatalogErrorCode =
  (typeof MARKETPLACE_CATALOG_ERROR_CODES)[keyof typeof MARKETPLACE_CATALOG_ERROR_CODES];

/** Base class for errors raised by the marketplace catalog. */
export class MarketplaceCatalogError extends Error {
  readonly code: MarketplaceCatalogErrorCode;

  constructor(code: MarketplaceCatalogErrorCode, message: string) {
    super(message);
    this.name = 'MarketplaceCatalogError';
    this.code = code;
  }
}

/** Raised when external input fails validation at the trust boundary. */
export class MarketplaceCatalogInputError extends MarketplaceCatalogError {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(
      MARKETPLACE_CATALOG_ERROR_CODES.INPUT_INVALID,
      `Invalid marketplace catalog input: ${issues.join('; ')}`,
    );
    this.name = 'MarketplaceCatalogInputError';
    this.issues = issues;
  }
}

/** Raised when a caller attempts to change an immutable field. */
export class MarketplaceCatalogImmutableFieldError extends MarketplaceCatalogError {
  constructor(message: string) {
    super(MARKETPLACE_CATALOG_ERROR_CODES.IMMUTABLE_FIELD, message);
    this.name = 'MarketplaceCatalogImmutableFieldError';
  }
}

/** Raised when a status change violates the allowed transitions. */
export class MarketplaceCatalogStatusTransitionError extends MarketplaceCatalogError {
  constructor(from: string, to: string) {
    super(
      MARKETPLACE_CATALOG_ERROR_CODES.STATUS_TRANSITION,
      `Invalid listing status transition: ${from} -> ${to}.`,
    );
    this.name = 'MarketplaceCatalogStatusTransitionError';
  }
}

/** Raised when a listing id is already registered. */
export class MarketplaceCatalogDuplicateError extends MarketplaceCatalogError {
  constructor(id: string) {
    super(MARKETPLACE_CATALOG_ERROR_CODES.DUPLICATE, `Listing "${id}" already exists.`);
    this.name = 'MarketplaceCatalogDuplicateError';
  }
}

/** Raised when a listing id does not exist. */
export class MarketplaceCatalogNotFoundError extends MarketplaceCatalogError {
  constructor(id: string) {
    super(MARKETPLACE_CATALOG_ERROR_CODES.NOT_FOUND, `Listing "${id}" was not found.`);
    this.name = 'MarketplaceCatalogNotFoundError';
  }
}

/** Raised on an optimistic-concurrency version mismatch during save. */
export class MarketplaceCatalogVersionConflictError extends MarketplaceCatalogError {
  constructor(id: string, expected: number, actual: number) {
    super(
      MARKETPLACE_CATALOG_ERROR_CODES.VERSION_CONFLICT,
      `Listing "${id}" version conflict: expected ${expected}, actual ${actual}.`,
    );
    this.name = 'MarketplaceCatalogVersionConflictError';
  }
}

/** Raised when the referenced registered agent does not exist. */
export class MarketplaceCatalogAgentUnknownError extends MarketplaceCatalogError {
  constructor(agentId: string) {
    super(
      MARKETPLACE_CATALOG_ERROR_CODES.AGENT_UNKNOWN,
      `Registered agent "${agentId}" was not found.`,
    );
    this.name = 'MarketplaceCatalogAgentUnknownError';
  }
}

/** Raised when publishing a listing whose agent is not active. */
export class MarketplaceCatalogAgentInactiveError extends MarketplaceCatalogError {
  constructor(agentId: string) {
    super(
      MARKETPLACE_CATALOG_ERROR_CODES.AGENT_INACTIVE,
      `Registered agent "${agentId}" is not active; only active agents can publish listings.`,
    );
    this.name = 'MarketplaceCatalogAgentInactiveError';
  }
}

/** Raised when a persistence layer fails (wraps the underlying cause). */
export class MarketplaceCatalogDatabaseError extends MarketplaceCatalogError {
  override readonly cause: unknown | undefined;

  constructor(message: string, cause?: unknown) {
    super(MARKETPLACE_CATALOG_ERROR_CODES.DATABASE, message);
    this.name = 'MarketplaceCatalogDatabaseError';
    this.cause = cause;
  }
}
