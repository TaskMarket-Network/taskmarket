import {
  createExecutionRuntime,
  createPolicyEngine,
  resolveAgentKitConfig,
  type AgentKitConfigInput,
} from '@taskmarket/agent-kit';
import type { ActionContext, ActionDefinition, IdempotencyStore } from '@goatnetwork/agentkit/core';
import { NoopWalletReadAdapter, type WalletReadAdapter } from '@goatnetwork/agentkit/plugins';
import { ActionProvider } from '@goatnetwork/agentkit/providers';
import { randomUUID } from 'node:crypto';

import { resolveAgentRuntimeConfig, type AgentRuntimeConfig } from './config.js';
import {
  AGENT_RUNTIME_TOOL_ERROR_CODES,
  AgentRuntimeConfigError,
  type AgentRuntimeToolErrorCode,
} from './errors.js';
import { createStructuredLogger, InMemoryRuntimeMetrics } from './observability.js';
import { createBaseTools, toActionDefinition } from './tools.js';
import type {
  AgentHealth,
  AgentRuntimeMetricsSnapshot,
  RunToolOptions,
  ToolDefinition,
  ToolResult,
} from './types.js';

/** Dependencies injected into {@link createAgentRuntime}. */
export interface AgentRuntimeDeps {
  /** AgentKit configuration overrides merged over safe testnet defaults. */
  agentKitConfig?: AgentKitConfigInput;
  /** Read adapter backing read-only wallet tools (defaults to the no-op adapter). */
  walletReadAdapter?: WalletReadAdapter;
  /** Idempotency store override; required when AgentKit idempotency mode is `redis`. */
  idempotencyStore?: IdempotencyStore;
  /** Structured logger; AgentKit-compatible. Omitted logs to the AgentKit default. */
  logger?: ReturnType<typeof createStructuredLogger>;
  /** Injectable clock returning epoch milliseconds (deterministic tests). */
  clock?: () => number;
  /** Injectable request-ID factory (deterministic tests). */
  requestIdFactory?: () => string;
}

/** The minimal TaskMarket agent runtime built on GOAT AgentKit. */
export interface AgentRuntime {
  /** Normalized runtime configuration. */
  readonly config: AgentRuntimeConfig;
  /** The underlying AgentKit provider and execution runtime. */
  readonly components: {
    provider: ActionProvider;
    runtime: ReturnType<typeof createExecutionRuntime>;
  };
  /** Tools registered on the runtime. */
  readonly tools: readonly ToolDefinition[];
  /** Execute one tool through the policy-gated, idempotent runtime. */
  runTool(name: string, input: unknown, options?: RunToolOptions): Promise<ToolResult>;
  /** Capability keys provided by the registered tools. */
  listCapabilities(): string[];
  /** Liveness and identity snapshot. */
  health(): AgentHealth;
  /** In-process metrics snapshot (counters and latency histograms). */
  metricsSnapshot(): AgentRuntimeMetricsSnapshot;
}

function epochIso(now: number): string {
  return new Date(now).toISOString();
}

function seriesMapToRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(map.entries());
}

function histogramMapToRecord(
  map: Map<string, { count: number; sum: number; min: number; max: number }>,
): AgentRuntimeMetricsSnapshot['histograms'] {
  return Object.fromEntries(map.entries());
}

/**
 * Create the minimal TaskMarket agent runtime. Registers the base read-only
 * tools (`agent.ping`, `agent.capabilities`, `wallet.balance`,
 * `wallet.resolve_token`) on an AgentKit {@link ActionProvider}, then wires the
 * policy engine and execution runtime so every tool call is policy-gated,
 * idempotent, retryable, and observable. Fails safely on unsafe configuration
 * (for example a default network outside the AgentKit allowlist).
 */
