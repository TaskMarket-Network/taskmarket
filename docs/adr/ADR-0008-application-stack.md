# ADR-0008: Application stack (frontend / backend)

- Status: Accepted
- Implements: Phase 1 (backend) / Phase 3 (frontend)
- Grounded in: research §19 (Recommended MVP stack)

## Context

The MVP stack recommendation in the verified research is: Next.js + TypeScript
frontend; Node.js (22 LTS+) + TypeScript, ESM backend on Fastify; pnpm
workspaces (already configured); PostgreSQL + Redis; Vitest; Zod; pino.

## Decision

- **Frontend**: Next.js + TypeScript (React), consuming the TaskMarket API.
  Lives in `apps/web`. UI details are decided in the frontend phase.
- **Backend**: Node.js 22+ + TypeScript, ESM, **Fastify** (schema-validated,
  webhook-friendly). Lives in `apps/api`.
- **Validation**: Zod, matching AgentKit's use of Zod; schemas at every trust
  boundary.
- **Logging**: pino structured JSON, compatible with AgentKit's structured
  logger.
- **Testing**: Vitest (already configured).
- **Runtime/package manager**: Node 22+ and pnpm (already pinned,
  `pnpm@10.32.1`).

## Consequences

- Fastify's schema validation and webhook ergonomics fit the payment/webhook
  flows (ADR-0003); replacing the HTTP framework later is isolated to the
  `apps/api` boundary.
- Shared packages (`packages/*`) hold domain logic so frontend, backend, and
  agents share types without circular dependencies (see architecture §10).
- No framework change to frontend/backend is expected in the MVP; changes are
  re-evaluated per phase.
