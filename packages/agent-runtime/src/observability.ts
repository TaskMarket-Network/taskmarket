import {
  InMemoryRuntimeMetrics,
  type RuntimeLogger,
  type RuntimeMetrics,
} from '@goatnetwork/agentkit/core';

/** A structured log entry recorded by a {@link createRecordingLogger}. */
export interface StructuredLogEntry {
  level: string;
  message: string;
  meta: Record<string, unknown>;
  timestamp: string;
}

export interface StructuredLoggerOptions {
  /** Minimum level to emit. Defaults to `info`. */
  minLevel?: string;
  /** Sink receiving each emitted entry. Defaults to collecting nothing. */
  sink?: (entry: StructuredLogEntry) => void;
  /** Injectable clock for deterministic tests (returns epoch milliseconds). */
  now?: () => number;
}

const LEVEL_RANK = { debug: 0, info: 1, warn: 2, error: 3 } as const;

/**
 * Create an AgentKit-compatible {@link RuntimeLogger} that emits structured
 * entries to an injectable sink. Emits no secrets; entries carry a timestamp
 * from the injectable clock so behavior is deterministic in tests.
 */
export function createStructuredLogger(options: StructuredLoggerOptions = {}): RuntimeLogger {
  const minRank = LEVEL_RANK[options.minLevel as keyof typeof LEVEL_RANK] ?? LEVEL_RANK.info;
  const now = options.now ?? Date.now;
  const sink = options.sink ?? (() => {});

  return {
    log(level, message, meta = {}) {
      if (LEVEL_RANK[level as keyof typeof LEVEL_RANK] < minRank) {
        return;
      }
      sink({ level, message, meta, timestamp: new Date(now()).toISOString() });
    },
  };
}

/** A no-op metrics instance (safe default when none is injected). */
export function createNoopMetrics(): RuntimeMetrics {
  return new InMemoryRuntimeMetrics();
}

export { InMemoryRuntimeMetrics };
export type { RuntimeLogger, RuntimeMetrics };
