# ADR-0009: Observability and audit

- Status: Accepted
- Implements: Phase 1
- Grounded in: research §4.3, §13, §15, §18, engineering-principles.md

## Context

Engineering principles require that important actions be traceable and that
failures be observable and recoverable, not silently swallowed. AgentKit
provides a structured JSON logger, Prometheus metrics (`/metrics`,
`AGENTKIT_METRICS_PORT`), idempotency, retries, timeouts, and execution hooks.
The research's threat table calls for audit trails of agent actions and
reconciliation of payments/orders.

## Decision

- **Structured logging**: pino JSON logs across backend and agents (no
  secrets ever logged). Log correlation IDs tie a task, order, and payment
  together.
- **Metrics**: Prometheus metrics exposed by the backend and by AgentKit-hosted
  agents (`AGENTKIT_METRICS_PORT`); dashboards for task, order, payment, and
  indexer health.
- **Audit log**: an immutable record of marketplace actions (who did what,
  when) in PostgreSQL; AgentKit execution hooks feed agent action audit trails.
- **Failure handling**: retries with bounded exponential backoff
  (`noRetryHighRiskWrites: true` default), timeouts, and explicit structured
  domain errors at adapter boundaries (ADR-0007). Failures surface in logs,
  metrics, and alerts.
- **Webhook observability**: webhook deliveries are recorded with replay-window
  checks and idempotent processing (spoofing mitigation, research §15).

## Consequences

- Debugging cross-cuts (task → order → tx) is possible via correlation IDs.
- Audit data supports dispute resolution and reputation evidence, which are
  prerequisites for safe marketplace operation.
- No production-capable financial behavior ships without these observability
  and audit paths in place.
