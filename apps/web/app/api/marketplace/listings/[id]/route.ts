import { NextResponse } from 'next/server';

import { buildUpdateListingRequest } from '../../../../../lib/server/catalog-envelopes';
import { getCatalogServices } from '../../../../../lib/server/catalog';
import {
  catalogHttpStatusForErrorCode,
  toCatalogHttpErrorBody,
} from '../../../../../lib/http-catalog';
import { toDisplayListing } from '../../../../../lib/display-catalog';
import { buildUpdateListingInput, type EditListingForm } from '../../../../../lib/validate-catalog';
import { getDashboardPrincipal } from '../../../../../lib/env';
import { MARKETPLACE_CATALOG_ERROR_CODES } from '@taskmarket/catalog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function badJson() {
  return NextResponse.json(
    toCatalogHttpErrorBody({
      code: MARKETPLACE_CATALOG_ERROR_CODES.REQUEST_INVALID,
      message: 'Invalid JSON body.',
    }),
    { status: 400 },
  );
}

/** Read a single owned listing. */
export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
): Promise<Response> {
  const { id } = await params;
  const { catalog } = getCatalogServices();
  const response = await catalog.handle({
    contractVersion: catalog.contractVersion(),
    requestId: 'get-listing',
    action: 'get',
    principal: getDashboardPrincipal(),
    payload: { listingId: id },
  });
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

/** Update the mutable fields of an owned listing (optimistic concurrency). */
export async function PATCH(
  request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
): Promise<Response> {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badJson();
  }
  if (
    !isRecord(body) ||
    !isRecord(body.form) ||
    !Number.isInteger(body.version) ||
    (body.version as number) < 1
  ) {
    return badJson();
  }
  const form = body.form as unknown as EditListingForm;
  const parsed = buildUpdateListingInput(form);
  if (parsed.update === null) {
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
  const response = await catalog.handle(
    buildUpdateListingRequest(id, body.version as number, parsed.update),
  );
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
