import { describe, expect, it } from 'vitest';

import { DEFAULT_AGENT_RUNTIME_CONFIG } from '../config.js';
import { AGENT_RUNTIME_CONTRACT_ERROR_CODES } from '../errors.js';
import { createStructuredLogger, type StructuredLogEntry } from '../observability.js';
import { createAgentRuntime, type AgentRuntime } from '../runtime.js';
import { createAgentService, type AgentService } from './service.js';
import { AGENT_SERVICE_CONTRACT_VERSION } from './version.js';

const FIXED_NOW = 1_700_000_000_000;

function makeService(options: Parameters<typeof createAgentService>[1] = {}): {
  agent: AgentRuntime;
  service: AgentService;
  logs: StructuredLogEntry[];
} {
  const logs: StructuredLogEntry[] = [];
  const logger = createStructuredLogger({
    sink: (entry) => logs.push(entry),
    now: () => FIXED_NOW,
  });
  const agent = createAgentRuntime(DEFAULT_AGENT_RUNTIME_CONFIG, {
    clock: () => FIXED_NOW,
    requestIdFactory: () => 'req-0001',
    logger,
  });
  return {
    agent,
    service: createAgentService(agent, { clock: () => FIXED_NOW, ...options }),
    logs,
  };
}

const VALID_REQUEST = {
  contractVersion: AGENT_SERVICE_CONTRACT_VERSION,
  requestId: 'req-abc',
  tool: 'agent.ping',
  input: {},
};

describe('createAgentService — parseRequest', () => {
  it('accepts a valid request envelope', () => {
    const { service } = makeService();
    const result = service.parseRequest(VALID_REQUEST);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.tool).toBe('agent.ping');
      expect(result.request.requestId).toBe('req-abc');
    }
  });

  it('rejects a malformed envelope with a structured error', () => {
    const { service } = makeService();
    const result = service.parseRequest({ tool: 'agent.ping' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(AGENT_RUNTIME_CONTRACT_ERROR_CODES.REQUEST_INVALID);
    }
  });

  it('rejects an unsupported contract version', () => {
    const { service } = makeService();
    const result = service.parseRequest({ ...VALID_REQUEST, contractVersion: '9.9.9' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(AGENT_RUNTIME_CONTRACT_ERROR_CODES.UNSUPPORTED_VERSION);
    }
  });

  it('rejects unsafe request identifiers', () => {
    const { service } = makeService();
    const result = service.parseRequest({ ...VALID_REQUEST, requestId: 'bad id' });
    expect(result.ok).toBe(false);
  });
});

describe('createAgentService — execute', () => {
  it('runs a tool and returns a structured response', async () => {
    const { service } = makeService();
    const response = await service.execute(VALID_REQUEST);
    expect(response).toMatchObject({
      contractVersion: AGENT_SERVICE_CONTRACT_VERSION,
      requestId: 'req-abc',
      tool: 'agent.ping',
      ok: true,
      attempts: 1,
      latencyMs: 0,
    });
    expect(response.output).toMatchObject({ pong: true });
  });

  it('echoes the caller-supplied requestId and records the trace', async () => {
    const { service } = makeService();
    const response = await service.execute(VALID_REQUEST);
    expect(response.requestId).toBe('req-abc');
    expect(response.traceId).toBe('tmr_req-0001');
  });

  it('passes through idempotency and timeout options', async () => {
    const { service } = makeService();
    const response = await service.execute({
      ...VALID_REQUEST,
      idempotencyKey: 'ping-1',
      timeoutMs: 5_000,
    });
    expect(response.ok).toBe(true);
  });

  it('returns a structured error for an unknown tool', async () => {
    const { service } = makeService();
    const response = await service.execute({ ...VALID_REQUEST, tool: 'nope.missing' });
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe('AGENT_RUNTIME_TOOL_NOT_FOUND');
  });

  it('returns a structured error for invalid tool input', async () => {
    const { service } = makeService();
    const response = await service.execute({
      ...VALID_REQUEST,
      tool: 'wallet.balance',
      input: { address: 'nope' },
    });
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe('AGENT_RUNTIME_INPUT_INVALID');
  });

  it('fails safely on a malformed payload instead of throwing', async () => {
    const { service } = makeService();
    const response = await service.execute({ tool: 'agent.ping' });
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe(AGENT_RUNTIME_CONTRACT_ERROR_CODES.REQUEST_INVALID);
    expect(response.requestId).toBe('tmc_unknown');
  });

  it('sanitizes an unsafe requestId from a malformed payload', async () => {
    const { service } = makeService();
    const response = await service.execute({ requestId: 'bad id', tool: 'agent.ping' });
    expect(response.requestId).toBe('tmc_unknown');
  });
});

describe('createAgentService — introspection', () => {
  it('reports the contract version', () => {
    const { service } = makeService();
    expect(service.contractVersion()).toBe(AGENT_SERVICE_CONTRACT_VERSION);
  });

  it('reports capabilities and tools', () => {
    const { service } = makeService();
    const capabilities = service.capabilities();
    expect(capabilities).toMatchObject({
      contractVersion: AGENT_SERVICE_CONTRACT_VERSION,
      agentId: 'taskmarket-reference',
      version: '0.1.0',
      capabilities: ['agent:meta', 'wallet:read'],
    });
    expect(capabilities.tools).toHaveLength(4);
  });

  it('reports a healthy service with identity', () => {
    const { service } = makeService();
    const health = service.health();
    expect(health).toMatchObject({
      contractVersion: AGENT_SERVICE_CONTRACT_VERSION,
      ok: true,
      agentId: 'taskmarket-reference',
      network: 'goat-testnet',
    });
    expect(health.checkedAt).toBe('2023-11-14T22:13:20.000Z');
  });

  it('generates OpenAPI documentation for the registered tools', () => {
    const { service } = makeService();
    const document = service.openapi();
    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.paths).sort()).toEqual(['/capabilities', '/health', '/tool']);
    expect(Object.keys(document.components.schemas)).toContain('Tool.agent.ping.Request');
  });
});
