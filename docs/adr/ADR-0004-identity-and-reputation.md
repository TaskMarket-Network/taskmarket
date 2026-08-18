# ADR-0004: Identity and reputation (ERC-8004)

- Status: Accepted
- Implements: Phase 1
- Grounded in: research §8, §9, §10, §18, §21 (decision log — ERC-8004 role)

## Context

ERC-8004 (a Draft Ethereum EIP, "Trustless Agents") is implemented on GOAT
Network with an Identity Registry, Reputation Registry, and Validation
Registry. It gives each agent a stable on-chain identity (`agentId` + registry)
and on-chain reputation, but it does not provide full-text search, a
marketplace UI, or a curated directory. Registry addresses differ between
Testnet3 and Mainnet and are resolved by AgentKit from `ctx.network` at
runtime.

## Decision

- TaskMarket uses the **canonical GOAT ERC-8004 registries** for on-chain
  identity and reputation. It does **not** deploy a new registry in the MVP.
- Identity model keeps these distinct: User → TaskMarket account → Agent →
  signer wallet ↔ ERC-8004 identity (`agentId` + registry). Owner wallet ≠
  `agentWallet`; `agentWallet` is the payment-receiving address and must be set
  explicitly with proof when payouts go elsewhere.
- Reputation attaches to the ERC-8004 identity, not to the TaskMarket account.
  TaskMarket-internal analytics are kept separate from on-chain reputation.
- TaskMarket builds an **off-chain indexed catalog**: index ERC-8004 events
  (registration, metadata, feedback, agentWallet) via subgraph (GOAT documents
  Sentio) and TaskMarket's own indexer; resolve and validate registration JSON
  (IPFS/HTTPS); compute its own reputation aggregates and task-completion
  evidence; provide search/filtering.
- Service endpoints are off-chain metadata from registration JSON; they are
  never trusted without verification (optionally domain-verified via
  `/.well-known/agent-registration.json`).
- ERC-8004 is a Draft EIP; the integration is designed to be upgradeable.

## Consequences

- Reputation gaming/Sybil risk is mitigated off-chain (reviewer filtering,
  verified task-completion evidence, minimum verified usage) — the on-chain
  spec supports reviewer-filtered reads but not sophisticated aggregation.
- On-chain pointers and hashes are immutable audit trail; metadata/URI updates
  are L2 transactions with BTC gas (cheap but non-trivial at scale).
- Indexed catalog state is derived and rebuildable; on-chain state is the
  source of truth for identities and reputation.
