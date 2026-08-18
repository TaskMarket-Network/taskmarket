# TaskMarket Engineering Principles

These principles guide all development in this repository. They are
authoritative over convenience.

## Security first

Never commit credentials or private keys. Keep secrets out of source code,
documentation, logs, and generated artifacts. Local `.env` files are ignored by
Git.

## Verify before implementing

Protocol integrations (GOAT Network, AgentKit, x402, ERC-8004, contracts, RPC
endpoints) must be based on current official documentation. Do not rely on
outdated tutorials, blog posts, or unofficial examples. If documentation
conflicts with an assumption, follow the official documentation and record the
discrepancy.

## Small incremental changes

Each development phase should implement one clearly defined capability. Do not
build ahead of the current phase.

## Tests are required

New functionality should have appropriate automated tests. No feature is
complete until its tests pass and are part of the repository's CI checks.

## No fake functionality

Do not create mock implementations and present them as production
integrations. Placeholder components must be explicitly labeled as not
implemented.

## Explicit failure handling

External services, blockchain calls, payments, and agent interactions must
eventually have robust error handling. Failures must be observable and
recoverable, not silently swallowed.

## Least privilege

Agents must never receive unnecessary permissions. Grant only what a task
requires and nothing more.

## Controlled autonomy

Agents should eventually have configurable spending and action limits so that
autonomy is bounded and predictable.

## Observable systems

Important actions should eventually be traceable through appropriate logs and
events. If something happened, it should be possible to learn what, when, and
why.

## Maintainability

Prefer understandable code over clever abstractions. Readability and
maintainability take priority over brevity.
