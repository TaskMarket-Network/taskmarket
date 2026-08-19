/** Structured error codes raised by the agent registry domain and repositories. */
export const AGENT_REGISTRY_ERROR_CODES = {
  INPUT_INVALID: 'AGENT_REGISTRY_INPUT_INVALID',
  IMMUTABLE_FIELD: 'AGENT_REGISTRY_IMMUTABLE_FIELD',
  STATUS_TRANSITION: 'AGENT_REGISTRY_STATUS_TRANSITION_INVALID',
  DUPLICATE: 'AGENT_REGISTRY_DUPLICATE',
  NOT_FOUND: 'AGENT_REGISTRY_NOT_FOUND',
  VERSION_CONFLICT: 'AGENT_REGISTRY_VERSION_CONFLICT',
  DATABASE: 'AGENT_REGISTRY_DATABASE',
} as const;
export type AgentRegistryErrorCode =
  (typeof AGENT_REGISTRY_ERROR_CODES)[keyof typeof AGENT_REGISTRY_ERROR_CODES];

/** Base class for errors raised by the agent registry. */
export class AgentRegistryError extends Error {
  readonly code: AgentRegistryErrorCode;

  constructor(code: AgentRegistryErrorCode, message: string) {
    super(message);
    this.name = 'AgentRegistryError';
    this.code = code;
  }
}

/** Raised when external input fails validation at the trust boundary. */
export class AgentRegistryInputError extends AgentRegistryError {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(
      AGENT_REGISTRY_ERROR_CODES.INPUT_INVALID,
      `Invalid agent registry input: ${issues.join('; ')}`,
    );
    this.name = 'AgentRegistryInputError';
    this.issues = issues;
  }
}

/** Raised when a caller attempts to change an immutable field. */
export class AgentRegistryImmutableFieldError extends AgentRegistryError {
  constructor(message: string) {
    super(AGENT_REGISTRY_ERROR_CODES.IMMUTABLE_FIELD, message);
    this.name = 'AgentRegistryImmutableFieldError';
  }
}

/** Raised when a status change violates the allowed transitions. */
export class AgentRegistryStatusTransitionError extends AgentRegistryError {
  constructor(from: string, to: string) {
    super(
      AGENT_REGISTRY_ERROR_CODES.STATUS_TRANSITION,
      `Invalid agent status transition: ${from} -> ${to}.`,
    );
    this.name = 'AgentRegistryStatusTransitionError';
  }
}

/** Raised when an agent id is already registered. */
export class AgentRegistryDuplicateError extends AgentRegistryError {
  constructor(id: string) {
    super(AGENT_REGISTRY_ERROR_CODES.DUPLICATE, `Agent "${id}" is already registered.`);
    this.name = 'AgentRegistryDuplicateError';
  }
}

/** Raised when an agent id does not exist. */
export class AgentRegistryNotFoundError extends AgentRegistryError {
  constructor(id: string) {
    super(AGENT_REGISTRY_ERROR_CODES.NOT_FOUND, `Agent "${id}" was not found.`);
    this.name = 'AgentRegistryNotFoundError';
  }
}

/** Raised on an optimistic-concurrency version mismatch during save. */
export class AgentRegistryVersionConflictError extends AgentRegistryError {
  constructor(id: string, expected: number, actual: number) {
    super(
      AGENT_REGISTRY_ERROR_CODES.VERSION_CONFLICT,
      `Agent "${id}" version conflict: expected ${expected}, actual ${actual}.`,
    );
    this.name = 'AgentRegistryVersionConflictError';
  }
}

/** Raised when a persistence layer fails (wraps the underlying cause). */
export class AgentRegistryDatabaseError extends AgentRegistryError {
  override readonly cause: unknown | undefined;

  constructor(message: string, cause?: unknown) {
    super(AGENT_REGISTRY_ERROR_CODES.DATABASE, message);
    this.name = 'AgentRegistryDatabaseError';
    this.cause = cause;
  }
}
