import { describe, expect, it } from 'vitest';

import { buildAgentRegistrationOpenApi } from './openapi.js';
import { AGENT_REGISTRATION_API_VERSION } from './version.js';

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

describe('buildAgentRegistrationOpenApi', () => {
  it('describes the five operations as POST endpoints', () => {
    const document = buildAgentRegistrationOpenApi();
    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.paths)).toEqual([
      '/agents/register',
      '/agents/update',
      '/agents/get',
      '/agents/disable',
      '/agents/validate',
    ]);
    for (const path of Object.values(document.paths)) {
      const operation = (path as { post: Record<string, unknown> }).post;
      expect(operation).toBeDefined();
      expect(operation.operationId).toMatch(/^agent[A-Z]/);
    }
  });

  it('defaults the info block and honors overrides', () => {
    const defaults = buildAgentRegistrationOpenApi();
    expect(defaults.info.title).toBe('TaskMarket Agent Registration API');
    expect(defaults.info.version).toBe(AGENT_REGISTRATION_API_VERSION);
    expect(defaults.servers).toBeUndefined();

    const custom = buildAgentRegistrationOpenApi({
      serviceName: 'Registry',
      serviceVersion: '2.0.0',
      baseUrl: 'https://api.taskmarket.example.com',
    });
    expect(custom.info.title).toBe('Registry');
    expect(custom.info.version).toBe('2.0.0');
    expect(custom.servers).toEqual([{ url: 'https://api.taskmarket.example.com' }]);
  });

  it('includes the envelope, error, RegisteredAgent, and payload schemas', () => {
    const document = buildAgentRegistrationOpenApi();
    const schemas = document.components.schemas;
    expect(schemas.AgentRegistrationRequest).toBeDefined();
    expect(schemas.AgentRegistrationResponse).toBeDefined();
    expect(schemas.AgentRegistrationError).toBeDefined();
    expect(schemas.RegisteredAgent).toBeDefined();
    expect(schemas['Payload.Register']).toBeDefined();
    expect(schemas['Payload.Update']).toBeDefined();
    expect(schemas['Payload.Get']).toBeDefined();
    expect(schemas['Payload.Disable']).toBeDefined();
    expect(schemas['Payload.Validate']).toBeDefined();
  });

  it('has no dangling schema references', () => {
    const document = buildAgentRegistrationOpenApi();
    const defined = new Set(Object.keys(document.components.schemas));
    const referenced = referencedNames(document);
    for (const name of referenced) {
      expect(defined.has(name), `missing component schema "${name}"`).toBe(true);
    }
  });

  it('types each operation payload with the matching payload schema', () => {
    const document = buildAgentRegistrationOpenApi();
    const registerRequest = document.components.schemas['Operation.register.Request'] as {
      properties: { payload?: { $ref?: string } };
    };
    expect(registerRequest.properties.payload).toEqual({
      $ref: '#/components/schemas/Payload.Register',
    });
    expect(
      (
        document.components.schemas['Operation.disable.Request'] as {
          properties: { payload?: { $ref?: string } };
        }
      ).properties.payload,
    ).toEqual({
      $ref: '#/components/schemas/Payload.Disable',
    });
  });
});
