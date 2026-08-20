import { AGENT_REGISTRY_ERROR_CODES } from '@taskmarket/agent-registry';
import { NextResponse } from 'next/server';

import { toDisplayAgent } from '../../../../lib/display';
import { httpStatusForErrorCode, toHttpErrorBody } from '../../../../lib/http';
import { buildUpdateRequest } from '../../../../lib/server/envelopes';
import { getRegistryServices } from '../../../../lib/server/registry';
import { buildUpdateInput, type EditAgentForm } from '../../../../lib/validate';

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

/** Update the mutable fields of an owned agent (optimistic concurrency). */
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
  const form = body.form as unknown as EditAgentForm;

  const parsed = buildUpdateInput(form);
  if (parsed.update === null) {
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
  const response = await registration.handle(buildUpdateRequest(id, body.version as number, form));
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
