import { NextResponse } from 'next/server';

import { getCatalogServices } from '../../../../../lib/server/catalog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Generated OpenAPI 3.1 document for the marketplace catalog API. */
export async function GET(): Promise<Response> {
  return NextResponse.json(getCatalogServices().catalog.openapi());
}