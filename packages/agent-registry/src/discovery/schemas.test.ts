import { describe, expect, it } from 'vitest';

import {
  capabilityDiscoveryItemSchema,
  capabilityDiscoveryQuerySchema,
  capabilityDiscoveryResultSchema,
} from './schemas.js';

describe('capabilityDiscoveryQuerySchema', () => {
  it('applies defaults for an empty query', () => {
    const parsed = capabilityDiscoveryQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toMatchObject({
        sortBy: 'relevance',
        sortDirection: 'desc',
        limit: 20,
        offset: 0,
      });
    }
  });

  it('accepts all filters', () => {
    const parsed = capabilityDiscoveryQuerySchema.safeParse({
      capabilities: ['wallet:read', 'agent:meta'],
      namespaces: ['storage', 'task-engine'],
      query: 'trade',
      sortBy: 'updatedAt',
      sortDirection: 'asc',
      limit: 50,
      offset: 10,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown fields (strict)', () => {
    expect(capabilityDiscoveryQuerySchema.safeParse({ frobnicate: true }).success).toBe(false);
  });

  it('rejects malformed capability keys and namespaces', () => {
    expect(
      capabilityDiscoveryQuerySchema.safeParse({ capabilities: ['WALLET:READ'] }).success,
    ).toBe(false);
    expect(capabilityDiscoveryQuerySchema.safeParse({ capabilities: ['wallet'] }).success).toBe(
      false,
    );
    expect(capabilityDiscoveryQuerySchema.safeParse({ namespaces: ['Bad_NS'] }).success).toBe(
      false,
    );
  });

  it('bounds limit, offset, and filter array sizes (DoS hardening)', () => {
    expect(capabilityDiscoveryQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(capabilityDiscoveryQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(capabilityDiscoveryQuerySchema.safeParse({ offset: -1 }).success).toBe(false);
    expect(capabilityDiscoveryQuerySchema.safeParse({ offset: 10_001 }).success).toBe(false);
    const tooMany = Array.from({ length: 51 }, (_, index) => `ns:key${index}`);
    expect(capabilityDiscoveryQuerySchema.safeParse({ capabilities: tooMany }).success).toBe(false);
  });
});

describe('capabilityDiscoveryItemSchema', () => {
  it('accepts a safe projection', () => {
    const parsed = capabilityDiscoveryItemSchema.safeParse({
      id: 'agent-1',
      name: 'Agent',
      description: '',
      capabilities: ['agent:meta'],
      endpoints: [{ id: 'e1', type: 'mcp', url: 'https://example.com/mcp' }],
      status: 'active',
      version: 1,
      updatedAt: '2023-11-14T22:13:20.000Z',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects endpoint metadata (safe projection excludes it)', () => {
    const parsed = capabilityDiscoveryItemSchema.safeParse({
      id: 'agent-1',
      name: 'Agent',
      description: '',
      capabilities: ['agent:meta'],
      endpoints: [
        {
          id: 'e1',
          type: 'mcp',
          url: 'https://example.com/mcp',
          metadata: { instructions: 'do x' },
        },
      ],
      status: 'active',
      version: 1,
      updatedAt: '2023-11-14T22:13:20.000Z',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects non-active statuses', () => {
    const base = {
      id: 'agent-1',
      name: 'Agent',
      description: '',
      capabilities: ['agent:meta'],
      endpoints: [],
      version: 1,
      updatedAt: '2023-11-14T22:13:20.000Z',
    };
    expect(capabilityDiscoveryItemSchema.safeParse({ ...base, status: 'draft' }).success).toBe(
      false,
    );
    expect(capabilityDiscoveryItemSchema.safeParse({ ...base, status: 'active' }).success).toBe(
      true,
    );
  });
});

describe('capabilityDiscoveryResultSchema', () => {
  it('accepts an empty paged result', () => {
    const parsed = capabilityDiscoveryResultSchema.safeParse({
      contractVersion: '1.0.0',
      total: 0,
      limit: 20,
      offset: 0,
      items: [],
    });
    expect(parsed.success).toBe(true);
  });
});
