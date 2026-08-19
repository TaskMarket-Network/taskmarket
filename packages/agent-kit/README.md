# @taskmarket/agent-kit

TaskMarket's isolated [GOAT AgentKit](https://docs.goat.network/docs/agents/agent-kit/overview)
integration. This package owns AgentKit configuration and initialization so
marketplace domain code never depends on the AgentKit SDK directly (see
[ADR-0002](../docs/adr/ADR-0002-agentkit-strategy.md) and
[ADR-0007](../docs/adr/ADR-0007-protocol-adapter-boundaries.md)).

AgentKit version: `@goatnetwork/agentkit@^0.2.3` (verified against the official
GOAT documentation and the npm registry).

## What is implemented

- **Configuration** (`src/config.ts`): a normalized `AgentKitConfig` type with
  safe, testnet-only defaults, a Zod schema for input validation, and a loader
  for the documented `AGENTKIT_*` environment variables. Invalid or unsafe
  input raises a structured `AgentKitConfigError`.
- **Initialization** (`src/agent-kit.ts`): `createActionProvider`,
  `createPolicyEngine`, `createExecutionRuntime`, and `createAgentKit`, which
  wire AgentKit's core runtime (policy → validation → idempotency → retries →
  metrics) behind a single entry point.
- **Network facts & config** (`src/network.ts`): verified GOAT Testnet3 and
  Alpha Mainnet parameters (chain IDs `48816`/`2345`, official RPC/backup/
  explorer URLs, BTC native currency, testnet faucet) plus
  `loadGoatNetworkConfig(env)`, which validates the `GOAT_*` environment
  variables and refuses mainnet in development unless explicitly gated.
- **Connectivity check** (`src/connectivity.ts`): `checkGoatNetworkConnectivity`
  probes the configured RPC endpoint with `eth_chainId` and `eth_blockNumber`,
  verifies the reported chain ID matches the network, and fails safely with a
  structured `AgentKitConnectivityError` on unreachable/timeout/malformed/
  mismatched responses. Read-only — it never sends transactions.

## Environment variables

| Variable                              | Default        | Purpose                                         |
| ------------------------------------- | -------------- | ----------------------------------------------- |
| `AGENTKIT_IDEMPOTENCY_MODE`           | `memory`       | Idempotency backend: `memory` or `redis`.       |
| `AGENTKIT_REDIS_URL`                  | _(none)_       | Required when mode is `redis`.                  |
| `AGENTKIT_METRICS_PORT`               | `9464`         | Prometheus metrics port.                        |
| `AGENTKIT_NETWORKS`                   | `goat-testnet` | Comma-separated allowed networks.               |
| `AGENTKIT_MAX_RISK_WITHOUT_CONFIRM`   | `low`          | Policy risk ceiling.                            |
| `AGENTKIT_WRITE_ENABLED`              | `true`         | Whether write actions are permitted.            |
| `AGENTKIT_RUNTIME_MAX_RETRIES`        | `2`            | Runtime retry count.                            |
| `AGENTKIT_RUNTIME_RETRY_DELAY_MS`     | `200`          | Runtime retry base delay (exponential backoff). |
| `AGENTKIT_RUNTIME_DEFAULT_TIMEOUT_MS` | _(none)_       | Global per-action timeout.                      |

GOAT network variables (see `docs/development.md` for the full table):

| Variable               | Default                             | Purpose                                    |
| ---------------------- | ----------------------------------- | ------------------------------------------ |
| `GOAT_NETWORK`         | `goat-testnet`                      | Active network for connectivity checks.    |
| `GOAT_TESTNET_RPC_URL` | `https://rpc.testnet3.goat.network` | Testnet RPC override.                      |
| `GOAT_MAINNET_RPC_URL` | `https://rpc.goat.network`          | Mainnet RPC override.                      |
| `GOAT_RPC_TIMEOUT_MS`  | `10000`                             | RPC request timeout (milliseconds).        |
| `GOAT_ALLOW_MAINNET`   | `0`                                 | `1` allows mainnet in dev (explicit gate). |

## Usage

```ts
import { createAgentKit, loadAgentKitConfig } from '@taskmarket/agent-kit';

const config = loadAgentKitConfig(process.env); // validated, testnet-safe defaults
const kit = createAgentKit(config);

const result = await kit.runtime.run(
  kit.provider.get('wallet.balance'),
  { traceId: 'trace_1', network: 'goat-testnet', now: Date.now() },
  { address: '0x...' },
);
```

Redis-backed idempotency is configurable but requires an injected
`IdempotencyStore` (see `createExecutionRuntime`); it fails safely with an
`AgentKitInitializationError` if `redis` mode is requested without one. The
local Redis stack is wired up in the phase that introduces the data-store
layer.

Wallet providers, ERC-8004, and payments are intentionally **out of scope** for
this package step; they are introduced by later Phase 1 tasks and phases.

## Development

```sh
pnpm --filter @taskmarket/agent-kit typecheck
pnpm test   # runs the whole workspace suite from the repository root
```
