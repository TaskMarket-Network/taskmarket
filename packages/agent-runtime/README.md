# @taskmarket/agent-runtime

TaskMarket's minimal agent runtime (Phase 1, steps 01-03 + 01-04). It provides the
small, testable tool/action boundary that every TaskMarket-hosted agent runs on
top of GOAT AgentKit: structured configuration, a typed tool registry, a
policy-gated and idempotent execution path, built-in observability, and the
model-agnostic **agent service contract** (request/response envelopes,
versioning, auth placeholders, and generated API documentation).

The runtime is **framework-agnostic** — it is not an agent creator or host. It
sits on the isolated AgentKit integration in
[`@taskmarket/agent-kit`](../agent-kit) and exposes tools the same way AgentKit
does (`ActionProvider` → MCP / OpenAI / Vercel AI SDK tool formats).

## What is implemented

- **Configuration** (`src/config.ts`): a Zod-validated `AgentRuntimeConfig`
  (agent id/name/description/version, declared capabilities, default network,
  log level), a resolver with safe testnet-oriented defaults, and a loader for
  the documented `AGENT_RUNTIME_*` environment variables.
- **Tool/action boundary** (`src/tools.ts`): a `ToolDefinition` type that maps
  1:1 to an AgentKit `ActionDefinition`, an EVM-address validator, and the base
  read-only tools every agent exposes:
  - `agent.ping` — deterministic liveness/identity metadata;
  - `agent.capabilities` — declared capabilities + available tools;
  - `wallet.balance` — read-only balance query (injected wallet adapter);
  - `wallet.resolve_token` — deterministic symbol → contract address.
    No writes, payments, or fund movement are registered.
- **Runtime** (`src/runtime.ts`): `createAgentRuntime(config, deps)` wires the
  tool registry onto an AgentKit `ActionProvider` with the `PolicyEngine` and
  `ExecutionRuntime`, and exposes `runTool(name, input, options)` returning a
  structured `ToolResult` (trace/request IDs, latency, attempts, structured
  errors), plus `listCapabilities()`, `health()`, and `metricsSnapshot()`.
  It fails safely when the default network is outside the AgentKit allowlist.
- **Observability** (`src/observability.ts`): a structured
  `RuntimeLogger`-compatible logger with an injectable sink and clock, plus
  in-process counters/latency histograms surfaced by `metricsSnapshot()`.
- **Errors** (`src/errors.ts`): structured `AgentRuntimeError` /
  `AgentRuntimeConfigError` plus the `AGENT_RUNTIME_TOOL_ERROR_CODES` returned
  inside failed results (`TOOL_NOT_FOUND`, `INPUT_INVALID`, `POLICY_BLOCKED`,
  `TIMEOUT`, `IDEMPOTENCY_CONFLICT`, `EXECUTION_FAILED`, `INTERNAL`) and the
  `AGENT_RUNTIME_CONTRACT_ERROR_CODES` returned inside failed service responses
  (`REQUEST_INVALID`, `UNSUPPORTED_VERSION`, `UNSUPPORTED_SCHEMA`).
- **Service contract** (`src/contract/`): the internal and external contract
  for an agent service, kept **model- and transport-agnostic** (a plain JSON
  boundary that Fastify/MCP adapters can consume in later phases):
  - Versioning (`AGENT_SERVICE_CONTRACT_VERSION = "1.0.0"`); every request and
    response carries a `contractVersion` field, and unsupported versions are
    rejected with a structured error.
  - Request envelope (`AgentServiceRequest`): `requestId` (required, validated,
    echoed back), `tool`, `input`, `idempotencyKey`, `timeoutMs` (bounded),
    `confirmed`, `caller`, and an `auth` placeholder (scheme + principal, **not
    yet enforced** — verification is deferred to the identity/auth phase).
  - Response envelope (`AgentServiceResponse`): structured result mirroring
    `ToolResult` plus the echoed `requestId` and `contractVersion`; failures
    carry `AGENT_RUNTIME_*` codes.
  - `createAgentService(runtime, options)` adapts an `AgentRuntime` into the
    contract boundary: `parseRequest(input)` validates at the trust boundary,
    `execute(input)` runs a request end to end (never throwing — malformed
    input becomes a structured error response), `capabilities()`, `health()`,
    and `openapi()`.
  - `buildAgentServiceOpenApi(...)` generates a clear **OpenAPI 3.1** document
    (`/health`, `/capabilities`, `/tool`) from the registered tool Zod schemas,
    so documentation cannot drift from the validated contract.

