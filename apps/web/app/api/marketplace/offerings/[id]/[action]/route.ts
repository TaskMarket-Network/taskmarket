import { NextResponse } from 'next/server';

import { getCatalogServices } from '../../../../../../lib/server/catalog';
import {
  catalogHttpStatusForErrorCode,
  toCatalogHttpErrorBody,
} from '../../../../../../lib/http-catalog';
import { toDisplayOffering } from '../../../../../../lib/display-catalog';
import { MARKETPLACE_CATALOG_ERROR_CODES } from '@taskmarket/catalog';
import { buildOfferingLifecycleRequest } from '../../../../../../lib/server/catalog-envelopes';

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

/** Archive or activate an owned service offering (idempotent). */
export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ readonly id: string; readonly action: string }> },
): Promise<Response> {
  const { id, action } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badJson();
  }
  if (!isRecord(body) || !Number.isInteger(body.version) || (body.version as number) < 1) {
    return badJson();
  }

  const { offeringService } = getCatalogServices();
  const response = await offeringService.handle(
    buildOfferingLifecycleRequest(action as 'archive' | 'activate', id, body.version as number),
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
