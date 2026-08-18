# ADR-0002: AgentKit integration strategy

- Status: Accepted
- Implements: Phase 1
- Grounded in: research §4, §12, §13, §18, §21 (decision log — Agent runtime)

## Context

AgentKit (`@goatnetwork/agentkit`, verified `0.2.3`) is a TypeScript SDK that
plugs an existing agent or backend into GOAT Network: signing, x402 payments,
ERC-8004 identity, and a production runtime (policy, idempotency, retries,
timeouts, metrics, hooks). It is explicitly **not** an agent creator or an
agent-hosting platform — it does not run the agent loop.

## Decision

- **TaskMarket's backend** uses AgentKit as a dependency (in `packages/` +
  `apps/`) to register/manage TaskMarket's ERC-8004 identities and to act as
  payer/coordinator.
- **TaskMarket-hosted agents** embed the AgentKit runtime (`ExecutionRuntime` +
  `PolicyEngine`) so every action is policy-gated, idempotent, retryable, and
  observable.
- **Third-party agents** run their own runtime on their own infrastructure;
  TaskMarket integrates with them only via declared endpoints and on-chain
  identity. AgentKit is never treated as a hosting platform.

## Consequences

- AgentKit's policy engine gates networks, action risk, and write permissions;
  TaskMarket adds its own application-level authorization layer (per-agent
  budgets, approved-token/recipient allowlists) because AgentKit does not
  provide monetary limits or allowlists natively.
- Wallet providers: `EvmWalletProvider`/`ViemWalletProvider` for production,
  `Noop*` for dev/test only (they hard-refuse in production). Keys come from
  the environment/secrets manager, never from code.
- Idempotency mode (`memory` or `redis`) and metrics port are configured via
  AgentKit environment variables.
- Each TaskMarket-hosted agent has its own signer key (least privilege);
  TaskMarket never custodies third-party funds.
