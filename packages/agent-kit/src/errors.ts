import type { ZodIssue } from 'zod';

/** Base class for errors raised by the TaskMarket AgentKit integration. */
export class AgentKitError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AgentKitError';
    this.code = code;
  }
}

/** Raised when AgentKit configuration is invalid or unsafe. */
export class AgentKitConfigError extends AgentKitError {
  readonly issues: readonly ZodIssue[];

  constructor(issues: readonly ZodIssue[]) {
    super(
      'AGENTKIT_CONFIG_ERROR',
      `Invalid AgentKit configuration: ${issues.map((issue) => issue.message).join('; ')}`,
    );
    this.name = 'AgentKitConfigError';
    this.issues = issues;
  }
}

/** Raised when AgentKit components cannot be initialized with the given configuration. */
export class AgentKitInitializationError extends AgentKitError {
  constructor(message: string) {
    super('AGENTKIT_INITIALIZATION_ERROR', message);
    this.name = 'AgentKitInitializationError';
  }
}

/** Raised when a GOAT network/RPC connectivity check fails safely. */
export class AgentKitConnectivityError extends AgentKitError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'AgentKitConnectivityError';
  }
}
