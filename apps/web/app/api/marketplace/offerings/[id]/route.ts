import { NextResponse } from 'next/server';

import { getCatalogServices } from '../../../../../lib/server/catalog';
import {
  catalogHttpStatusForErrorCode,
  toCatalogHttpErrorBody,
} from '../../../../../lib/http-catalog';
import { toDisplayOffering } from '../../../../../lib/display-catalog';
import { MARKETPLACE_CATALOG_ERROR_CODES } from '@taskmarket/catalog';
import { buildUpdateOfferingRequest } from '../../../../../lib/server/catalog-envelopes';

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

/** Read a single owned service offering. */
export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
): Promise<Response> {
  const { id } = await params;
  const { offeringService } = getCatalogServices();
  const response = await offeringService.handle({
    contractVersion: offeringService.contractVersion(),
    requestId: 'get-offering',
    action: 'get',
    principal: 'dev-owner',
    payload: { offeringId: id },
  });
  if (!response.ok) {
    return NextResponse.json(toCatalogHttpErrorBody(response.error), {
      status: catalogHttpStatusForErrorCode(response.error.code),
    });
  }
  if (response.offering === undefined) {
    return NextResponse.json(
      toCatalogHttpErrorBody({
        code: MARKETPLACE_CATALOG_ERROR_CODES.INTERNAL,
        message: 'Unexpected internal error.',
      }),
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, offering: toDisplayOffering(response.offering) });
}

/** Update the mutable fields of an owned service offering. */
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
    !isRecord(body.update) ||
    !Number.isInteger(body.version) ||
    (body.version as number) < 1
  ) {
    return badJson();
  }

  const { offeringService } = getCatalogServices();
  const response = await offeringService.handle(
    buildUpdateOfferingRequest(id, body.version as number, body.update),
  );
  if (!response.ok) {
    return NextResponse.json(toCatalogHttpErrorBody(response.error), {
      status: catalogHttpStatusForErrorCode(response.error.code),
    });
  }
  if (response.offering === undefined) {
    return NextResponse.json(
      toCatalogHttpErrorBody({
        code: MARKETPLACE_CATALOG_ERROR_CODES.INTERNAL,
        message: 'Unexpected internal error.',
      }),
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, offering: toDisplayOffering(response.offering) });
}
