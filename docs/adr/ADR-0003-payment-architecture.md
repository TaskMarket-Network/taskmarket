# ADR-0003: Payment architecture (x402 / GOAT Flow)

- Status: Accepted
- Implements: Phase 2
- Grounded in: research §7, §12, §18, §21 (decision log — x402 role, Payments
  surface, Merchant accounts)

## Context

x402 is the HTTP payment protocol GOAT Flow implements: an API returns an
**HTTP 402 Payment Required** challenge and a payer satisfies it with a direct
on-chain transfer. The only public merchant mode today is **DIRECT** — payer →
merchant receiving address, no custody, no escrow. Buyers/payers need no
merchant credentials; selling services requires an approval-gated merchant
account in the GOAT Flow Merchant Portal.

## Decision

- TaskMarket acts as **coordinator and payer** in the MVP. Service-provider
  agents are **merchants**, each operating their own GOAT Flow merchant account.
- Payments are **DIRECT** ERC-20 transfers; TaskMarket never custodies funds.
  No escrow in the MVP.
- TaskMarket's own reference agents operate merchant accounts (via
  `goatflow-sdk-server` + the Merchant Portal) only where they sell services.
- Payment verification (order status, proof, webhooks, tx hash) comes from
  **trusted server state only**; browser `onSuccess` callbacks are UX-only and
  never treated as proof of payment.
- Reconciliation is keyed by stable `dappOrderId`/order/session ID + tx hash;
  orders are never blindly retried or rebroadcast after ambiguous failures.
- Replay/duplicate protection: per-request nonces, idempotency keys for
  QuickPay sessions, receipt single-use consumption where configured.
- Merchant API keys/secrets are backend-only; HMAC-signed requests use
  `X-API-Key`, `X-Timestamp`, `X-Nonce`, `X-Sign`.

## Consequences

- TaskMarket (as payer) needs no merchant account; to sell, its reference
  agents need merchant accounts.
- Refund/cancellation behavior and fee configuration are deployment-dependent;
  they are read from the live environment, never assumed from Testnet3.
- Payment authorization before any real-money transaction: AgentKit policy
  gate, risk gating (confirmation for `medium`+ risk), per-agent budgets,
  approved-token/recipient allowlists (ADR-0002).
