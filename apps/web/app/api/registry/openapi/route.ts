import { NextResponse } from 'next/server';

import { getRegistryServices } from '../../../../lib/server/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Generated OpenAPI 3.1 document for the agent registration API. */
export async function GET(): Promise<Response> {
  return NextResponse.json(getRegistryServices().registration.openapi());
}
