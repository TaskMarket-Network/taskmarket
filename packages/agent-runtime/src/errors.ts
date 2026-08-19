/** Base class for errors raised by the TaskMarket agent runtime. */
export class AgentRuntimeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AgentRuntimeError';
    this.code = code;
  }
}

/** Raised when agent runtime configuration is invalid or unsafe. */
export class AgentRuntimeConfigError extends AgentRuntimeError {
  constructor(message: string) {
    super('AGENT_RUNTIME_CONFIG_ERROR', message);
    this.name = 'AgentRuntimeConfigError';
  }
}

/** Structured error codes returned inside failed {@link ToolResult}s. */
export const AGENT_RUNTIME_TOOL_ERROR_CODES = {
  TOOL_NOT_FOUND: 'AGENT_RUNTIME_TOOL_NOT_FOUND',
  INPUT_INVALID: 'AGENT_RUNTIME_INPUT_INVALID',
  POLICY_BLOCKED: 'AGENT_RUNTIME_POLICY_BLOCKED',
  TIMEOUT: 'AGENT_RUNTIME_TIMEOUT',
  IDEMPOTENCY_CONFLICT: 'AGENT_RUNTIME_IDEMPOTENCY_CONFLICT',
  EXECUTION_FAILED: 'AGENT_RUNTIME_EXECUTION_FAILED',
  INTERNAL: 'AGENT_RUNTIME_INTERNAL',
} as const;
export type AgentRuntimeToolErrorCode =
  (typeof AGENT_RUNTIME_TOOL_ERROR_CODES)[keyof typeof AGENT_RUNTIME_TOOL_ERROR_CODES];

/** Structured error codes returned inside failed agent service responses. */
export const AGENT_RUNTIME_CONTRACT_ERROR_CODES = {
  REQUEST_INVALID: 'AGENT_RUNTIME_REQUEST_INVALID',
  UNSUPPORTED_VERSION: 'AGENT_RUNTIME_UNSUPPORTED_VERSION',
  SCHEMA_UNSUPPORTED: 'AGENT_RUNTIME_UNSUPPORTED_SCHEMA',
} as const;
export type AgentRuntimeContractErrorCode =
  (typeof AGENT_RUNTIME_CONTRACT_ERROR_CODES)[keyof typeof AGENT_RUNTIME_CONTRACT_ERROR_CODES];

/** Log levels supported by the runtime logger. */
export const AGENT_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type AgentLogLevel = (typeof AGENT_LOG_LEVELS)[number];
