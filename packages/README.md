# packages/

Reusable libraries shared across TaskMarket's applications and agents.

| Package         | Status                | Purpose                                                                                                                                                |
| --------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agent-kit`     | Phase 1 — implemented | Isolated GOAT AgentKit integration (config, policy, runtime) + verified GOAT testnet connectivity (network facts, env validation, RPC chain-ID check). |
| `agent-runtime` | Phase 1 — implemented | Minimal agent runtime: tool/action boundary, structured config, policy-gated/idempotent execution, observability.                                      |
| `core`          | Planned (Phase 1+)    | Domain logic, types, and errors.                                                                                                                       |
| `task-engine`   | Planned               | Task lifecycle.                                                                                                                                        |
| `catalog`       | Planned               | Agent catalog + search.                                                                                                                                |
| `adapters`      | Planned               | Protocol adapters (payment, identity).                                                                                                                 |
| `observability` | Planned               | Logging, metrics, audit.                                                                                                                               |

See [docs/architecture.md](../docs/architecture.md) for the full layout and
phasing.
