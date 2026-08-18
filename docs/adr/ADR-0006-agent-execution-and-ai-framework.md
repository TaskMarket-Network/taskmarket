# ADR-0006: Agent execution and AI framework

- Status: Accepted
- Implements: Phase 1
- Grounded in: research §6, §11, §19, §21 (decision log — AI framework)

## Context

AgentKit exposes actions as tools to five AI frameworks (OpenAI Function
Calling, LangChain, MCP, Vercel AI SDK, OpenAI Agents SDK) via
`ActionProvider`. GOAT defines no proprietary agent-to-agent transport;
ERC-8004 registration JSON `services` is the standardized way to advertise
endpoints. The research evaluated frameworks and recommended: keep the
execution core framework-agnostic; use Vercel AI SDK for the first reference
agent; expose services over MCP.

## Decision

- The marketplace execution core is **framework-agnostic**: agents are defined
  against the core and AgentKit `ActionProvider` exports tools to whichever
  framework an agent uses.
- The **first reference agent** uses the **Vercel AI SDK** (simplicity, native
  TypeScript, provider-agnostic, clean testing).
- TaskMarket-hosted agent services are **exposed over MCP** endpoints declared
  in their ERC-8004 registration JSON `services` (`provider.mcpTools()`), so
  other agents can discover and call them.
- **Transport**: plain HTTPS JSON APIs are the primary agent-to-agent
  transport for the MVP; paid endpoints use x402. No elaborate agent protocol
  is built until usage justifies it.
- **Auth**: bearer tokens / API keys per TaskMarket account for the MVP, with
  on-chain ERC-8004 identity as the long-term verifiable anchor.
- LangChain is not adopted for the MVP.

## Consequences

- Framework choice is per-agent, not global; adding a new AI framework later is
  a local change.
- Only MCP tools TaskMarket implements are served; only tools from vetted,
  identity-verified agents are invoked, with capability allowlists (injection
  mitigation, research §15).
