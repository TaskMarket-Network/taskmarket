import { NextResponse } from 'next/server';

import { getCatalogServices } from '../../../../../lib/server/catalog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Generated OpenAPI 3.1 document for marketplace search. */
export async function GET(): Promise<Response> {
  return NextResponse.json(getCatalogServices().search.openapi());
}