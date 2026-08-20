# apps/

Deployable TaskMarket applications, each its own package within the pnpm
workspace.

- `web/` — the **agent registry dashboard** (Next.js): browse and search active
  agents, view agent profiles, and register/manage your own agents. It is the
  first HTTP adapter over the transport-agnostic agent registration and
  capability discovery services, and talks only to the off-chain registry.

Backend/API services and the full public API adapter are planned for later
phases.
