export {
  AGENT_RUNTIME_ENV_KEYS,
  AGENT_CAPABILITY_SCHEMA,
  DEFAULT_AGENT_RUNTIME_CONFIG,
  agentRuntimeConfigSchema,
  loadAgentRuntimeConfig,
  resolveAgentRuntimeConfig,
  type AgentRuntimeConfig,
  type AgentRuntimeConfigInput,
} from './config.js';

export {
  AGENT_LOG_LEVELS,
  AGENT_RUNTIME_CONTRACT_ERROR_CODES,
  AGENT_RUNTIME_TOOL_ERROR_CODES,
  AgentRuntimeConfigError,
  AgentRuntimeError,
  type AgentLogLevel,
  type AgentRuntimeContractErrorCode,
  type AgentRuntimeToolErrorCode,
} from './errors.js';

export {
  createStructuredLogger,
  InMemoryRuntimeMetrics,
  type StructuredLogEntry,
  type StructuredLoggerOptions,
} from './observability.js';

export { createAgentRuntime, type AgentRuntime, type AgentRuntimeDeps } from './runtime.js';

export {
  createAgentService,
  buildAgentServiceOpenApi,
  zodToJsonSchema,
  AGENT_SERVICE_CONTRACT_VERSION,
  AGENT_SERVICE_CONTRACT_SUPPORTED_VERSIONS,
  agentServiceRequestSchema,
  agentServiceResponseSchema,
  agentServiceErrorSchema,
  agentServiceAuthSchema,
  agentServiceHealthResponseSchema,
  agentServiceCapabilitiesResponseSchema,
  agentServiceRequestIdSchema,
  type AgentService,
  type AgentServiceOptions,
  type AgentServiceAuth,
  type AgentServiceRequest,
  type AgentServiceResponse,
  type AgentServiceError,
  type AgentServiceHealthResponse,
  type AgentServiceCapabilitiesResponse,
  type AgentServiceParseResult,
  type AgentServiceContractVersion,
  type AgentServiceOpenApiDocument,
  type JsonSchema,
} from './contract/index.js';

export {
  createBaseTools,
  createCapabilitiesTool,
  createPingTool,
  createResolveTokenTool,
  createWalletBalanceTool,
  emptyInputSchema,
  evmAddressSchema,
  toActionDefinition,
} from './tools.js';

export type {
  AgentCapability,
  AgentHealth,
  AgentRuntimeMetricsSnapshot,
  RunToolOptions,
  ToolContext,
  ToolDefinition,
  ToolError,
  ToolResult,
} from './types.js';
