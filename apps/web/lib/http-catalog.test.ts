import { describe, expect, it } from 'vitest';

import { MARKETPLACE_CATALOG_ERROR_CODES } from '@taskmarket/catalog';

import { catalogHttpStatusForErrorCode, toCatalogHttpErrorBody } from './http-catalog.js';

describe('catalogHttpStatusForErrorCode', () => {
  it('maps client error codes to 4xx statuses', () => {
    expect(catalogHttpStatusForErrorCode(MARKETPLACE_CATALOG_ERROR_CODES.REQUEST_INVALID)).toBe(
      400,
    );
    expect(catalogHttpStatusForErrorCode(MARKETPLACE_CATALOG_ERROR_CODES.INPUT_INVALID)).toBe(400);
    expect(catalogHttpStatusForErrorCode(MARKETPLACE_CATALOG_ERROR_CODES.UNAUTHORIZED)).toBe(403);
    expect(catalogHttpStatusForErrorCode(MARKETPLACE_CATALOG_ERROR_CODES.NOT_FOUND)).toBe(404);
    expect(catalogHttpStatusForErrorCode(MARKETPLACE_CATALOG_ERROR_CODES.AGENT_UNKNOWN)).toBe(404);
    expect(catalogHttpStatusForErrorCode(MARKETPLACE_CATALOG_ERROR_CODES.DUPLICATE)).toBe(409);
    expect(catalogHttpStatusForErrorCode(MARKETPLACE_CATALOG_ERROR_CODES.VERSION_CONFLICT)).toBe(
      409,
    );
    expect(catalogHttpStatusForErrorCode(MARKETPLACE_CATALOG_ERROR_CODES.STATUS_TRANSITION)).toBe(
      422,
    );
    expect(catalogHttpStatusForErrorCode(MARKETPLACE_CATALOG_ERROR_CODES.AGENT_INACTIVE)).toBe(422);
  });

  it('maps unknown codes to 500', () => {
    expect(catalogHttpStatusForErrorCode('CATALOG_BOGUS')).toBe(500);
  });
});

describe('toCatalogHttpErrorBody', () => {
  it('hides internal error messages', () => {
    const body = toCatalogHttpErrorBody({
      code: MARKETPLACE_CATALOG_ERROR_CODES.INTERNAL,
      message: 'secret stack detail',
    });
    expect(body.error.message).toBe('Unexpected internal error.');
    expect(body.error.issues).toBeUndefined();
  });

  it('preserves client-facing messages and issues', () => {
    const body = toCatalogHttpErrorBody({
      code: MARKETPLACE_CATALOG_ERROR_CODES.INPUT_INVALID,
      message: 'Invalid input',
      issues: ['Capability "x" is unknown.'],
    });
    expect(body.error.message).toBe('Invalid input');
    expect(body.error.issues).toEqual(['Capability "x" is unknown.']);
  });
});
