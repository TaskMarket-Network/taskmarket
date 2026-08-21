import { NextResponse } from 'next/server';

import { getCatalogServices } from '../../../../../lib/server/catalog';
import { catalogHttpStatusForErrorCode, toCatalogHttpErrorBody } from '../../../../../lib/http-catalog';
import { toDisplayListing } from '../../../../../lib/display-catalog';
import { buildCreateListingInput, type CreateListingForm } from '../../../../../lib/validate-catalog';
import { buildCreateListingRequest } from '../../../../../lib/server/catalog-envelopes';
import { MARKETPLACE_CATALOG_ERROR_CODES } from '@taskmarket/catalog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Create a new owned listing (idempotent by listing id). */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      toCatalogHttpErrorBody({
        code: MARKETPLACE_CATALOG_ERROR_CODES.REQUEST_INVALID,
        message: 'Invalid JSON body.',
      }),
      { status: 400 },
    );
  }
  if (!isRecord(body) || !isRecord(body.form)) {
    return NextResponse.json(
      toCatalogHttpErrorBody({
        code: MARKETPLACE_CATALOG_ERROR_CODES.REQUEST_INVALID,
        message: 'Invalid request body.',
      }),
      { status: 400 },
    );
  }
  const form = body.form as unknown as CreateListingForm;
  const parsed = buildCreateListingInput(form);
  if (parsed.issues.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: MARKETPLACE_CATALOG_ERROR_CODES.INPUT_INVALID,
          message: parsed.issues.join('; '),
          issues: parsed.issues,
        },
      },
      { status: 400 },
    );
  }

  const { catalog } = getCatalogServices();
  const response = await catalog.handle(buildCreateListingRequest(parsed.input));
  if (!response.ok) {
    return NextResponse.json(toCatalogHttpErrorBody(response.error), {
      status: catalogHttpStatusForErrorCode(response.error.code),
    });
  }
  if (response.listing === undefined) {
    return NextResponse.json(
      toCatalogHttpErrorBody({
        code: MARKETPLACE_CATALOG_ERROR_CODES.INTERNAL,
        message: 'Unexpected internal error.',
      }),
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, listing: toDisplayListing(response.listing) });
}