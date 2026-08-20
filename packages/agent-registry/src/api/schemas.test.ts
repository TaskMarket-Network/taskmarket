import { describe, expect, it } from 'vitest';

import {
  agentDisablePayloadSchema,
  agentGetPayloadSchema,
  agentRegisterPayloadSchema,
  agentRegistrationErrorSchema,
  agentRegistrationRequestIdSchema,
  agentRegistrationRequestSchema,
  agentRegistrationResponseSchema,
  agentUpdatePayloadSchema,
  agentValidatePayloadSchema,
} from './schemas.js';
import { AGENT_REGISTRATION_API_VERSION } from './version.js';

const REQUEST_ID = 'req_0001';
const PRINCIPAL = 'owner-1';

function envelope(
  payload: unknown,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    contractVersion: AGENT_REGISTRATION_API_VERSION,
    requestId: REQUEST_ID,
    action: 'register',
    principal: PRINCIPAL,
    payload,
    ...overrides,
  };
}

describe('agentRegistrationRequestIdSchema', () => {
  it('accepts URL-safe request ids', () => {
    expect(agentRegistrationRequestIdSchema.safeParse('req_123.a-b').success).toBe(true);
  });

  it('rejects unsafe characters', () => {
    expect(agentRegistrationRequestIdSchema.safeParse('req/123').success).toBe(false);
    expect(agentRegistrationRequestIdSchema.safeParse('').success).toBe(false);
  });
});

describe('agentRegistrationRequestSchema', () => {
  it('accepts a well-formed envelope with an unknown payload', () => {
    const parsed = agentRegistrationRequestSchema.safeParse(envelope({}));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.action).toBe('register');
      expect(parsed.data.principal).toBe(PRINCIPAL);
    }
  });

  it('rejects unknown fields (strict)', () => {
    expect(agentRegistrationRequestSchema.safeParse({ ...envelope({}), extra: 1 }).success).toBe(
      false,
    );
  });

  it('rejects a missing principal or invalid action', () => {
    const withoutPrincipal = {
      contractVersion: AGENT_REGISTRATION_API_VERSION,
      requestId: REQUEST_ID,
      action: 'register',
      payload: {},
    };
    expect(agentRegistrationRequestSchema.safeParse(withoutPrincipal).success).toBe(false);
    expect(
      agentRegistrationRequestSchema.safeParse(envelope({}, { action: 'explode' })).success,
    ).toBe(false);
  });
});

describe('per-action payload schemas', () => {
  it('register accepts a minimal profile input', () => {
    const parsed = agentRegisterPayloadSchema.safeParse({
      ownerRef: PRINCIPAL,
      name: 'Ref Agent',
      capabilities: ['agent:meta'],
    });
    expect(parsed.success).toBe(true);
  });

  it('register rejects immutable fields (id allowed, ownerRef required)', () => {
    expect(
      agentRegisterPayloadSchema.safeParse({ name: 'No owner', capabilities: ['agent:meta'] })
        .success,
    ).toBe(false);
  });

  it('update requires agentId, version, and at least one change', () => {
    expect(
      agentUpdatePayloadSchema.safeParse({ agentId: 'a', version: 1, update: { name: 'New' } })
        .success,
    ).toBe(true);
    expect(
      agentUpdatePayloadSchema.safeParse({ agentId: 'a', version: 0, update: { name: 'New' } })
        .success,
    ).toBe(false);
    expect(
      agentUpdatePayloadSchema.safeParse({ agentId: 'a', version: 1, update: {} }).success,
    ).toBe(false);
  });

  it('update rejects immutable-field attempts (strict update schema)', () => {
    const result = agentUpdatePayloadSchema.safeParse({
      agentId: 'a',
      version: 1,
      update: { ownerRef: 'someone-else' },
    });
    expect(result.success).toBe(false);
  });

  it('get and disable require agentId (disable also version)', () => {
    expect(agentGetPayloadSchema.safeParse({ agentId: 'a' }).success).toBe(true);
    expect(agentGetPayloadSchema.safeParse({}).success).toBe(false);
    expect(agentDisablePayloadSchema.safeParse({ agentId: 'a', version: 1 }).success).toBe(true);
    expect(agentDisablePayloadSchema.safeParse({ agentId: 'a' }).success).toBe(false);
  });

  it('validate requires a candidate payload (handler validates it)', () => {
    expect(
      agentValidatePayloadSchema.safeParse({
        candidate: { ownerRef: PRINCIPAL, name: 'X', capabilities: ['agent:meta'] },
      }).success,
    ).toBe(true);
    expect(agentValidatePayloadSchema.safeParse({}).success).toBe(false);
    expect(agentValidatePayloadSchema.safeParse({ candidate: 'not-an-object' }).success).toBe(true);
  });
});

describe('agentRegistrationResponseSchema', () => {
  it('accepts an ok response carrying an agent', () => {
    const agent = {
      id: 'agent-0001',
      ownerRef: PRINCIPAL,
      name: 'Ref Agent',
      description: '',
      capabilities: ['agent:meta'],
      endpoints: [],
      status: 'draft',
      version: 1,
      createdAt: '2023-11-14T22:13:20.000Z',
      updatedAt: '2023-11-14T22:13:20.000Z',
    };
    const parsed = agentRegistrationResponseSchema.safeParse({
      contractVersion: AGENT_REGISTRATION_API_VERSION,
      requestId: REQUEST_ID,
      action: 'register',
      ok: true,
      agent,
      timestamp: '2023-11-14T22:13:20.000Z',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a failed response carrying a structured error', () => {
    const parsed = agentRegistrationResponseSchema.safeParse({
      contractVersion: AGENT_REGISTRATION_API_VERSION,
      requestId: REQUEST_ID,
      action: 'update',
      ok: false,
      error: { code: 'AGENT_REGISTRY_NOT_FOUND', message: 'Agent "a" was not found.' },
      timestamp: '2023-11-14T22:13:20.000Z',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects responses with unknown fields (strict)', () => {
    expect(
      agentRegistrationResponseSchema.safeParse({
        contractVersion: AGENT_REGISTRATION_API_VERSION,
        requestId: REQUEST_ID,
        action: 'get',
        ok: true,
        timestamp: '2023-11-14T22:13:20.000Z',
        stray: 1,
      }).success,
    ).toBe(false);
  });

  it('error schema carries optional issues', () => {
    const parsed = agentRegistrationErrorSchema.safeParse({
      code: 'AGENT_REGISTRY_INPUT_INVALID',
      message: 'bad',
      issues: ['a', 'b'],
    });
    expect(parsed.success).toBe(true);
  });
});
