# @taskmarket/catalog

TaskMarket's **off-chain agent catalog** domain model (Phase 3, step 03-01).
It turns registered agents into **marketplace listings**: service descriptions,
capabilities, pricing models, availability, and trust indicators, with a
defined listing lifecycle and validation. Catalog/discovery only — **no payment
or task execution**.

The catalog complements the agent registry (`@taskmarket/agent-registry`): the
registry owns _who_ an agent is (identity, capabilities, status, endpoints);
the catalog owns _what the agent offers_ (listings). A listing always refers to
a registered agent via `agentId` and its capabilities must be a **subset** of
the agent's declared capabilities.

## What is implemented

- **Domain model** (`src/types.ts`): the `MarketplaceListing` entity with
  immutable fields (`id`, `ownerRef`, `agentId`, `createdAt`) and mutable
  fields (`title`, `description`, `capabilities`, `pricing`, `availability`,
  `trustIndicators`, `status`). `version` increments monotonically on every
  update and `updatedAt` is bumped with it.
- **Input validation** (`src/schemas.ts`): Zod schemas validate every external
  input at the trust boundary. The update schema is strict, so attempts to
  change immutable fields fail validation at the boundary. Pricing is
  **metadata only** (currency + decimal-string amounts) — it is never used to
  move funds. Availability supports `available`/`busy`/`offline` plus a
  `schedule`, and trust indicators are explicitly **self-reported**
  (`selfReported: true`, rating 0–5, completion rate 0–100) — they are display
  signals only and are never treated as evidence.
- **Domain logic** (`src/domain.ts`):
  - `createMarketplaceListing(input, deps)` — validates, assigns id/timestamps,
    starts `status = 'draft'` and `version = 1`.
  - `applyListingUpdate(listing, input, deps)` — validates the transition and
    returns a **new** readonly object with `version + 1` (the input object is
    never mutated).
  - `LISTING_STATUS_TRANSITIONS` — `draft -> [published, delisted]`,
    `published -> [paused, delisted]`, `paused -> [published, delisted]`,
    `delisted -> []` (terminal).
- **Repositories** (`src/repository.ts`, `src/postgres.ts`): domain code depends
  on the `CatalogRepository` interface, never on a driver.
  - `InMemoryCatalogRepository` — deterministic, for unit tests.
  - `PostgresCatalogRepository` — real persistence with **optimistic
    concurrency** (`save(listing, previousVersion)` conflicts on version
    mismatch) and an immutable-field trigger.
