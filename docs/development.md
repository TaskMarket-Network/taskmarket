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
- GOAT network configuration (`GOAT_NETWORK`, `GOAT_TESTNET_RPC_URL`,
  `GOAT_MAINNET_RPC_URL`, `GOAT_RPC_TIMEOUT_MS`, `GOAT_ALLOW_MAINNET`) and the
  RPC connectivity check are documented in
  [GOAT testnet connectivity](#goat-testnet-connectivity) below. The
  `@taskmarket/agent-kit` package (Phase 1) reads the documented `AGENTKIT_*`
  variables from `.env` for idempotency, metrics, and policy configuration; the
  safe local defaults are in `.env.example`.

## GOAT testnet connectivity

TaskMarket develops against **GOAT Testnet3** (chain ID `48816`, RPC
`https://rpc.testnet3.goat.network`) by default. The verified network facts and
the RPC connectivity check live in `packages/agent-kit`
(`src/network.ts`, `src/connectivity.ts`) and are exposed as a CLI check:

```sh
pnpm check:network
```

`check:network` probes the configured GOAT RPC endpoint with `eth_chainId` and
`eth_blockNumber`, verifies the reported chain ID matches the configured
network, and prints block/chain/latency. It exits non-zero on any failure
(unreachable, timeout, malformed response, or chain-ID mismatch). It is
read-only: it never sends transactions.

Environment variables (safe defaults in `.env.example`):

| Variable               | Default                             | Purpose                                                              |
| ---------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| `GOAT_NETWORK`         | `goat-testnet`                      | Active network: `goat-testnet`/`goat-mainnet`.                       |
| `GOAT_TESTNET_RPC_URL` | `https://rpc.testnet3.goat.network` | Testnet RPC override.                                                |
| `GOAT_MAINNET_RPC_URL` | `https://rpc.goat.network`          | Mainnet RPC override.                                                |
| `GOAT_RPC_TIMEOUT_MS`  | `10000`                             | RPC request timeout (milliseconds).                                  |
| `GOAT_ALLOW_MAINNET`   | `0`                                 | `1` allows `goat-mainnet` in development (explicit production gate). |

Mainnet is refused in development unless `GOAT_ALLOW_MAINNET=1` (or
`NODE_ENV=production`), and the connectivity check verifies the chain ID before
reporting success.

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

| Task               | Command              |
| ------------------ | -------------------- |
| Verify environment | `pnpm preflight`     |
| Format code        | `pnpm format`        |
| Check formatting   | `pnpm format:check`  |
| Lint               | `pnpm lint`          |
| Type check         | `pnpm typecheck`     |
| Run tests          | `pnpm test`          |
| Run tests (watch)  | `pnpm test:watch`    |
| Validate env       | `pnpm check:env`     |
| Check GOAT RPC     | `pnpm check:network` |
| All checks         | `pnpm check`         |

`pnpm check` runs formatting checks, linting, type checking, and tests in
sequence. It does not require the database stack.

## GOAT AgentKit integration (`@taskmarket/agent-kit`)

Phase 1 introduces `packages/agent-kit`, TaskMarket's isolated GOAT AgentKit
integration. It owns AgentKit configuration and initialization behind a clean
internal interface (see the package README for the full API):

- `loadAgentKitConfig(env)` / `resolveAgentKitConfig(input)` — parse and
  validate the documented `AGENTKIT_*` environment variables (idempotency
  mode, Redis URL, metrics port, allowed networks, policy risk ceiling, write
  permissions) with Zod, falling back to safe testnet-only defaults. Invalid
  values throw a structured `AgentKitConfigError`.
- `createAgentKit(config)` — build the `ActionProvider` (base read-only wallet
  actions), `PolicyEngine`, and `ExecutionRuntime` in one call.

The integration defaults to `goat-testnet` only, `maxRiskWithoutConfirm: low`,
and in-memory idempotency. Redis idempotency is supported by configuration but
requires an injected `IdempotencyStore`; the local Redis stack is wired up in
the phase that introduces the data-store layer.

## Agent runtime (`@taskmarket/agent-runtime`)

Phase 1 also introduces `packages/agent-runtime`, the minimal TaskMarket agent
runtime built on `@taskmarket/agent-kit`. It provides the small, testable
tool/action boundary every TaskMarket-hosted agent runs on (see the package
README for the full API):

- `loadAgentRuntimeConfig(env)` / `resolveAgentRuntimeConfig(input)` — parse
  and validate the documented `AGENT_RUNTIME_*` environment variables
  (agent id/name/description/version, declared capabilities, default network,
  log level) with Zod, falling back to safe testnet-only defaults.
- `createAgentRuntime(config, deps)` — build the tool registry, register the
  base read-only tools (`agent.ping`, `agent.capabilities`, `wallet.balance`,
  `wallet.resolve_token`), and wire them onto an AgentKit `ActionProvider` with
  the `PolicyEngine` and `ExecutionRuntime`. `runTool(name, input, options)`
  returns a structured `ToolResult` and every call is policy-gated, idempotent,
  retryable, and observable.
- `health()`, `listCapabilities()`, and `metricsSnapshot()` provide
  liveness/identity, capability, and in-process metrics introspection.

Environment variables (safe defaults in `.env.example`):

| Variable                          | Default                                       | Purpose                                            |
| --------------------------------- | --------------------------------------------- | -------------------------------------------------- |
| `AGENT_RUNTIME_AGENT_ID`          | `taskmarket-reference`                        | Stable agent identifier.                           |
| `AGENT_RUNTIME_AGENT_NAME`        | `TaskMarket Reference Agent`                  | Human-readable agent name.                         |
| `AGENT_RUNTIME_AGENT_DESCRIPTION` | `Minimal TaskMarket agent runtime (Phase 1).` | One-line description.                              |
| `AGENT_RUNTIME_AGENT_VERSION`     | `0.1.0`                                       | Agent build/semantic version.                      |
| `AGENT_RUNTIME_CAPABILITIES`      | `agent:meta,wallet:read`                      | Comma-separated declared capability keys.          |
| `AGENT_RUNTIME_DEFAULT_NETWORK`   | `goat-testnet`                                | Network tools execute against.                     |
| `AGENT_RUNTIME_LOG_LEVEL`         | `info`                                        | Minimum log level (`debug`/`info`/`warn`/`error`). |

Only read-only tools are registered; the runtime never moves funds or writes to
chain. The agent service contract (input/output schemas, versioning, auth,
health) is introduced in step 01-04.

## Project structure

```
taskmarket/
├── apps/        # Planned: frontend / backend application deployments
├── packages/
│   ├── agent-kit/ # GOAT AgentKit integration (config, policy, runtime)
│   └── agent-runtime/ # Minimal agent runtime (tool/action boundary)
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
