import { MARKETPLACE_CATALOG_ERROR_CODES, MarketplaceCatalogError } from '../errors.js';

/** Base class for errors raised by the service offerings module. */
export class ServiceOfferingError extends MarketplaceCatalogError {
  constructor(code: string, message: string) {
    super(code as MarketplaceCatalogError['code'], message);
    this.name = 'ServiceOfferingError';
  }
}

/** Raised when external input fails validation at the trust boundary. */
export class ServiceOfferingInputError extends ServiceOfferingError {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(
      MARKETPLACE_CATALOG_ERROR_CODES.INPUT_INVALID,
      `Invalid service offering input: ${issues.join('; ')}`,
    );
    this.name = 'ServiceOfferingInputError';
    this.issues = issues;
  }
}

/** Raised when a status change violates the allowed transitions. */
export class ServiceOfferingStatusTransitionError extends ServiceOfferingError {
  constructor(from: string, to: string) {
    super(
      MARKETPLACE_CATALOG_ERROR_CODES.STATUS_TRANSITION,
      `Invalid service offering status transition: ${from} -> ${to}.`,
    );
    this.name = 'ServiceOfferingStatusTransitionError';
  }
}

/** Raised when an offering id is already registered. */
export class ServiceOfferingDuplicateError extends ServiceOfferingError {
  constructor(id: string) {
    super(MARKETPLACE_CATALOG_ERROR_CODES.DUPLICATE, `Service offering "${id}" already exists.`);
    this.name = 'ServiceOfferingDuplicateError';
  }
}

/** Raised when an offering id does not exist. */
export class ServiceOfferingNotFoundError extends ServiceOfferingError {
  constructor(id: string) {
    super(MARKETPLACE_CATALOG_ERROR_CODES.NOT_FOUND, `Service offering "${id}" was not found.`);
    this.name = 'ServiceOfferingNotFoundError';
  }
}

/** Raised on an optimistic-concurrency version mismatch during save. */
export class ServiceOfferingVersionConflictError extends ServiceOfferingError {
  constructor(id: string, expected: number, actual: number) {
    super(
      MARKETPLACE_CATALOG_ERROR_CODES.VERSION_CONFLICT,
      `Service offering "${id}" version conflict: expected ${expected}, actual ${actual}.`,
    );
    this.name = 'ServiceOfferingVersionConflictError';
  }
}
