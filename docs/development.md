# TaskMarket — Local Development Environment

This guide makes local development reproducible for humans and AI agents.
The repository is a pnpm workspace. All commands run from the repository root.

## Prerequisites

- **Node.js 22 LTS or newer** (developed and tested on Node.js 24).
- **pnpm 9+** (developed and tested on pnpm 10). The package manager is pinned
  in `package.json` via `packageManager`; use Corepack or install pnpm directly.
- **Docker** (for the local PostgreSQL and Redis services). Required only if
  you want the local database stack; not needed for pure code checks.

Verify the toolchain:

```sh
pnpm preflight
```

`preflight` checks the Node/pnpm versions and validates the environment
configuration (see [Environment](#environment)).

## Install

```sh
pnpm install
```

This installs all workspace dependencies and generates `pnpm-lock.yaml`. Use
`pnpm install --frozen-lockfile` in CI to install exactly the locked versions.

## Environment

Copy the example environment file only if you need local database services or
custom configuration:

```sh
cp .env.example .env
```

The defaults in `.env.example` are safe local-development values (testnet-
oriented, no real credentials). They point at the Docker Compose services.
Local `.env` files are git-ignored; never commit real secrets.

- `pnpm preflight` refuses `NODE_ENV=production` and flags anything that looks
  like a private key in `.env`.
- `pnpm check:env` runs the same validation standalone.
- GOAT Network variables (RPC URLs, wallet/key configuration, GOAT Flow
  merchant endpoints) are added in the phase that introduces GOAT AgentKit
  integration. Until then, the foundation requires no runtime environment
  variables.

## Local database stack

PostgreSQL and Redis run locally via Docker Compose (see
[docker-compose.dev.yml](../docker-compose.dev.yml)). Both are provisioned but
no application code consumes them yet; they are used by later phases for
application state, idempotency, queues, and rate limiting (ADR-0005).

| Command         | Purpose                                                                        |
| --------------- | ------------------------------------------------------------------------------ |
| `pnpm db:up`    | Start Postgres + Redis and wait until they are healthy.                        |
| `pnpm db:check` | Verify the configured services are reachable.                                  |
| `pnpm db:logs`  | Follow container logs.                                                         |
| `pnpm db:down`  | Stop services. Data persists in named volumes (`postgres-data`, `redis-data`). |

`db:check` reads `DATABASE_URL` and `REDIS_URL` from `.env` (or the safe local
defaults) and probes reachability. If a configured service is unreachable it
exits non-zero and prints `pnpm db:up` as the remedy.

## Daily workflow

| Task               | Command             |
| ------------------ | ------------------- |
| Verify environment | `pnpm preflight`    |
| Format code        | `pnpm format`       |
| Check formatting   | `pnpm format:check` |
| Lint               | `pnpm lint`         |
| Type check         | `pnpm typecheck`    |
| Run tests          | `pnpm test`         |
| Run tests (watch)  | `pnpm test:watch`   |
| Validate env       | `pnpm check:env`    |
| All checks         | `pnpm check`        |

`pnpm check` runs formatting checks, linting, type checking, and tests in
sequence. It does not require the database stack.

## Project structure

```
taskmarket/
├── apps/        # Planned: frontend / backend application deployments
├── packages/    # Planned: reusable libraries shared across apps and agents
├── agents/      # Planned: TaskMarket's own agent implementations
├── docs/        # Architecture, ADRs, and engineering documentation
├── scripts/     # Repository utility scripts
├── tests/       # Repository-level tests
└── .github/     # GitHub configuration (CI workflows)
```

## Troubleshooting

- **`pnpm db:check` fails**: ensure Docker is running, then `pnpm db:up`.
  If host ports 5432/6379 are taken, override `DATABASE_URL`/`REDIS_URL` (or
  `POSTGRES_*`/`REDIS_*`) in `.env` and change the compose port mapping.
- **`pnpm preflight` fails on Node/pnpm**: install the versions from
  [Prerequisites](#prerequisites).
- **`pnpm preflight` fails on the environment check**: read the error from
  `check-env`; typically `NODE_ENV=production` set in `.env` or a real private
  key detected. Remove or fix the offending value.
