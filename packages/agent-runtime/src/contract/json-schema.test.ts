import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AgentRuntimeError, AGENT_RUNTIME_CONTRACT_ERROR_CODES } from '../errors.js';
import { zodToJsonSchema } from './json-schema.js';

describe('zodToJsonSchema', () => {
  it('converts strings with regex patterns and length checks', () => {
    const schema = z
      .string()
      .min(2)
      .max(64)
      .regex(/^0x[a-fA-F0-9]{40}$/);
    expect(zodToJsonSchema(schema)).toEqual({
      type: 'string',
      pattern: '^0x[a-fA-F0-9]{40}$',
      minLength: 2,
      maxLength: 64,
    });
  });

  it('converts enums', () => {
    expect(zodToJsonSchema(z.enum(['goat-testnet', 'goat-mainnet']))).toEqual({
      type: 'string',
      enum: ['goat-testnet', 'goat-mainnet'],
    });
  });

  it('converts objects with required and optional properties', () => {
    const schema = z
      .object({
        address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        tokenAddress: z.string().optional(),
      })
      .strict();
    expect(zodToJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        address: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
        tokenAddress: { type: 'string' },
      },
      required: ['address'],
      additionalProperties: false,
    });
  });

  it('marks passthrough objects as open', () => {
    expect(zodToJsonSchema(z.object({ a: z.string() }).passthrough())).toMatchObject({
      type: 'object',
      additionalProperties: true,
    });
  });

  it('converts arrays, literals, numbers, booleans, records, and unknown', () => {
    expect(zodToJsonSchema(z.array(z.string()))).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
    expect(zodToJsonSchema(z.literal('goat-testnet'))).toEqual({ const: 'goat-testnet' });
    expect(zodToJsonSchema(z.number().int().positive().max(60_000))).toEqual({
      type: 'integer',
      exclusiveMinimum: 0,
      maximum: 60_000,
    });
    expect(zodToJsonSchema(z.boolean())).toEqual({ type: 'boolean' });
    expect(zodToJsonSchema(z.record(z.string()))).toEqual({
      type: 'object',
      additionalProperties: { type: 'string' },
    });
    expect(zodToJsonSchema(z.unknown())).toEqual({});
  });

  it('unwraps optional, nullable, default, and effects wrappers', () => {
    expect(zodToJsonSchema(z.string().optional())).toEqual({ type: 'string' });
    expect(zodToJsonSchema(z.string().nullable())).toEqual({ type: 'string' });
    expect(zodToJsonSchema(z.string().default('x'))).toEqual({ type: 'string' });
    expect(zodToJsonSchema(z.string().refine(() => true))).toEqual({ type: 'string' });
    expect(zodToJsonSchema(z.custom(() => true))).toEqual({});
  });

  it('converts unions into anyOf', () => {
    const schema = z.union([z.string(), z.number()]);
    expect(zodToJsonSchema(schema)).toEqual({
      anyOf: [{ type: 'string' }, { type: 'number' }],
    });
  });

  it('throws a structured error for unsupported schemas', () => {
    const unsupported = z.date();
    expect(() => zodToJsonSchema(unsupported)).toThrowError(AgentRuntimeError);
    try {
      zodToJsonSchema(unsupported);
    } catch (error) {
      expect(error).toBeInstanceOf(AgentRuntimeError);
      expect((error as AgentRuntimeError).code).toBe(
        AGENT_RUNTIME_CONTRACT_ERROR_CODES.SCHEMA_UNSUPPORTED,
      );
    }
  });
});
