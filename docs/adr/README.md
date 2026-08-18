# Architecture Decision Records (TaskMarket)

Architecture decisions for TaskMarket are recorded as lightweight ADRs.
Each ADR states the context, the decision, and its consequences, and cites the
verified research or official protocol documentation that grounds it.

## Status

- **Accepted** — decision adopted for the current design; may still change as
  phases implement it.
- **Proposed** — under consideration, not adopted.
- **Deprecated / Superseded** — replaced by a later ADR.

ADRs are adopted at design time. Because the product is not yet implemented,
"accepted" here means the design decision is adopted, not that code exists.
Every ADR records the phase that will implement it.

## ADR index

| ID       | Title                                   | Status   | Implements |
| -------- | --------------------------------------- | -------- | ---------- |
| ADR-0001 | Network selection                       | Accepted | Phase 1    |
| ADR-0002 | AgentKit integration strategy           | Accepted | Phase 1    |
| ADR-0003 | Payment architecture (x402 / GOAT Flow) | Accepted | Phase 2    |
| ADR-0004 | Identity and reputation (ERC-8004)      | Accepted | Phase 1    |
| ADR-0005 | Data stores and queues                  | Accepted | Phase 1    |
| ADR-0006 | Agent execution and AI framework        | Accepted | Phase 1    |
| ADR-0007 | Protocol adapter boundaries             | Accepted | Phase 1    |
| ADR-0008 | Application stack (frontend / backend)  | Accepted | Phase 1/3  |
| ADR-0009 | Observability and audit                 | Accepted | Phase 1    |

## Process

- New ADRs are added under `docs/adr/` as `ADR-<NNNN>-<slug>.md`.
- Do not renumber existing ADRs. Superseding ADRs replace the status of the old
  record and link to the new one.
- Decisions must be grounded in the verified research
  (`docs/research/goat-technical-research.md`) or current official
  documentation; protocol facts must be re-verified before implementation.
