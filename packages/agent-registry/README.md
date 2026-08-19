# @taskmarket/agent-registry

TaskMarket's **off-chain agent registry** domain model (Phase 2, step 02-01).
It defines the catalog of registered agents TaskMarket hosts or knows about:
identity fields, capabilities, endpoints, ownership references, status,
pricing metadata, timestamps, and versioning. The registry is TaskMarket's own
**off-chain** catalog and is **not** ERC-8004 identity; protocol identity is
introduced in a later phase.

## What is implemented

- **Domain model** (`src/types.ts`): the `RegisteredAgent` entity with a clear
  split between **immutable** fields (`id`, `ownerRef`, `createdAt`) and
  **mutable** fields (`name`, `description`, `capabilities`, `endpoints`,
  `status`, `pricing`). `version` increments monotonically on every update and
  `updatedAt` is bumped with it.
- **Input validation** (`src/schemas.ts`): Zod schemas validate every external
  input at the trust boundary. Endpoint URLs are restricted to `http(s)`
  (SSRF guard). Pricing uses decimal strings to avoid float issues. The
  update schema is strict, so attempts to change immutable fields fail
  validation at the boundary.
- **Domain logic** (`src/domain.ts`):
  - `createRegisteredAgent(input, deps)` — validates, assigns id/timestamps,
    fills endpoint ids, starts `version = 1`.
  - `applyAgentUpdate(agent, input, deps)` — validates the transition, returns
    a **new** readonly object with `version + 1` (the input object is never
    mutated).
  - `assertStatusTransition` — allowed transitions:
    `draft -> active`, `active -> suspended`, `suspended -> active`, and
    `* -> retired`.
- **Repositories** (`src/repository.ts`, `src/postgres.ts`): domain code depends
  on the `AgentRegistryRepository` interface (ADR-0005), never on a driver.
  - `InMemoryAgentRegistryRepository` — deterministic, for unit tests.
  - `PostgresAgentRegistryRepository` — real persistence with **optimistic
    concurrency** (`save(agent, previousVersion)` conflicts on version
    mismatch) and the immutable-field trigger.
- **Migration** (`migrations/001_agent_registry.sql`): the `agents` table with
  `PRIMARY KEY`, `NOT NULL`, `CHECK` constraints (status enum, `version >= 1`,
  non-empty `owner_ref`/`name`), an owner index, and the
  `agents_immutable_trigger` which **rejects updates to immutable fields at the
  database boundary**. Applied by `scripts/migrate.mjs` (tracked in
  `schema_migrations`); run it with `pnpm db:migrate`.
- **Errors** (`src/errors.ts`): structured `AgentRegistryError` subtypes with
  stable machine-readable codes (`INPUT_INVALID`, `IMMUTABLE_FIELD`,
  `STATUS_TRANSITION_INVALID`, `DUPLICATE`, `NOT_FOUND`, `VERSION_CONFLICT`,
  `DATABASE`).

## Usage

```ts
import {
  createRegisteredAgent,
  applyAgentUpdate,
  InMemoryAgentRegistryRepository,
  PostgresAgentRegistryRepository,
} from '@taskmarket/agent-registry';
import pg from 'pg';

const agent = createRegisteredAgent({
  ownerRef: 'account-42',
  name: 'Reference Agent',
  capabilities: ['agent:meta', 'wallet:read'],
  endpoints: [{ type: 'mcp', url: 'https://agent.example.com/mcp' }],
  pricing: { currency: 'BTC', minAmount: '0.001' },
});

const repo = new InMemoryAgentRegistryRepository();
await repo.create(agent); // version 1

const updated = applyAgentUpdate(agent, { status: 'active' }); // version 2
await repo.save(updated, agent.version); // optimistic concurrency

// Persistence (PostgreSQL):
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const dbRepo = new PostgresAgentRegistryRepository(pool);
await dbRepo.create(agent);
```

## Migrations

```sh
pnpm db:up        # start the local PostgreSQL/Redis (Docker Compose)
pnpm db:migrate   # apply pending migrations from packages/*/migrations
```

`db:migrate` applies each pending `*.sql` migration in `packages/*/migrations/`
in filename order, inside a transaction, and records it in `schema_migrations`
(it is idempotent). `DATABASE_URL` defaults to the safe local development value
when unset.

## Deterministic tests

Domain logic is fully deterministic when a clock and id factories are injected
(`deps.clock`, `deps.agentIdFactory`, `deps.endpointIdFactory`). Tests cover
creation, mutable/immutable split, status transitions, input validation
(including SSRF-guarded URLs and pricing bounds), optimistic version conflicts,
and the in-memory repository. A PostgreSQL **integration** test
(`src/postgres.integration.test.ts`) applies the migration in an isolated
schema, exercises the repository, and verifies the immutable-field trigger; it
is skipped automatically when the database is unreachable.

## Development

```sh
pnpm --filter @taskmarket/agent-registry typecheck
pnpm test   # runs the whole workspace suite from the repository root
```

Registration **API**, capability **discovery**, and the agent **dashboard** are
intentionally out of scope for this step (Phase 2 steps 02-02, 02-03, 02-04).
