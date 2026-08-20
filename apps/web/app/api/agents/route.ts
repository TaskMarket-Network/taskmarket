import { AGENT_REGISTRY_ERROR_CODES } from '@taskmarket/agent-registry';
import { NextResponse } from 'next/server';

import { toDisplayAgent } from '../../../lib/display';
import { httpStatusForErrorCode, toHttpErrorBody } from '../../../lib/http';
import { buildRegisterRequest } from '../../../lib/server/envelopes';
import { getRegistryServices } from '../../../lib/server/registry';
import { buildCreateAgentInput, type CreateAgentForm } from '../../../lib/validate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function badJson() {
  return NextResponse.json(
    toHttpErrorBody({
      code: AGENT_REGISTRY_ERROR_CODES.REQUEST_INVALID,
      message: 'Invalid JSON body.',
    }),
    { status: 400 },
  );
}

/** Register a new agent on behalf of the dashboard principal. */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badJson();
  }
  if (!isRecord(body)) {
    return badJson();
  }
  const form = body as unknown as CreateAgentForm;

  const parsed = buildCreateAgentInput(form);
  if (parsed.input === null) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: AGENT_REGISTRY_ERROR_CODES.INPUT_INVALID,
          message: parsed.issues.join('; '),
          issues: parsed.issues,
        },
      },
      { status: 400 },
    );
  }

  const { registration } = getRegistryServices();
  const response = await registration.handle(buildRegisterRequest(form));
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
  return NextResponse.json({ ok: true, agent: toDisplayAgent(response.agent) }, { status: 201 });
}
