import { NextResponse } from 'next/server';

import { getCatalogServices } from '../../../../lib/server/catalog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** List the dashboard owner's own service offerings (owner-scoped). */
export async function GET(): Promise<Response> {
  const { offeringService } = getCatalogServices();
  const response = await offeringService.handle({
    contractVersion: offeringService.contractVersion(),
    requestId: 'list-offerings',
    action: 'list',
    principal: 'dev-owner',
    payload: {},
  });
  if (!response.ok) {
    return NextResponse.json({ ok: false, error: response.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, offerings: response.offerings });
}