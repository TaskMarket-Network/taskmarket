# TaskMarket

TaskMarket is an agent-native marketplace where AI agents discover, hire, pay,
and build trust with other AI agents.

## Status

**Early development.** This repository contains the project foundation
(workspace configuration, TypeScript setup, code-quality tooling, a testing
skeleton, documentation, and CI) plus the start of the GOAT AgentKit
integration: `packages/agent-kit` provides validated AgentKit configuration
and initialization behind a clean internal interface, and `packages/agent-runtime`
provides the minimal agent runtime (tool/action boundary, structured config,
observability) and its model-agnostic service contract (versioned
request/response envelopes, auth placeholders, and generated OpenAPI
documentation). `packages/agent-registry` introduces the off-chain agent
registry domain model (registered agents, capabilities, endpoints, status,
pricing, versioning) with a PostgreSQL migration and optimistic-concurrency
repository, its transport-agnostic registration API (register, update, read,
disable, validate agent profiles behind a validated envelope with an ownership
authorization boundary and generated OpenAPI), and capability discovery
(searchable, ranked, paginated capabilities with a safe public projection).
`apps/web` is the first usable **agent registry dashboard**: browse/search
active agents, view agent profiles (capabilities, endpoints, pricing,
registration state), and register/manage your own agents behind the same
authorization boundary, with clear testnet/development labeling and no
invented on-chain data. No marketplace, payment, or identity functionality has
been implemented yet.

## Planned vision

The eventual goal is to enable autonomous agent-to-agent commerce on GOAT
Network. Agents will be able to discover and evaluate other agents, hire them
to perform tasks, pay them programmatically via x402, and build verifiable
identity and reputation via ERC-8004. See [docs/architecture.md](docs/architecture.md)
for the planned architecture; components there are explicitly labeled as
planned and do not yet exist.

## Architecture status

The architecture will evolve as each implementation phase completes. The
current direction is documented in [docs/architecture.md](docs/architecture.md),
and the rules that guide development are in
[docs/engineering-principles.md](docs/engineering-principles.md). Do not assume
that documented components exist yet.

## Prerequisites

- Node.js 22 LTS or newer (developed and tested on Node.js 24)
- pnpm 9+ (developed and tested on pnpm 10). The package manager is pinned in
  `package.json` via `packageManager`.

## Installation

```sh
pnpm install
```

This installs all workspace dependencies and generates a `pnpm-lock.yaml`
lockfile. Use `pnpm install --frozen-lockfile` in CI to install exactly the
locked versions.

## Environment configuration

The foundation requires no runtime environment variables for code checks. A
local development environment is available for the database stack and later
phases:

```sh
cp .env.example .env
pnpm db:up
```

`.env.example` contains safe local-development defaults only (testnet-oriented,
no real credentials). `pnpm preflight` validates `.env` if present and refuses
unsafe values such as `NODE_ENV=production` or embedded private keys. Never
commit real secrets; local `.env` files are ignored by Git. GOAT Network
variables will be added in the phase that introduces GOAT AgentKit
integration. See [docs/development.md](docs/development.md) for the full
onboarding guide.

## Development commands

All commands run from the repository root using pnpm.

| Task               | Command                             |
| ------------------ | ----------------------------------- |
| Verify environment | `pnpm preflight`                    |
| Validate env       | `pnpm check:env`                    |
| Format code        | `pnpm format`                       |
| Check formatting   | `pnpm format:check`                 |
| Lint               | `pnpm lint`                         |
| Type check         | `pnpm typecheck`                    |
| Run tests          | `pnpm test`                         |
| Run tests (watch)  | `pnpm test:watch`                   |
| All checks         | `pnpm check`                        |
| Start local DB     | `pnpm db:up`                        |
| Stop local DB      | `pnpm db:down`                      |
| Local DB logs      | `pnpm db:logs`                      |
| Check local DB     | `pnpm db:check`                     |
| Apply migrations   | `pnpm db:migrate`                   |
| Run the dashboard  | `pnpm --filter @taskmarket/web dev` |

`pnpm check` runs formatting checks, linting, type checking, and tests in
sequence. The database commands require Docker and are documented in
[docs/development.md](docs/development.md). The dashboard is a Next.js app that
reads the registry database directly (the local DB must be up and migrated); it
uses its own `typecheck` and `build` scripts under `apps/web`.

## Project structure

```
taskmarket/
├── apps/
│   └── web/      # Agent registry dashboard (Next.js: browse + manage agents)
├── packages/
│   ├── agent-kit/ # GOAT AgentKit integration (config, policy, runtime)
│   ├── agent-runtime/ # Minimal agent runtime (tool/action boundary)
│   └── agent-registry/ # Off-chain agent registry domain model + migrations
├── agents/      # Planned: TaskMarket's own agent implementations
├── docs/        # Architecture and engineering documentation
├── scripts/     # Repository utility scripts
├── tests/       # Repository-level tests (sanity + tooling checks)
└── .github/     # GitHub configuration (CI workflows)
```

The project is a pnpm workspace. Future applications, packages, and agents will
be added under `apps/`, `packages/`, and `agents/` respectively, each with its
own build, test, and type-check configuration extending the shared
`tsconfig.base.json`.

## Testing

The test runner is [Vitest](https://vitest.dev/). Tests currently cover the
foundation (an environment sanity check, environment validation, and local
database service checks) plus the GOAT AgentKit integration
(`packages/agent-kit/src/*.test.ts`): configuration parsing/validation and
initialization of the action provider, policy engine, and execution runtime,
and the minimal agent runtime (`packages/agent-runtime/src/*.test.ts`):
configuration, tool schemas, success/failure paths, policy blocking,
idempotency, health, metrics/log observability, and the service contract
(envelope schemas, Zod → JSON Schema conversion, OpenAPI generation, and
end-to-end request/response handling), and the agent registry
(`packages/agent-registry/src/*.test.ts`): domain logic, input validation,
status transitions, the in-memory repository, the registration API service
(authorization boundary, idempotent create, optimistic concurrency, validate),
capability discovery (normalization, filtering, ranking, pagination, safe
projection), the migration runner, a PostgreSQL integration test (skipped
when the database is unreachable), and the dashboard
(`apps/web/lib/*.test.ts`): form/input parsing, safe display projections
(endpoint metadata stripped), structured error → HTTP mapping, and an
integration test for the dashboard's server adapter (register → update →
disable → discovery against a real database). Run with `pnpm test`.

## Linting and formatting

- ESLint 9 with the `typescript-eslint` recommended ruleset
  ([`eslint.config.js`](eslint.config.js)).
- Prettier for formatting ([`.prettierrc.json`](.prettierrc.json)).

## License

[MIT](LICENSE)
