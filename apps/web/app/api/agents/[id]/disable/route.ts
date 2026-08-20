import { AGENT_REGISTRY_ERROR_CODES } from '@taskmarket/agent-registry';
import { NextResponse } from 'next/server';

import { toDisplayAgent } from '../../../../../lib/display';
import { httpStatusForErrorCode, toHttpErrorBody } from '../../../../../lib/http';
import { buildDisableRequest } from '../../../../../lib/server/envelopes';
import { getRegistryServices } from '../../../../../lib/server/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Retire an owned agent (idempotent; optimistic concurrency enforced). */
export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
): Promise<Response> {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      toHttpErrorBody({
        code: AGENT_REGISTRY_ERROR_CODES.REQUEST_INVALID,
        message: 'Invalid JSON body.',
      }),
      { status: 400 },
    );
  }
  if (!isRecord(body) || !Number.isInteger(body.version) || (body.version as number) < 1) {
    return NextResponse.json(
      toHttpErrorBody({
        code: AGENT_REGISTRY_ERROR_CODES.REQUEST_INVALID,
        message: 'Invalid request body.',
      }),
      { status: 400 },
    );
  }

  const { registration } = getRegistryServices();
  const response = await registration.handle(buildDisableRequest(id, body.version as number));
  if (!response.ok) {
    return NextResponse.json(toHttpErrorBody(response.error), {
      status: httpStatusForErrorCode(response.error.code),
    });
  }
  if (response.agent === undefined) {
    return NextResponse.json(
      toHttpErrorBody({
        code: AGENT_REGISTRY_ERROR_CODES.INTERNAL,
        message: 'Unexpected internal error.',
      }),
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, agent: toDisplayAgent(response.agent) });
}
