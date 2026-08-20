import {
  AGENT_REGISTRY_ERROR_CODES,
  type AgentRegistrationError,
} from '@taskmarket/agent-registry';
import { describe, expect, it } from 'vitest';

import { httpStatusForErrorCode, toHttpErrorBody } from './http.js';

function error(code: string, message = 'oops'): AgentRegistrationError {
  return { code, message };
}

describe('httpStatusForErrorCode', () => {
  it('maps validation errors to 400', () => {
    expect(httpStatusForErrorCode(AGENT_REGISTRY_ERROR_CODES.REQUEST_INVALID)).toBe(400);
    expect(httpStatusForErrorCode(AGENT_REGISTRY_ERROR_CODES.INPUT_INVALID)).toBe(400);
    expect(httpStatusForErrorCode(AGENT_REGISTRY_ERROR_CODES.UNSUPPORTED_VERSION)).toBe(400);
  });

  it('maps authorization errors to 403 and not-found to 404', () => {
    expect(httpStatusForErrorCode(AGENT_REGISTRY_ERROR_CODES.UNAUTHORIZED)).toBe(403);
    expect(httpStatusForErrorCode(AGENT_REGISTRY_ERROR_CODES.NOT_FOUND)).toBe(404);
  });

  it('maps conflicts to 409 and domain rejections to 422', () => {
    expect(httpStatusForErrorCode(AGENT_REGISTRY_ERROR_CODES.DUPLICATE)).toBe(409);
    expect(httpStatusForErrorCode(AGENT_REGISTRY_ERROR_CODES.VERSION_CONFLICT)).toBe(409);
    expect(httpStatusForErrorCode(AGENT_REGISTRY_ERROR_CODES.STATUS_TRANSITION)).toBe(422);
  });

  it('defaults unknown codes to 500', () => {
    expect(httpStatusForErrorCode(AGENT_REGISTRY_ERROR_CODES.DATABASE)).toBe(500);
    expect(httpStatusForErrorCode('SOMETHING_ELSE')).toBe(500);
  });
});

describe('toHttpErrorBody', () => {
  it('keeps structured issues for non-internal errors', () => {
    const body = toHttpErrorBody({
      ...error(AGENT_REGISTRY_ERROR_CODES.INPUT_INVALID),
      issues: ['bad'],
    });
    expect(body).toEqual({
      ok: false,
      error: { code: AGENT_REGISTRY_ERROR_CODES.INPUT_INVALID, message: 'oops', issues: ['bad'] },
    });
  });

  it('never leaks internal error messages', () => {
    const body = toHttpErrorBody(error(AGENT_REGISTRY_ERROR_CODES.INTERNAL, 'secret detail'));
    expect(body.error.message).toBe('Unexpected internal error.');
    expect(body.error.issues).toBeUndefined();
  });

  it('hides database error details', () => {
    const body = toHttpErrorBody(error(AGENT_REGISTRY_ERROR_CODES.DATABASE, 'connection failed'));
    expect(body.error.message).toBe('Unexpected internal error.');
  });
});
