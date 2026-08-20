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
- **Agent Registration API** (`src/api/`): the transport-agnostic external
  boundary for creating, updating, reading, disabling, and validating agent
  profiles (Phase 2, step 02-02). `createAgentRegistrationService(repository)`
  exposes `register`, `update`, `get`, `disable`, and `validate` operations
  behind a validated request/response envelope, plus generated OpenAPI 3.1
  documentation. See [Agent Registration API](#agent-registration-api) below.
- **Capability Discovery** (`src/discovery/`): searchable, ranked, paginated
  agent capabilities (Phase 2, step 02-03). `normalizeCapability` provides the
  normalized capability representation, `searchCapabilities` is the pure
  filtering/ranking/pagination core, and
  `createCapabilityDiscoveryService(repository)` is the read-only public
  boundary with generated OpenAPI. See
  [Capability Discovery](#capability-discovery) below.
- **Migration** (`migrations/001_agent_registry.sql`): the `agents` table with
  `PRIMARY KEY`, `NOT NULL`, `CHECK` constraints (status enum, `version >= 1`,
  non-empty `owner_ref`/`name`), an owner index, and the
  `agents_immutable_trigger` which **rejects updates to immutable fields at the
  database boundary**. Applied by `scripts/migrate.mjs` (tracked in
  `schema_migrations`); run it with `pnpm db:migrate`.
- **Errors** (`src/errors.ts`): structured `AgentRegistryError` subtypes with
  stable machine-readable codes (`INPUT_INVALID`, `IMMUTABLE_FIELD`,
  `STATUS_TRANSITION`, `DUPLICATE`, `NOT_FOUND`, `VERSION_CONFLICT`,
  `DATABASE`, `REQUEST_INVALID`, `UNSUPPORTED_VERSION`, `UNAUTHORIZED`,
  `INTERNAL`, `SCHEMA_UNSUPPORTED`).

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

## Agent Registration API

`createAgentRegistrationService(repository, options)` is the transport-agnostic
external boundary for managing agent profiles (mirrors the agent-runtime
service contract; a physical HTTP/MCP adapter is a later phase). Every request
is a validated envelope and every call resolves to a structured response
(never throws):

```ts
import { createAgentRegistrationService } from '@taskmarket/agent-registry';

const api = createAgentRegistrationService(dbRepo);

const response = await api.handle({
  contractVersion: '1.0.0',
  requestId: 'req_001',
  action: 'register',
  principal: 'account-42', // authenticated-principal placeholder
  payload: {
    ownerRef: 'account-42', // must equal the principal (authorization)
    name: 'Reference Agent',
    capabilities: ['agent:meta'],
  },
});
if (response.ok) {
  // response.agent is the registered profile (version 1, id filled)
}
```

Operations:

| Action     | Payload                        | Notes                                                                                                                   |
| ---------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `register` | `registeredAgentInputSchema`   | Creates a profile. Idempotent: replaying an identical profile under the same id + principal returns the stored profile. |
| `update`   | `{ agentId, version, update }` | Applies mutable-field changes; optimistic concurrency via `version`.                                                    |
| `get`      | `{ agentId }`                  | Reads a profile owned by the principal (public discovery is a later phase).                                             |
| `disable`  | `{ agentId, version }`         | Retires the profile (terminal). Idempotent for already-retired agents, but `version` is still enforced.                 |
| `validate` | `{ candidate }`                | Dry-run validation of a candidate profile; returns the normalized input or `INPUT_INVALID` issues. Never persists.      |

Security posture:

- **Input validation** at the trust boundary: the envelope and every per-action
  payload are validated with Zod (strict schemas reject unknown/immutable
  fields); endpoint URLs are restricted to `http(s)` (SSRF guard).
- **Authorization**: the `principal` must equal the profile `ownerRef` for
  every operation; unauthorized access returns `AGENT_REGISTRY_UNAUTHORIZED`.
  The principal is a placeholder for the real authentication/ERC-8004 phase —
  a transport adapter replaces it with a verified identity. No credentials are
  ever passed through or logged.
- **Replay/duplicates**: `register` is idempotent; concurrent `update`/`disable`
  conflict via optimistic concurrency.
- **Denial of service**: capability and endpoint arrays are bounded (`max 100`
  / `max 50`); request ids are URL-safe and bounded.
- **No secrets**: errors are structured and secret-free; unexpected internal
  failures are reported as `AGENT_REGISTRY_INTERNAL` without a stack trace.

`api.openapi()` returns a generated **OpenAPI 3.1** document (one POST path per
action) whose schemas are derived from the same Zod schemas, so the docs never
drift from the validated contract.

## Capability Discovery

`createCapabilityDiscoveryService(repository, options)` is the read-only,
transport-agnostic public boundary for searching agent capabilities:

```ts
import { createCapabilityDiscoveryService } from '@taskmarket/agent-registry';

const discovery = createCapabilityDiscoveryService(dbRepo);
const { ok, result } = await discovery.query({
  capabilities: ['wallet:read'], // every requested key (AND)
  namespaces: ['storage'], // at least one (any)
  query: 'trade', // case-insensitive text over name/description/keys
  sortBy: 'relevance', // relevance | updatedAt | createdAt | name | version
  sortDirection: 'desc',
  limit: 20, // 1..100
  offset: 0,
});
```

Semantics and safety:

- **Normalized capabilities**: `normalizeCapability('wallet:read')` →
  `{ key: 'wallet:read', namespace: 'wallet', name: 'read' }` (or `null` when
  invalid). Keys are matched as **opaque identifiers** — never interpreted as
  instructions to execute.
- **Filters** combine with AND: capability keys (exact, every requested key),
  namespaces (any), and free-text `query`. An empty query lists all active
  agents (browse).
- **Ranking inputs**: `sortBy` + `sortDirection`; `relevance` counts matched
  capability/namespace hits and is the default. Ordering is deterministic
  (id tiebreak).
- **Pagination**: `limit`/`offset` with an accurate `total`.
- **Safe projection**: only `active` agents are returned, and endpoint
  `metadata` is deliberately **stripped** so arbitrary untrusted metadata never
  becomes executable instructions. Discovery never fetches or executes
  endpoint URLs (reachability checking is a later step). Search runs in pure
  code over `repository.listAll()` — no dynamic SQL, so no query-string
  injection surface.
- The query is validated at the trust boundary (Zod strict, bounded
  `limit`/`offset`/filter-array sizes); `query()` never throws — malformed
  input and repository failures return structured errors.

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
the in-memory repository, the registration API service (authorization,
idempotency, concurrency, validate, robustness), and capability discovery
(normalization, filtering, ranking, pagination, safe projection). A PostgreSQL
**integration** test (`src/postgres.integration.test.ts`) applies the migration
in an isolated schema, exercises the repository, and verifies the
immutable-field trigger; it is skipped automatically when the database is
unreachable.

## Development

```sh
pnpm --filter @taskmarket/agent-registry typecheck
pnpm test   # runs the whole workspace suite from the repository root
```

The agent **dashboard** is intentionally out of scope for this step (Phase 2
step 02-04).