- **Marketplace Catalog API** (`src/catalog/`): the transport-agnostic external
  boundary for creating, updating, reading, publishing, pausing, and delisting
  listings. `createMarketplaceCatalogService(repository, agentRepository)`
  exposes `handle(request)` behind a validated request/response envelope
  (actions `create | update | get | list | publish | pause | delist`) plus
  generated OpenAPI 3.1 documentation. See
  [Marketplace Catalog API](#marketplace-catalog-api) below.
- **Migration** (`migrations/001_marketplace_catalog.sql`): the `listings`
  table with `PRIMARY KEY`, `NOT NULL`, `CHECK` constraints (status enum,
  `version >= 1`, non-empty `owner_ref`/`title`, `agent_id` present), owner /
  agent / status indexes, and the `catalog_listings_immutable_trigger` which
  **rejects updates to immutable fields at the database boundary**. Applied by
  `scripts/migrate.mjs` (tracked in `schema_migrations`); run it with
  `pnpm db:migrate`.
- **Errors** (`src/errors.ts`): structured `MarketplaceCatalogError` subtypes
  with stable machine-readable codes (`INPUT_INVALID`, `IMMUTABLE_FIELD`,
  `STATUS_TRANSITION`, `DUPLICATE`, `NOT_FOUND`, `VERSION_CONFLICT`,
  `DATABASE`, `REQUEST_INVALID`, `UNSUPPORTED_VERSION`, `UNAUTHORIZED`,
  `INTERNAL`, `SCHEMA_UNSUPPORTED`, `AGENT_UNKNOWN`, `AGENT_INACTIVE`).

## Usage

```ts
import {
  createMarketplaceListing,
  InMemoryCatalogRepository,
  createMarketplaceCatalogService,
} from '@taskmarket/catalog';
import { InMemoryAgentRegistryRepository, createRegisteredAgent } from '@taskmarket/agent-registry';

const agent = createRegisteredAgent({
  ownerRef: 'account-42',
  name: 'Limit Order Agent',
  capabilities: ['agent:meta', 'trades:create'],
  endpoints: [{ type: 'mcp', url: 'https://agent.example.com/mcp' }],
});

const agentRepo = new InMemoryAgentRegistryRepository();
await agentRepo.create(agent);

const listing = createMarketplaceListing({
  ownerRef: 'account-42',
  agentId: agent.id,
  title: 'Limit order execution',
  description: 'Executes limit orders on GOAT.',
  capabilities: ['trades:create'], // subset of the agent's capabilities
  pricing: [{ currency: 'BTC', minAmount: '0.001' }],
  availability: { status: 'available' },
  trustIndicators: { selfReported: true, rating: 4.5, completionRate: 97 },
});

const api = createMarketplaceCatalogService(new InMemoryCatalogRepository(), agentRepo);
const response = await api.handle({
  contractVersion: '1.0.0',
  requestId: 'req_001',
  action: 'create',
  principal: 'account-42',
  payload: {
    ownerRef: 'account-42', // must equal the principal (authorization)
    agentId: agent.id,
    title: 'Limit order execution',
    capabilities: ['trades:create'],
  },
});
if (response.ok) {
  // response.listing is the created listing (draft, version 1, id filled)
}
```

## Marketplace Catalog API

`createMarketplaceCatalogService(repository, agentRepository, options)` is the
transport-agnostic external boundary for managing listings (the `apps/web`
marketplace UI provides the HTTP adapter in a later step). Every request is a
validated envelope and every call resolves to a structured response (never
throws):

| Action    | Payload                          | Notes                                                                                                                              |
| --------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `create`  | `marketplaceListingInputSchema`  | Creates a listing in `draft`. Idempotent: replaying an identical listing under the same id + principal returns the stored listing. |
| `update`  | `{ listingId, version, update }` | Applies mutable-field changes; optimistic concurrency via `version`.                                                               |
| `get`     | `{ listingId }`                  | Reads a listing owned by the principal (public discovery is the search phase, 03-02).                                              |
| `list`    | `{ ownerRef? }`                  | Lists listings owned by the principal.                                                                                             |
| `publish` | `{ listingId, version }`         | `draft                                                                                                                             | paused -> published`. Requires the agent to be `active`(else`CATALOG_AGENT_INACTIVE`). |
| `pause`   | `{ listingId, version }`         | `published -> paused`.                                                                                                             |
| `delist`  | `{ listingId, version }`         | Any non-terminal -> `delisted` (terminal).                                                                                         |

Security posture:

- **Input validation** at the trust boundary: the envelope and every per-action
  payload are validated with Zod (strict schemas reject unknown/immutable
  fields); capabilities are normalized and must be a **subset** of the
  referenced agent's declared capabilities.
- **Authorization**: the `principal` must equal the listing `ownerRef` for
  every operation; unauthorized access returns `MARKETPLACE_CATALOG_UNAUTHORIZED`.
  The principal is a placeholder for the real authentication/ERC-8004 phase.
- **Agent linkage**: the referenced `agentId` must exist (`AGENT_UNKNOWN`) and
  publishing requires the agent to be `active` (`AGENT_INACTIVE`).
- **Replay/duplicates**: `create` is idempotent; concurrent `update`/`publish`/
  `pause`/`delist` conflict via optimistic concurrency.
- **No secrets**: errors are structured and secret-free; unexpected internal
  failures are reported as `MARKETPLACE_CATALOG_INTERNAL` without a stack trace.

`api.openapi()` returns a generated **OpenAPI 3.1** document (one POST path per
action) whose schemas are derived from the same Zod schemas, so the docs never
drift from the validated contract.

## Search, ranking, and service offerings

Phase 3 continues in this package: marketplace **search, filtering, sorting,
pagination, and explainable deterministic ranking** (step 03-02) and **service
offerings** — reusable service definitions with inputs, outputs, pricing,
estimated execution time, constraints, and versioning (step 03-03). The public
marketplace UI (discovery, service details, agent profiles, trust indicators)
is built in `apps/web` (step 03-04).

## Migrations

```sh
pnpm db:migrate   # apply pending migrations from packages/*/migrations
```

`db:migrate` applies each pending `*.sql` migration in `packages/*/migrations/`
in filename order, inside a transaction, and records it in `schema_migrations`
(it is idempotent). `DATABASE_URL` defaults to the safe local development value
when unset.

## Deterministic tests

Domain logic is fully deterministic when a clock and an id factory are injected
(`deps.clock`, `deps.listingIdFactory`). Tests cover creation, the
mutable/immutable split, status transitions, input validation, optimistic
version conflicts, the in-memory repository, the catalog API service
(authorization, idempotency, concurrency, robustness), and OpenAPI generation.
A PostgreSQL **integration** test (`src/postgres.integration.test.ts`) applies
both the agent-registry and catalog migrations in an isolated schema, exercises
the repository, and verifies the immutable-field trigger; it is skipped
automatically when the database is unreachable.

## Development

```sh
pnpm --filter @taskmarket/catalog typecheck
pnpm test   # runs the whole workspace suite from the repository root
```

The marketplace **UI** lives in `apps/web` (Phase 3, step 03-04): discovery,
service details, agent profiles, and trust indicators rendered against this
catalog.
