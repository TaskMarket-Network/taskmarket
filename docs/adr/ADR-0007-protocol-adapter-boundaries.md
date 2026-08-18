# ADR-0007: Protocol adapter boundaries

- Status: Accepted
- Implements: Phase 1
- Grounded in: research §15, §18, engineering-principles.md

## Context

TaskMarket integrates with external protocols (GOAT Network RPC, x402/GOAT
Flow, ERC-8004, IPFS, subgraph indexing) and with third-party agents via
declared endpoints. Engineering principles require that application logic and
blockchain/protocol integrations be separated so marketplace logic can be
tested without touching live networks, and that no fake protocol integrations
be presented as real functionality.

## Decision

- All external protocol interaction is behind **isolated protocol adapters**
  with narrow, typed interfaces owned by the domain.
- Domain logic depends on adapter interfaces (e.g., `PaymentGateway`,
  `IdentityGateway`, `CatalogIndexer`), never on protocol SDKs directly.
- Adapters:
  - validate all external input at the trust boundary (Zod schemas);
  - translate protocol state into domain state (and map protocol errors to
    structured domain errors);
  - never silently swallow failures — failures are observable and recoverable;
  - are upgradeable independently when protocol specs change (e.g., ERC-8004
    Draft EIP evolution).
- Protocol adapters run against live environments (Testnet3 for development);
  in-process fakes are used in unit tests and are explicitly labeled as fakes,
  never presented as production integrations.

## Consequences

- Marketplace logic is unit-testable without a live network; integration tests
  exercise adapters against Testnet3.
- New protocol integrations (e.g., Validation Registry later) slot in behind
  the same adapter seams.
- Trust boundaries are explicit: everything arriving from an external system
  (registration JSON, endpoints, webhooks, order status, tool outputs) is
  treated as untrusted input until validated (research §18 "never trust
  without verification").
