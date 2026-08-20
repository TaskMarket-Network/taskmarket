import {
  AGENT_REGISTRY_ERROR_CODES,
  type AgentRegistrationError,
} from '@taskmarket/agent-registry';

/**
 * Map structured registry errors to HTTP statuses and safe response bodies.
 * Internal/database errors never leak their message to the client.
 */

export interface HttpErrorBody {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly issues?: readonly string[];
  };
}

export function httpStatusForErrorCode(code: string): number {
  switch (code) {
    case AGENT_REGISTRY_ERROR_CODES.REQUEST_INVALID:
    case AGENT_REGISTRY_ERROR_CODES.INPUT_INVALID:
    case AGENT_REGISTRY_ERROR_CODES.UNSUPPORTED_VERSION:
    case AGENT_REGISTRY_ERROR_CODES.SCHEMA_UNSUPPORTED:
      return 400;
    case AGENT_REGISTRY_ERROR_CODES.UNAUTHORIZED:
      return 403;
    case AGENT_REGISTRY_ERROR_CODES.NOT_FOUND:
      return 404;
    case AGENT_REGISTRY_ERROR_CODES.DUPLICATE:
    case AGENT_REGISTRY_ERROR_CODES.VERSION_CONFLICT:
      return 409;
    case AGENT_REGISTRY_ERROR_CODES.IMMUTABLE_FIELD:
    case AGENT_REGISTRY_ERROR_CODES.STATUS_TRANSITION:
      return 422;
    default:
      return 500;
  }
}

export function toHttpErrorBody(error: AgentRegistrationError): HttpErrorBody {
  const isInternal = httpStatusForErrorCode(error.code) === 500;
  const errorObject: { code: string; message: string; issues?: readonly string[] } = {
    code: error.code,
    message: isInternal ? 'Unexpected internal error.' : error.message,
  };
  if (!isInternal && error.issues !== undefined) {
    errorObject.issues = error.issues;
  }
  return { ok: false, error: errorObject };
}
