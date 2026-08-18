# ADR-0001: Network selection

- Status: Accepted
- Implements: Phase 1
- Grounded in: research §3, §5.1, §21 (decision log — Network)

## Context

TaskMarket settles and transacts on GOAT Network. The verified research
documents two live environments: **GOAT Testnet3** (chain ID `48816`, RPC
`https://rpc.testnet3.goat.network`) for development, and **GOAT Network Alpha
Mainnet** (chain ID `2345`, RPC `https://rpc.goat.network`) for production.
Native gas is BTC (18 decimals). ERC-8004 registry addresses and GOAT Flow
contract/token/fee configuration differ between the two environments and must
never be assumed identical.

## Decision

- Development and integration tests run on **GOAT Testnet3** (chain ID `48816`).
  Testnet gas comes from the faucet
  (`https://bridge.testnet3.goat.network/faucet`).
- Production runs on **GOAT Network Alpha Mainnet** (chain ID `2345`).
- All chain parameters (RPC URLs, registry addresses, token contracts, fees,
  limits) are **runtime/deployment configuration, not a static matrix**. Builds
  must not hardcode one set of addresses for both networks; AgentKit resolves
  ERC-8004 addresses from `ctx.network` at runtime and the SDK network key is
  `goat-testnet` / `goat-mainnet`.
- Public RPCs are rate-limited; production uses dedicated/managed RPC
  infrastructure.
- Settlement-finality logic treats fast GOAT confirmation and Bitcoin finality
  as distinct states.

## Consequences

- Testnet3 behavior does not imply Mainnet behavior; the live environment must
  be read before each environment is configured.
- Environment separation is a first-class configuration concern (separate
  `.env` / deployment environments for Testnet3 vs Mainnet).
- No real money moves until an explicit production gate with human approval.
