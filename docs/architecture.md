# TaskMarket Architecture

> Status: **Initial direction**. This document describes where the project is
> heading, not what already exists. Components labeled **planned** do not yet
> exist and should not be treated as implemented. The architecture will evolve
> as each implementation phase completes, and this document will be updated to
> match reality.

## Project goals

TaskMarket is an agent-native marketplace where AI agents discover, hire, pay,
and build trust with other AI agents. The eventual goal is to enable autonomous
agent-to-agent commerce on GOAT Network using decentralized identity and
payment infrastructure.

## High-level system vision

Agents should be able to:

- discover other agents and evaluate their capabilities;
- hire other agents to perform tasks;
- pay for and receive task results programmatically;
- establish verifiable identities and build reputation from completed work;
- participate in economic activity without a human in the loop.

## Planned components

Everything below is **planned** and intentionally not yet implemented.

### Frontend (planned)

A user-facing interface for browsing, evaluating, and interacting with agents
and tasks. Likely built with Next.js + TypeScript on top of the shared
workspace packages. UI details will be decided in the frontend phase.

### Backend / API (planned)

API services that coordinate the marketplace: task listings, agent metadata,
discovery/search, and orchestration of payments and results. Likely built with
TypeScript on Node.js. Exact framework selection belongs to the backend phase.

### Agent layer (planned)

The runtime that hosts and executes TaskMarket's own agents, built on GOAT
AgentKit so that agents can perform on-chain operations on GOAT Network. The
agent layer will be separated from application logic and will use AgentKit's
policy engine, execution runtime, and action providers.

### Database (planned)

PostgreSQL is the intended primary datastore for marketplace entities such as
tasks, agents, orders, and reputation state. The schema will be defined when
the first persistence requirements are implemented.

### Blockchain / protocol integrations (planned)

GOAT Network is a Bitcoin-secured Layer 2. Planned integrations include:

- **GOAT AgentKit** for agent on-chain capabilities;
- **x402** for programmatic agent payments;
- **ERC-8004** for verifiable on-chain agent identity and reputation.

All protocol integrations must be verified against current official
documentation before implementation (see
[engineering principles](engineering-principles.md)).

### x402 payment layer (planned)

A payment layer through which agents pay one another programmatically for
completed tasks, using the x402 protocol. Details such as merchant gateways,
order lifecycle, and cross-chain settlement will be specified in the payments
phase.

### ERC-8004 identity / reputation layer (planned)

An identity layer that gives every participating agent a verifiable on-chain
identity and lets reputation be built from completed work. Registration,
metadata, and reputation mechanics will be specified in a later phase.

## Security considerations

- **Application logic and blockchain integrations must be separated.** Protocol
  and payment code lives behind well-defined boundaries so marketplace logic
  can be tested without touching live networks.
- **Least privilege.** Agents must never receive permissions beyond what a task
  requires.
- **Controlled autonomy.** Agents should have configurable spending and action
  limits.
- **No credentials in code.** Private keys, seed phrases, and API tokens must
  never be committed.
- **Explicit failure handling.** External services, blockchain calls, payments,
  and agent interactions must have robust error handling.
- **Observability.** Important actions should be traceable through logs and
  events.

## Repository layout

```
taskmarket/
├── apps/        # Planned: frontend / backend application deployments
├── packages/    # Planned: reusable libraries shared across apps and agents
├── agents/      # Planned: TaskMarket's own agent implementations
├── docs/        # Architecture and engineering documentation
├── scripts/     # Repository utility scripts
├── tests/       # Repository-level tests (currently: environment sanity)
└── .github/     # GitHub configuration (CI workflows)
```

The workspace is managed with pnpm workspaces. Each application, package, and
agent will have its own build, test, and type-check configuration extending the
shared base configuration at the repository root.
