import { describe, expect, it } from 'vitest';

import {
  agentServiceAuthSchema,
  agentServiceRequestIdSchema,
  agentServiceRequestSchema,
  agentServiceResponseSchema,
} from './schemas.js';

const VALID_REQUEST = {
  contractVersion: '1.0.0',
  requestId: 'req-123',
  tool: 'agent.ping',
  input: {},
};

describe('agentServiceRequestIdSchema', () => {
  it('accepts URL-safe identifiers', () => {
    expect(agentServiceRequestIdSchema.safeParse('req_123.A.b-c').success).toBe(true);
  });

  it('rejects empty, oversized, and unsafe identifiers', () => {
    expect(agentServiceRequestIdSchema.safeParse('').success).toBe(false);
    expect(agentServiceRequestIdSchema.safeParse('a'.repeat(129)).success).toBe(false);
    expect(agentServiceRequestIdSchema.safeParse('bad id with spaces').success).toBe(false);
    expect(agentServiceRequestIdSchema.safeParse('bad;id').success).toBe(false);
  });
});

describe('agentServiceRequestSchema', () => {
  it('accepts a minimal valid request', () => {
    expect(agentServiceRequestSchema.safeParse(VALID_REQUEST).success).toBe(true);
  });

  it('accepts the full option set and auth placeholder', () => {
    const parsed = agentServiceRequestSchema.safeParse({
      ...VALID_REQUEST,
      idempotencyKey: 'ping-1',
      timeoutMs: 5_000,
      confirmed: false,
      caller: 'buyer-42',
      auth: { scheme: 'bearer', principal: 'agent-1' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an invalid requestId', () => {
    expect(
      agentServiceRequestSchema.safeParse({ ...VALID_REQUEST, requestId: 'no spaces' }).success,
    ).toBe(false);
  });

  it('rejects an out-of-range timeout', () => {
    expect(agentServiceRequestSchema.safeParse({ ...VALID_REQUEST, timeoutMs: 0 }).success).toBe(
      false,
    );
    expect(
      agentServiceRequestSchema.safeParse({ ...VALID_REQUEST, timeoutMs: 60_001 }).success,
    ).toBe(false);
    expect(agentServiceRequestSchema.safeParse({ ...VALID_REQUEST, timeoutMs: 1.5 }).success).toBe(
      false,
    );
  });

  it('rejects an unknown auth scheme', () => {
    expect(
      agentServiceRequestSchema.safeParse({
        ...VALID_REQUEST,
        auth: { scheme: 'oauth2' as never },
      }).success,
    ).toBe(false);
  });

  it('rejects unknown envelope keys (strict)', () => {
    expect(agentServiceRequestSchema.safeParse({ ...VALID_REQUEST, surprises: true }).success).toBe(
      false,
    );
  });
});

describe('agentServiceAuthSchema', () => {
  it('requires a known scheme and only a placeholder principal', () => {
    expect(agentServiceAuthSchema.safeParse({ scheme: 'api-key' }).success).toBe(true);
    expect(
      agentServiceAuthSchema.safeParse({ scheme: 'bearer', principal: 'agent-1' }).success,
    ).toBe(true);
    expect(agentServiceAuthSchema.safeParse({}).success).toBe(false);
  });
});

describe('agentServiceResponseSchema', () => {
  const base = {
    contractVersion: '1.0.0',
    requestId: 'req-123',
    traceId: 'tmr_req-123',
    tool: 'agent.ping',
    ok: true,
    latencyMs: 0,
    attempts: 1,
    timestamp: '2023-11-14T22:13:20.000Z',
  };

  it('accepts a successful response with output', () => {
    expect(agentServiceResponseSchema.safeParse({ ...base, output: { pong: true } }).success).toBe(
      true,
    );
  });

  it('accepts a failed response with a structured error', () => {
    expect(
      agentServiceResponseSchema.safeParse({
        ...base,
        ok: false,
        error: { code: 'AGENT_RUNTIME_TOOL_NOT_FOUND', message: 'Unknown tool: nope' },
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown contract version', () => {
    expect(
      agentServiceResponseSchema.safeParse({ ...base, contractVersion: '9.9.9' }).success,
    ).toBe(false);
  });

  it('rejects missing required fields and unknown keys', () => {
    expect(agentServiceResponseSchema.safeParse({ ...base, ok: undefined }).success).toBe(false);
    expect(agentServiceResponseSchema.safeParse({ ...base, surprises: true }).success).toBe(false);
  });
});
