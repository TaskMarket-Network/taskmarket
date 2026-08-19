import type { ActionContext, ActionDefinition } from '@goatnetwork/agentkit/core';
import {
  resolveTokenAction,
  walletBalanceAction,
  type WalletReadAdapter,
} from '@goatnetwork/agentkit/plugins';
import type { GoatNetwork } from '@taskmarket/agent-kit';
import { z } from 'zod';

import type { AgentRuntimeConfig } from './config.js';
import type { ToolContext, ToolDefinition } from './types.js';

/** Schema validating an EVM address (0x + 40 hex chars). */
export const evmAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 0x-prefixed 40-character hex address');

/** Empty-input schema used by the deterministic metadata tools. */
export const emptyInputSchema = z.object({});

/**
 * Convert a {@link ToolDefinition} into an AgentKit {@link ActionDefinition}
 * bound to the given network allowlist. The returned action re-exposes the
 * tool through AgentKit's runtime so it is policy-gated, idempotent, retryable,
 * and observable.
 */
export function toActionDefinition(
  tool: ToolDefinition,
  networks: readonly GoatNetwork[],
): ActionDefinition {
  return {
    name: tool.name,
    description: tool.description,
    riskLevel: tool.riskLevel,
    requiresConfirmation: tool.requiresConfirmation ?? tool.riskLevel !== 'read',
    networks: [...networks],
    zodInputSchema: tool.inputSchema,
    execute: async (ctx: ActionContext, input: unknown) =>
      tool.execute(input, {
        traceId: ctx.traceId,
        network: ctx.network as GoatNetwork,
        caller: ctx.caller ?? '',
        now: ctx.now,
      }),
  };
}

/** Deterministic liveness/identity tool: returns agent metadata and a pong. */
export function createPingTool(config: AgentRuntimeConfig): ToolDefinition {
  return {
    name: 'agent.ping',
    description: 'Return the agent identity and liveness information (read-only).',
    capability: 'agent:meta',
    riskLevel: 'read',
    inputSchema: emptyInputSchema,
    execute: (_input, ctx: ToolContext) => ({
      pong: true,
      agentId: config.agentId,
      name: config.name,
      version: config.version,
      network: ctx.network,
      timestamp: new Date(ctx.now).toISOString(),
    }),
  };
}

/** Deterministic discovery tool: returns the declared capabilities and tools. */
export function createCapabilitiesTool(
  config: AgentRuntimeConfig,
  listToolNames: () => readonly string[],
): ToolDefinition {
  return {
    name: 'agent.capabilities',
    description: 'List the agent capabilities and the tools that provide them (read-only).',
    capability: 'agent:meta',
    riskLevel: 'read',
    inputSchema: emptyInputSchema,
    execute: () => ({
      agentId: config.agentId,
      capabilities: [...config.capabilities],
      tools: [...listToolNames()].sort(),
    }),
  };
}

/** Read-only wallet balance tool backed by an injected {@link WalletReadAdapter}. */
export function createWalletBalanceTool(adapter: WalletReadAdapter): ToolDefinition {
  const action = walletBalanceAction(adapter);
  return {
    name: action.name,
    description: action.description,
    capability: 'wallet:read',
    riskLevel: action.riskLevel,
    inputSchema: z.object({
      address: evmAddressSchema,
      tokenAddress: evmAddressSchema.optional(),
    }),
    execute: async (input, ctx: ToolContext) =>
      action.execute(
        { traceId: ctx.traceId, network: ctx.network, caller: ctx.caller, now: ctx.now },
        input as { address: string; tokenAddress?: string },
      ),
  };
}

/** Read-only token-symbol resolution tool (deterministic, no network access). */
export function createResolveTokenTool(): ToolDefinition {
  const action = resolveTokenAction();
  return {
    name: action.name,
    description: action.description,
    capability: 'wallet:read',
    riskLevel: action.riskLevel,
    inputSchema: z.object({ symbol: z.string().min(1) }),
    execute: async (input, ctx: ToolContext) =>
      action.execute(
        { traceId: ctx.traceId, network: ctx.network, caller: ctx.caller, now: ctx.now },
        input as { symbol: string },
      ),
  };
}

/**
 * Create the minimal set of tools every TaskMarket agent runtime exposes:
 * `agent.ping`, `agent.capabilities`, `wallet.balance` (read-only), and
 * `wallet.resolve_token` (read-only). No writes or payments are registered.
 */
export function createBaseTools(
  config: AgentRuntimeConfig,
  walletReadAdapter: WalletReadAdapter,
  listToolNames: () => readonly string[],
): ToolDefinition[] {
  return [
    createPingTool(config),
    createCapabilitiesTool(config, listToolNames),
    createWalletBalanceTool(walletReadAdapter),
    createResolveTokenTool(),
  ];
}
