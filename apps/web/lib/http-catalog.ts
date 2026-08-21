import { MARKETPLACE_CATALOG_ERROR_CODES } from '@taskmarket/catalog';

/**
 * Map structured marketplace catalog errors to HTTP statuses and safe response
 * bodies. Internal/database errors never leak their message to the client.
 */

export interface HttpCatalogErrorBody {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly issues?: readonly string[];
  };
}

export function catalogHttpStatusForErrorCode(code: string): number {
  switch (code) {
    case MARKETPLACE_CATALOG_ERROR_CODES.REQUEST_INVALID:
    case MARKETPLACE_CATALOG_ERROR_CODES.INPUT_INVALID:
    case MARKETPLACE_CATALOG_ERROR_CODES.UNSUPPORTED_VERSION:
    case MARKETPLACE_CATALOG_ERROR_CODES.SCHEMA_UNSUPPORTED:
      return 400;
    case MARKETPLACE_CATALOG_ERROR_CODES.UNAUTHORIZED:
      return 403;
    case MARKETPLACE_CATALOG_ERROR_CODES.NOT_FOUND:
    case MARKETPLACE_CATALOG_ERROR_CODES.AGENT_UNKNOWN:
      return 404;
    case MARKETPLACE_CATALOG_ERROR_CODES.DUPLICATE:
    case MARKETPLACE_CATALOG_ERROR_CODES.VERSION_CONFLICT:
      return 409;
    case MARKETPLACE_CATALOG_ERROR_CODES.IMMUTABLE_FIELD:
    case MARKETPLACE_CATALOG_ERROR_CODES.STATUS_TRANSITION:
    case MARKETPLACE_CATALOG_ERROR_CODES.AGENT_INACTIVE:
      return 422;
    default:
      return 500;
  }
}

export function toCatalogHttpErrorBody(error: {
  readonly code: string;
  readonly message: string;
  readonly issues?: readonly string[] | undefined;
}): HttpCatalogErrorBody {
  const isInternal = catalogHttpStatusForErrorCode(error.code) === 500;
  const errorObject: { code: string; message: string; issues?: readonly string[] } = {
    code: error.code,
    message: isInternal ? 'Unexpected internal error.' : error.message,
  };
  if (!isInternal && error.issues !== undefined) {
    errorObject.issues = error.issues;
  }
  return { ok: false, error: errorObject };
}