## Usage

```ts
import {
  createAgentRuntime,
  createAgentService,
  loadAgentRuntimeConfig,
} from '@taskmarket/agent-runtime';

const config = loadAgentRuntimeConfig(process.env);
const agent = createAgentRuntime(config);

const result = await agent.runTool('agent.ping', {});
// => { ok: true, tool: 'agent.ping', output: { pong: true, ... }, ... }

const balance = await agent.runTool('wallet.balance', {
  address: '0x0000000000000000000000000000000000000001',
});

// External service boundary (model- and transport-agnostic):
const service = createAgentService(agent);
const response = await service.execute({
  contractVersion: '1.0.0',
  requestId: 'req-abc',
  tool: 'wallet.balance',
  input: { address: '0x0000000000000000000000000000000000000001' },
});
// => { contractVersion: '1.0.0', requestId: 'req-abc', ok: true, ... }

const openapi = service.openapi(); // clear, generated API documentation
```

## Environment variables

| Variable                          | Default                                       | Purpose                                            |
| --------------------------------- | --------------------------------------------- | -------------------------------------------------- |
| `AGENT_RUNTIME_AGENT_ID`          | `taskmarket-reference`                        | Stable agent identifier.                           |
| `AGENT_RUNTIME_AGENT_NAME`        | `TaskMarket Reference Agent`                  | Human-readable agent name.                         |
| `AGENT_RUNTIME_AGENT_DESCRIPTION` | `Minimal TaskMarket agent runtime (Phase 1).` | One-line description.                              |
| `AGENT_RUNTIME_AGENT_VERSION`     | `0.1.0`                                       | Agent build/semantic version.                      |
| `AGENT_RUNTIME_CAPABILITIES`      | `agent:meta,wallet:read`                      | Comma-separated declared capability keys.          |
| `AGENT_RUNTIME_DEFAULT_NETWORK`   | `goat-testnet`                                | Network tools execute against.                     |
| `AGENT_RUNTIME_LOG_LEVEL`         | `info`                                        | Minimum log level (`debug`/`info`/`warn`/`error`). |

Underlying AgentKit behavior (networks allowlist, risk ceiling, write
permissions, idempotency, retries) is configured via the `AGENTKIT_*` variables
documented in [`@taskmarket/agent-kit`](../agent-kit) and passed through
`createAgentRuntime(config, { agentKitConfig })`.

## Deterministic tests

All runtime behavior is deterministic when a clock and request-ID factory are
injected (`deps.clock`, `deps.requestIdFactory`), and read-only wallet tools use
the AgentKit no-op wallet adapter. Tests cover configuration validation, tool
schemas, success/failure paths, policy blocking, idempotency, health,
metrics/log observability, and the service contract (envelope schemas, Zod →
JSON Schema conversion, OpenAPI generation, and end-to-end request/response
handling including malformed and unsupported requests).

## Development

```sh
pnpm --filter @taskmarket/agent-runtime typecheck
pnpm test   # runs the whole workspace suite from the repository root
```

Wallet providers, payments, ERC-8004, and reputation are intentionally **out of
scope** for this package step (Phase 1 guardrail). The agent service contract
(input/output schemas, versioning, auth, health) is implemented in
`src/contract/`; **auth is a documented placeholder and is not yet enforced** —
verification is wired up in the phase that introduces TaskMarket accounts and
identity. HTTP/MCP adapters that expose the contract over the wire are also a
later phase (the reference agent, 01-05+).
