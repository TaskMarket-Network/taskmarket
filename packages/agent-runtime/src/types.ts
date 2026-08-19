import type { RiskLevel, GoatNetwork } from '@taskmarket/agent-kit';
import type { z } from 'zod';

/** The execution context passed to a tool's `execute` implementation. */
export interface ToolContext {
  /** Correlation ID tying this execution to a request and its logs. */
  traceId: string;
  /** Network the tool is executing against. */
  network: GoatNetwork;
  /** Identifier of the caller (the agent or account making the request). */
  caller: string;
  /** Current wall-clock time in milliseconds (injectable for tests). */
  now: number;
}

/**
 * The TaskMarket tool/action boundary. Each tool maps 1:1 to an AgentKit
 * `ActionDefinition` so every execution is policy-gated, idempotent, retryable,
 * and observable by the underlying runtime.
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  /** Stable, namespaced tool name, e.g. `agent.ping`. */
  name: string;
  /** Human-readable description of what the tool does. */
  description: string;
  /** Capability key this tool belongs to, e.g. `agent:meta` or `wallet:read`. */
  capability: string;
  /** AgentKit risk level; `read` tools never require confirmation. */
  riskLevel: RiskLevel;
  /** Whether this tool requires explicit confirmation before execution. */
  requiresConfirmation?: boolean;
  /** Zod schema validating every input at the trust boundary. */
  inputSchema: z.ZodType<TInput>;
  /** Executes the tool. Implementations must not contain secrets. */
  execute: (input: TInput, ctx: ToolContext) => Promise<TOutput> | TOutput;
}

/** Structured error returned inside a failed {@link ToolResult}. */
export interface ToolError {
  /** Stable machine-readable error code, e.g. `AGENT_RUNTIME_INPUT_INVALID`. */
  code: string;
  /** Human-readable message describing the failure. */
  message: string;
}

/**
 * The structured result of running one tool. Shape is aligned with the agent
 * service contract response so callers and the contract stay in sync.
 */
export interface ToolResult {
  /** Whether the tool executed successfully. */
  ok: boolean;
  /** Tool that was executed. */
  tool: string;
  /** Correlation ID for the execution. */
  traceId: string;
  /** Stable request identifier for the caller. */
  requestId: string;
  /** Round-trip latency in milliseconds. */
  latencyMs: number;
  /** Number of execution attempts (1 unless retried). */
  attempts: number;
  /** Tool output on success; absent on failure. */
  output?: unknown;
  /** Structured error on failure; absent on success. */
  error?: ToolError;
  /** ISO-8601 timestamp of the result. */
  timestamp: string;
}

/** Options accepted by {@link AgentRuntime.runTool}. */
export interface RunToolOptions {
  /** Idempotency key; repeated calls with the same key are deduplicated. */
  idempotencyKey?: string;
  /** Per-call timeout in milliseconds, overriding the runtime default. */
  timeoutMs?: number;
  /** Explicitly confirms a tool whose risk is above the configured ceiling. */
  confirmed?: boolean;
  /** Caller identifier recorded in the tool context (defaults to the agent). */
  caller?: string;
}

/** Liveness and identity snapshot returned by {@link AgentRuntime.health}. */
export interface AgentHealth {
  ok: boolean;
  agentId: string;
  name: string;
  version: string;
  /** Capabilities the agent declares (informational metadata). */
  capabilities: string[];
  /** Tools currently registered on the runtime. */
  tools: string[];
  /** Network the agent is bound to. */
  network: GoatNetwork;
  /** ISO-8601 timestamp of the check. */
  checkedAt: string;
}

/** A declared capability and the tools that provide it. */
export interface AgentCapability {
  key: string;
  description: string;
  tools: string[];
}

/** Snapshot of the runtime's in-process metrics. */
export interface AgentRuntimeMetricsSnapshot {
  counters: Record<string, number>;
  histograms: Record<string, { count: number; sum: number; min: number; max: number }>;
}
