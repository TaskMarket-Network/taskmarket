import { describe, expect, it } from 'vitest';

import { buildCapabilityDiscoveryOpenApi } from './openapi.js';
import { CAPABILITY_DISCOVERY_API_VERSION } from './version.js';

function referencedNames(schema: unknown): string[] {
  const names = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
    } else if (typeof value === 'object' && value !== null) {
      const record = value as Record<string, unknown>;
      if (typeof record.$ref === 'string') {
        const name = record.$ref.replace('#/components/schemas/', '');
        if (name !== record.$ref) {
          names.add(name);
        }
      }
      for (const item of Object.values(record)) {
        visit(item);
      }
    }
  };
  visit(schema);
  return [...names];
}

describe('buildCapabilityDiscoveryOpenApi', () => {
  it('describes a single POST search operation', () => {
    const document = buildCapabilityDiscoveryOpenApi();
    expect(document.openapi).toBe('3.1.0');
    const operation = (document.paths['/capabilities/search'] as { post: Record<string, unknown> })
      .post;
    expect(operation.operationId).toBe('searchCapabilities');
    expect(operation.requestBody).toBeDefined();
    expect(operation.responses).toBeDefined();
  });

  it('defaults the info block and honors overrides', () => {
    const defaults = buildCapabilityDiscoveryOpenApi();
    expect(defaults.info.title).toBe('TaskMarket Capability Discovery');
    expect(defaults.info.version).toBe(CAPABILITY_DISCOVERY_API_VERSION);
    expect(defaults.servers).toBeUndefined();

    const custom = buildCapabilityDiscoveryOpenApi({
      serviceName: 'Discovery',
      baseUrl: 'https://api.taskmarket.example.com',
    });
    expect(custom.info.title).toBe('Discovery');
    expect(custom.servers).toEqual([{ url: 'https://api.taskmarket.example.com' }]);
  });

  it('includes the query, result, item, and error schemas with no dangling refs', () => {
    const document = buildCapabilityDiscoveryOpenApi();
    const schemas = document.components.schemas;
    expect(schemas.CapabilityDiscoveryQuery).toBeDefined();
    expect(schemas.CapabilityDiscoveryResult).toBeDefined();
    expect(schemas.CapabilityDiscoveryItem).toBeDefined();
    expect(schemas.CapabilityDiscoveryError).toBeDefined();

    const defined = new Set(Object.keys(schemas));
    for (const name of referencedNames(document)) {
      expect(defined.has(name), `missing component schema "${name}"`).toBe(true);
    }
  });
});
