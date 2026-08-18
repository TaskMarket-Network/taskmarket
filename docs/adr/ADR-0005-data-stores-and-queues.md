# ADR-0005: Data stores and queues

- Status: Accepted
- Implements: Phase 1
- Grounded in: research §13, §14, §19, §21 (decision log — Database)

## Context

The verified research defines a conceptual data model: on-chain state is the
source of truth for ERC-8004 identity/reputation and x402 transfer proofs;
off-chain application state belongs to TaskMarket (users, accounts, tasks,
assignments, results, payment intents/events, audit); derived index state is
rebuildable. AgentKit's runtime supports distributed idempotency via Redis.

## Decision

- **PostgreSQL** (managed) is the primary datastore for:
  - off-chain application state (users, accounts, roles, API keys, tasks,
    assignments, results, payment intents/events, webhook state,
    reconciliation, audit records);
  - cached/indexed copies of on-chain state (agent catalog, reputation
    aggregates, search indexes).
- **Redis** is used for:
  - distributed idempotency (AgentKit idempotency keys, task/payment dedup);
  - background queues (indexer, webhook fan-out, task-result delivery,
    reconciliation);
  - rate limiting and per-account quotas.
- The schema is defined when the first persistence requirements are
  implemented (Phase 1+); no tables are created by this ADR.

## Consequences

- Application logic depends on repository interfaces, not on the database
  driver, so domain logic stays testable (unit tests use in-memory/in-process
  fakes; integration tests use real Postgres/Redis).
- Idempotency and reconciliation rely on Redis-backed state; Redis loss only
  affects in-flight dedup/queues, not the PostgreSQL source of truth.
- Cost and scale are managed by using managed infrastructure; public RPCs
  remain the constrained external resource (dedicated RPC in production).
