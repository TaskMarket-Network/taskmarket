import type { z } from 'zod';

import type { RegisteredAgent } from '../types.js';
import type {
  agentDisablePayloadSchema,
  agentGetPayloadSchema,
  agentRegisterPayloadSchema,
  agentRegistrationActionSchema,
  agentRegistrationErrorSchema,
  agentRegistrationRequestIdSchema,
  agentRegistrationRequestSchema,
  agentUpdatePayloadSchema,
  agentValidatePayloadSchema,
} from './schemas.js';
import type { AgentRegistrationOpenApiDocument } from './openapi.js';
import type { AgentRegistryRepository } from '../repository.js';

/** An operation exposed by the agent registration API. */
export type AgentRegistrationAction = z.infer<typeof agentRegistrationActionSchema>;

/** Validator-conformant request id. */
export type AgentRegistrationRequestId = z.infer<typeof agentRegistrationRequestIdSchema>;

/** The external request envelope (payload is validated per action). */
export type AgentRegistrationRequest = z.infer<typeof agentRegistrationRequestSchema>;

/**
 * The external response envelope as a discriminated union: `ok: true` carries
 * `agent` (register/update/get/disable) or `candidate` (validate); `ok: false`
 * always carries a structured `error`. Mirrors `agentRegistrationResponseSchema`
 * in `schemas.ts`, which validates the wire representation.
 */
export type AgentRegistrationResponse =
  | {
      contractVersion: string;
      requestId: string;
      action: string;
      ok: true;
      agent: RegisteredAgent;
      candidate?: never;
      error?: never;
      timestamp: string;
    }
  | {
      contractVersion: string;
      requestId: string;
      action: string;
      ok: true;
      candidate: unknown;
      agent?: never;
      error?: never;
      timestamp: string;
    }
  | {
      contractVersion: string;
      requestId: string;
      action: string;
      ok: false;
      error: AgentRegistrationError;
      agent?: never;
      candidate?: never;
      timestamp: string;
    };

/** Structured error carried inside a failed response. */
export type AgentRegistrationError = z.infer<typeof agentRegistrationErrorSchema>;

/** Discriminated result of parsing an external payload at the trust boundary. */
export type AgentRegistrationParseResult =
  { ok: true; request: AgentRegistrationRequest } | { ok: false; error: AgentRegistrationError };

/** Typed per-action payloads (validated by `parseRequest`). */
export type AgentRegisterPayload = z.infer<typeof agentRegisterPayloadSchema>;
export type AgentUpdatePayload = z.infer<typeof agentUpdatePayloadSchema>;
export type AgentGetPayload = z.infer<typeof agentGetPayloadSchema>;
export type AgentDisablePayload = z.infer<typeof agentDisablePayloadSchema>;
export type AgentValidatePayload = z.infer<typeof agentValidatePayloadSchema>;

/**
 * The transport-agnostic agent registration API boundary (mirrors the agent
 * runtime service contract). Wraps an {@link AgentRegistryRepository} and
 * exposes the external operations: register, update, get, disable, validate —
 * plus generated OpenAPI documentation. HTTP/MCP adapters (later phases)
 * consume this interface.
 */
export interface AgentRegistrationService {
  /** The repository the service persists through. */
  readonly repository: AgentRegistryRepository;
  /** The API contract version this service speaks. */
  contractVersion(): string;
  /**
   * Validate an external payload against the request envelope and the
   * per-action payload at the trust boundary. Returns a discriminated result;
   * adapters may route on it.
   */
  parseRequest(input: unknown): AgentRegistrationParseResult;
  /**
   * Execute an external request end to end. Always resolves to a structured
   * {@link AgentRegistrationResponse}; malformed or unauthorized requests
   * produce a structured error response rather than throwing.
   */
  handle(input: unknown): Promise<AgentRegistrationResponse>;
  /** Generated OpenAPI 3.1 documentation for the registration API. */
  openapi(): AgentRegistrationOpenApiDocument;
}
