import { NextResponse } from 'next/server';

import { getCatalogServices } from '../../../../lib/server/catalog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** List the dashboard owner's own listings (owner-scoped, read-only). */
export async function GET(): Promise<Response> {
  const { catalog, agents } = getCatalogServices();
  const response = await catalog.handle({
    contractVersion: catalog.contractVersion(),
    requestId: 'list-own',
    action: 'list',
    principal: 'dev-owner',
    payload: {},
  });
  if (!response.ok) {
    return NextResponse.json({ ok: false, error: response.error }, { status: 400 });
  }
  const agentNames = new Map((await agents.listAll()).map((agent) => [agent.id, agent.name]));
  return NextResponse.json({
    ok: true,
    listings: response.listings,
    agentNames: Object.fromEntries(agentNames),
  });
}