import { describe, expect, it } from 'vitest';

import { DEFAULT_AGENT_RUNTIME_CONFIG } from '../config.js';
import { createBaseTools } from '../tools.js';
import { buildAgentServiceOpenApi } from './openapi.js';
import { AGENT_SERVICE_CONTRACT_VERSION } from './version.js';

const tools = createBaseTools(
  DEFAULT_AGENT_RUNTIME_CONFIG,
  { getBalance: async ({ address }) => ({ address, balance: '0' }) },
  () => [],
);

describe('buildAgentServiceOpenApi', () => {
  it('produces a deterministic OpenAPI 3.1 document', () => {
    const document = buildAgentServiceOpenApi({
      tools,
      capabilities: ['agent:meta', 'wallet:read'],
    });
    expect(document.openapi).toBe('3.1.0');
    expect(document.info.version).toBe(AGENT_SERVICE_CONTRACT_VERSION);
    expect(Object.keys(document.paths).sort()).toEqual(['/capabilities', '/health', '/tool']);
  });

  it('documents every registered tool with its input schema', () => {
    const document = buildAgentServiceOpenApi({ tools, capabilities: [] });
    for (const tool of tools) {
      const request = document.components.schemas[`Tool.${tool.name}.Request`] as {
        required: string[];
        properties: { input: { type: string } };
      };
      expect(request).toBeDefined();
      expect(request.required).toContain('contractVersion');
      expect(request.required).toContain('requestId');
      expect(request.required).toContain('tool');
      expect(request.properties.input.type).toBe('object');
    }
  });

  it('registers the contract component schemas', () => {
    const document = buildAgentServiceOpenApi({ tools, capabilities: [] });
    const schemas = document.components.schemas;
    expect(Object.keys(schemas)).toContain('AgentServiceRequest');
    expect(Object.keys(schemas)).toContain('AgentServiceResponse');
    expect(Object.keys(schemas)).toContain('AgentServiceError');
    expect(Object.keys(schemas)).toContain('AgentServiceAuth');
    expect(Object.keys(schemas)).toContain('AgentServiceHealthResponse');
    expect(Object.keys(schemas)).toContain('AgentServiceCapabilitiesResponse');
  });

  it('uses oneOf over the registered tool request schemas on /tool', () => {
    const document = buildAgentServiceOpenApi({ tools, capabilities: [] });
    const path = document.paths['/tool'] as {
      post: { requestBody: { content: { 'application/json': { schema: { oneOf: unknown[] } } } } };
    };
    expect(path.post.requestBody.content['application/json'].schema.oneOf).toHaveLength(
      tools.length,
    );
  });

  it('emits a server when a baseUrl is provided', () => {
    const document = buildAgentServiceOpenApi({
      tools,
      capabilities: [],
      baseUrl: 'https://agent.example.com',
    });
    expect(document.servers).toEqual([{ url: 'https://agent.example.com' }]);
  });

  it('includes the declared capabilities in the description', () => {
    const document = buildAgentServiceOpenApi({ tools, capabilities: ['agent:meta'] });
    expect(document.info.description).toContain('agent:meta');
  });
});
