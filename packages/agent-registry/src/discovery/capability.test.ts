import { describe, expect, it } from 'vitest';

import { capabilityNamespace, normalizeCapability } from './capability.js';

describe('normalizeCapability', () => {
  it('splits a capability key into namespace and name', () => {
    expect(normalizeCapability('wallet:read')).toEqual({
      key: 'wallet:read',
      namespace: 'wallet',
      name: 'read',
    });
    expect(normalizeCapability('agent:meta')).toEqual({
      key: 'agent:meta',
      namespace: 'agent',
      name: 'meta',
    });
    expect(normalizeCapability('task-engine:create-and-release')).toEqual({
      key: 'task-engine:create-and-release',
      namespace: 'task-engine',
      name: 'create-and-release',
    });
  });

  it('rejects non-capability strings', () => {
    for (const value of [
      '',
      'read',
      'wallet',
      'WALLET:READ',
      'wallet:',
      ':read',
      'wallet:Read',
      'wallet:read:extra',
      'wallet:read extra',
      'wal let:read',
    ]) {
      expect(normalizeCapability(value), value).toBeNull();
    }
  });
});

describe('capabilityNamespace', () => {
  it('returns the namespace of a valid key', () => {
    expect(capabilityNamespace('wallet:read')).toBe('wallet');
  });

  it('returns null for an invalid key', () => {
    expect(capabilityNamespace('not-a-capability')).toBeNull();
  });
});