export function createAgentRuntime(
  input: AgentRuntimeConfig,
  deps: AgentRuntimeDeps = {},
): AgentRuntime {
  const config = resolveAgentRuntimeConfig(input);
  const agentKitConfig = resolveAgentKitConfig(deps.agentKitConfig);

  if (!agentKitConfig.networks.includes(config.defaultNetwork)) {
    throw new AgentRuntimeConfigError(
      `defaultNetwork "${config.defaultNetwork}" is not in the AgentKit allowlist (${agentKitConfig.networks.join(', ')}).`,
    );
  }

  const walletReadAdapter = deps.walletReadAdapter ?? new NoopWalletReadAdapter();
  const clock = deps.clock ?? Date.now;
  const requestIdFactory = deps.requestIdFactory ?? randomUUID;
  const logger = deps.logger ?? createStructuredLogger({ minLevel: config.logLevel });
  const metrics = new InMemoryRuntimeMetrics();

  const tools: ToolDefinition[] = [];
  const toolsByName = new Map<string, ToolDefinition>();
  const registerTool = (tool: ToolDefinition): void => {
    if (toolsByName.has(tool.name)) {
      throw new AgentRuntimeConfigError(`Duplicate tool registration: ${tool.name}`);
    }
    tools.push(tool);
    toolsByName.set(tool.name, tool);
  };

  for (const tool of createBaseTools(config, walletReadAdapter, () => [...toolsByName.keys()])) {
    registerTool(tool);
  }

  const provider = new ActionProvider();
  for (const tool of tools) {
    provider.register(toActionDefinition(tool, agentKitConfig.networks));
  }

  const policy = createPolicyEngine(agentKitConfig);
  const executionOptions: {
    idempotencyStore?: IdempotencyStore;
    logger: ReturnType<typeof createStructuredLogger>;
    metrics: InMemoryRuntimeMetrics;
  } = {
    logger,
    metrics,
  };
  if (deps.idempotencyStore !== undefined) {
    executionOptions.idempotencyStore = deps.idempotencyStore;
  }
  const runtime = createExecutionRuntime(agentKitConfig, policy, executionOptions);

  const mapExecutionError = (errorCode?: string): AgentRuntimeToolErrorCode => {
    switch (errorCode) {
      case 'POLICY_BLOCKED':
        return AGENT_RUNTIME_TOOL_ERROR_CODES.POLICY_BLOCKED;
      case 'TIMEOUT':
        return AGENT_RUNTIME_TOOL_ERROR_CODES.TIMEOUT;
      case 'IDEMPOTENCY_CONFLICT':
        return AGENT_RUNTIME_TOOL_ERROR_CODES.IDEMPOTENCY_CONFLICT;
      case 'INVALID_INPUT':
        return AGENT_RUNTIME_TOOL_ERROR_CODES.INPUT_INVALID;
      default:
        return AGENT_RUNTIME_TOOL_ERROR_CODES.EXECUTION_FAILED;
    }
  };

  const runTool = async (
    name: string,
    input: unknown,
    options: RunToolOptions = {},
  ): Promise<ToolResult> => {
    const startedAt = clock();
    const requestId = requestIdFactory();
    const traceId = `tmr_${requestId}`;
    const tool = toolsByName.get(name);

    const fail = (
      code: AgentRuntimeToolErrorCode,
      message: string,
      attempts: number,
      status: 'error' | 'internal_error' = 'error',
    ): ToolResult => {
      metrics.incCounter('agent.tool_run', 1, { tool: name, status });
      metrics.observe('agent.tool_latency_ms', clock() - startedAt, { tool: name });
      logger.log(status === 'internal_error' ? 'error' : 'warn', `Tool ${name} failed`, {
        traceId,
        tool: name,
        errorCode: code,
        error: message,
        attempts,
        latencyMs: clock() - startedAt,
      });
      return {
        ok: false,
        tool: name,
        traceId,
        requestId,
        latencyMs: clock() - startedAt,
        attempts,
        error: { code, message },
        timestamp: epochIso(clock()),
      };
    };

    if (tool === undefined) {
      return fail(AGENT_RUNTIME_TOOL_ERROR_CODES.TOOL_NOT_FOUND, `Unknown tool: ${name}`, 0);
    }

    const parsed = tool.inputSchema.safeParse(input);
    if (!parsed.success) {
      return fail(
        AGENT_RUNTIME_TOOL_ERROR_CODES.INPUT_INVALID,
        `Invalid input for ${name}: ${parsed.error.issues
          .map((issue) => issue.message)
          .join('; ')}`,
        0,
      );
    }

    const action: ActionDefinition = toActionDefinition(tool, agentKitConfig.networks);
    const ctx: ActionContext = {
      traceId,
      network: config.defaultNetwork,
      caller: options.caller ?? config.agentId,
      now: clock(),
    };

    let result: Awaited<ReturnType<typeof runtime.run>>;
    try {
      const executionOptions: {
        idempotencyKey?: string;
        timeoutMs?: number;
        confirmed?: boolean;
      } = {};
      if (options.idempotencyKey !== undefined) {
        executionOptions.idempotencyKey = options.idempotencyKey;
      }
      if (options.timeoutMs !== undefined) {
        executionOptions.timeoutMs = options.timeoutMs;
      }
      if (options.confirmed !== undefined) {
        executionOptions.confirmed = options.confirmed;
      }
      result = await runtime.run(action, ctx, parsed.data, executionOptions);
    } catch (error) {
      const message = `Unexpected runtime failure for ${name}: ${
        error instanceof Error ? error.message : String(error)
      }`;
      return fail(AGENT_RUNTIME_TOOL_ERROR_CODES.INTERNAL, message, 0, 'internal_error');
    }

    const latencyMs = clock() - startedAt;
    if (result.ok) {
      metrics.incCounter('agent.tool_run', 1, { tool: name, status: 'ok' });
      metrics.observe('agent.tool_latency_ms', latencyMs, { tool: name });
      logger.log('info', `Tool ${name} succeeded`, {
        traceId,
        tool: name,
        attempts: result.attempts,
        latencyMs,
      });
      return {
        ok: true,
        tool: name,
        traceId,
        requestId,
        latencyMs,
        attempts: result.attempts,
        output: result.output,
        timestamp: epochIso(clock()),
      };
    }

    const code = mapExecutionError(result.errorCode);
    const message = result.error ?? `Execution of ${name} failed.`;
    return fail(code, message, result.attempts);
  };

  const listCapabilities = (): string[] =>
    [...new Set(tools.map((tool) => tool.capability))].sort();

  const health = (): AgentHealth => ({
    ok: true,
    agentId: config.agentId,
    name: config.name,
    version: config.version,
    capabilities: [...config.capabilities],
    tools: [...toolsByName.keys()].sort(),
    network: config.defaultNetwork,
    checkedAt: epochIso(clock()),
  });

  const metricsSnapshot = (): AgentRuntimeMetricsSnapshot => ({
    counters: seriesMapToRecord(metrics.counters),
    histograms: histogramMapToRecord(metrics.histograms),
  });

  return {
    config,
    components: { provider, runtime },
    tools,
    runTool,
    listCapabilities,
    health,
    metricsSnapshot,
  };
}
