/** Placeholder authentication attachment on an agent service request. */
export interface AgentServiceAuth {
  /** Auth scheme the service expects. Verification is deferred to a later phase. */
  scheme: 'bearer' | 'api-key';
  /**
   * Placeholder for the verified caller identity. Populated by the auth
   * adapter once identity/auth verification exists; never holds raw
   * credentials.
   */
  principal?: string;
}

/**
 * The external request envelope for executing one agent tool. Model- and
 * transport-agnostic: a plain JSON object an HTTP adapter (Fastify/MCP, added
 * in later phases) can deserialize without coupling to one AI framework.
 */
export interface AgentServiceRequest {
  /** Contract version the caller is speaking. Must be supported. */
  contractVersion: string;
  /** Caller-supplied request identifier, echoed back on the response. */
  requestId: string;
  /** Tool to execute (must be registered on the runtime). */
  tool: string;
  /** Tool-specific input; validated against the tool's input schema. */
  input?: unknown;
  /** Idempotency key; repeated calls with the same key are deduplicated. */
  idempotencyKey?: string;
  /** Per-call timeout in milliseconds, overriding the runtime default. */
  timeoutMs?: number;
  /** Explicitly confirms a tool whose risk is above the configured ceiling. */
  confirmed?: boolean;
  /** Caller identity recorded in the tool context (defaults to the agent). */
  caller?: string;
  /** Authentication placeholder; not enforced until the auth phase. */
  auth?: AgentServiceAuth;
}

/** Structured error carried inside a failed {@link AgentServiceResponse}. */
export interface AgentServiceError {
  /** Stable machine-readable error code. */
  code: string;
  /** Human-readable message describing the failure. */
  message: string;
}

/**
 * The external response envelope for one tool execution. Fields mirror the
 * internal `ToolResult` shape so callers and the contract stay in sync.
 */
export interface AgentServiceResponse {
  /** Contract version this response speaks. */
  contractVersion: string;
  /** Caller's request identifier, echoed back. */
  requestId: string;
  /** Correlation ID tying this execution to its logs. */
  traceId: string;
  /** Tool that was executed. */
  tool: string;
  /** Whether the tool executed successfully. */
  ok: boolean;
  /** Tool output on success; absent on failure. */
  output?: unknown;
  /** Structured error on failure; absent on success. */
  error?: AgentServiceError;
  /** Round-trip latency in milliseconds. */
  latencyMs: number;
  /** Number of execution attempts (1 unless retried). */
  attempts: number;
  /** ISO-8601 timestamp of the response. */
  timestamp: string;
}

/** Capability snapshot returned by {@link AgentService.capabilities}. */
export interface AgentServiceCapabilitiesResponse {
  /** Contract version this response speaks. */
  contractVersion: string;
  /** Stable agent identifier. */
  agentId: string;
  /** Agent build/semantic version. */
  version: string;
  /** Capability keys provided by the registered tools. */
  capabilities: string[];
  /** Tools currently registered on the service. */
  tools: string[];
}

/** Liveness and identity snapshot returned by {@link AgentService.health}. */
export interface AgentServiceHealthResponse {
  /** Contract version this response speaks. */
  contractVersion: string;
  ok: boolean;
  agentId: string;
  name: string;
  version: string;
  /** Capabilities the agent declares (informational metadata). */
  capabilities: string[];
  /** Tools currently registered on the service. */
  tools: string[];
  /** Network the agent is bound to. */
  network: string;
  /** ISO-8601 timestamp of the check. */
  checkedAt: string;
}

/** Result of validating an external payload against the request envelope. */
export type AgentServiceParseResult =
  { ok: true; request: AgentServiceRequest } | { ok: false; error: AgentServiceError };
