# GOAT Network Technical Research — TaskMarket

```text
Research date: 2026-08-18
Research scope: GOAT Network / AgentKit / x402 / ERC-8004 / agent infrastructure
Status: Verified against official GOAT documentation, official GitHub
        repositories, the Ethereum EIP-8004 draft, and the live npm registry.
```

> Purpose: This report is the technical basis for the TaskMarket architecture
> design (Phase 0, Step 3). It is research only. Nothing here is implemented.
> "Verified" statements come from official sources. "Recommendation" statements
> are TaskMarket decisions and are labeled as such.

---

## 1. Executive summary

TaskMarket can be built today on the current GOAT stack with these building
blocks:

- **GOAT Network** — an EVM-compatible (Type-1 zkEVM) Bitcoin-secured L2.
  Native gas asset is BTC. Live mainnet (chain ID `2345`) and testnet
  (`Testnet3`, chain ID `48816`).
- **AgentKit** (`@goatnetwork/agentkit`, currently `0.2.3`) — a TypeScript SDK
  that plugs into an existing agent or backend: 118 on-chain actions across 15
  plugins, a production runtime (policy, idempotency, retries, timeouts,
  metrics, hooks), and adapters for five AI frameworks. It is **not** an agent
  creator or an agent-hosting platform.
- **GOAT Flow** — GOAT's x402 payment product. Supports pay-per-request APIs,
  hosted checkout, QuickPay (agent/CLI payer surface), and an MPP profile for
  paid API routes. Payment is a direct ERC-20 transfer from payer to merchant
  receiving address (DIRECT mode). Merchants must register/be approved in the
  Merchant Portal.
- **ERC-8004** — a Draft Ethereum standard ("Trustless Agents") implemented on
  GOAT Network with an Identity Registry, Reputation Registry, and Validation
  Registry. AgentKit wraps it as the `erc8004` plugin (9 actions). This is the
  intended on-chain identity + reputation layer for TaskMarket.
- **GOAT AI Builder Grants Program** — active. Current page (2026-08-18) states
  a **$2,000** base grant and a **$1,000,000** Singularity allocation. Apply via
  Tally. Requires real usage and integral x402 and/or ERC-8004 integration.

**Recommended architectural direction (details in §18–19):** TaskMarket acts as
marketplace **coordinator and payer**, while service-provider agents operate as
**merchants** (each with their own GOAT Flow merchant account). Agent identity
lives in **ERC-8004** (on-chain), with **off-chain indexed catalogs** built by
TaskMarket for discovery/search. Agent execution is **framework-agnostic**; the
first reference agent uses the **Vercel AI SDK** with AgentKit actions exported
as tools, and agents expose services over **HTTPS + MCP** endpoints declared in
their ERC-8004 registration JSON. TaskMarket never custodies agent funds.

---

## 2. GOAT Network fundamentals

Verified from https://docs.goat.network/docs/network/overview ,
https://docs.goat.network/docs/network/execution-environment , and
https://docs.goat.network/docs/build/networks-rpc .

| Topic                   | Verified fact                                                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What it is              | Bitcoin-secured infrastructure for the Digital Economy; a settlement + execution + identity + payment platform for humans and AI agents.                                                                                      |
| Relationship to Bitcoin | Settlement anchored to Bitcoin. Uses a BitVM2-based trust-minimized bridge (1-of-n honest assumption, permissionless challenges), Ziren (zkVM), and decentralized sequencing.                                                 |
| EVM compatibility       | Designed as a **Type-1 zkEVM**; Ethereum-equivalent execution semantics. Solidity, ethers.js, viem, Hardhat, Foundry, and existing EVM tooling work with minimal changes.                                                     |
| Execution environment   | Programmable EVM execution on Bitcoin-secured rails; fast L2 confirmation first, Bitcoin-backed finality later.                                                                                                               |
| Settlement model        | Fast sequencer confirmation (seconds) → publication to Bitcoin (10–60 min) → finalized after sufficient Bitcoin confirmations (~1 hr for 6 confs).                                                                            |
| Native gas asset        | **BTC**, 18 decimals (nativeCurrency symbol `BTC`).                                                                                                                                                                           |
| Fee model               | EIP-1559-style, denominated in BTC; no blob fees. Min base fee 7 wei, min priority fee 130000 wei. Fees split ~98% sequencers, ~2% foundation. Docs claim "sub-cent" transaction costs for high-frequency agent interactions. |
| Mainnet                 | **Alpha Mainnet** is live.                                                                                                                                                                                                    |
| Testnet                 | **Testnet3** is live.                                                                                                                                                                                                         |
| Developer assumptions   | Gas budgets in BTC; distinguish fast GOAT confirmation from Bitcoin finality; public RPC endpoints are rate-limited (production should use dedicated/managed infrastructure).                                                 |
| Developer chat          | GOAT Developer Chat (Telegram) linked from the docs.                                                                                                                                                                          |

TaskMarket relevance: agents settle and transact on GOAT Network mainnet for
production and Testnet3 for development. All settlement-finality logic must
treat fast confirmation and Bitcoin finality as distinct states.

---

## 3. Network configuration (verified)

Source: https://docs.goat.network/docs/build/networks-rpc (designated "source
of truth" for public network parameters). Cross-checked against
https://docs.goat.network/docs/agents/agent-kit/overview (AgentKit supported
networks) and https://docs.goat.network/docs/build/goat-flow/flow-quick-start.

| Environment | Network Name                 | Chain ID | RPC                                 | Explorer                                 | Notes                                                                                                                                                       |
| ----------- | ---------------------------- | -------: | ----------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test        | GOAT Testnet3                |    48816 | `https://rpc.testnet3.goat.network` | `https://explorer.testnet3.goat.network` | Backup RPC `https://rpc.ankr.com/goat_testnet`; bridge/faucet `https://bridge.testnet3.goat.network` (faucet at `/faucet`); native gas BTC (18 decimals).   |
| Production  | GOAT Network (Alpha Mainnet) |     2345 | `https://rpc.goat.network`          | `https://explorer.goat.network`          | Backup RPC `https://rpc.ankr.com/goat_mainnet`; archive `https://archive.goat.network`; bridge `https://bridge.goat.network`; native gas BTC (18 decimals). |

Wallet chain IDs: mainnet `0x929`, Testnet3 `0xBEB0`.

**Discrepancy notes (no blocking conflicts):**

1. AgentKit upstream calls the network `goat-testnet` and the testnet is branded
   "Testnet3" in docs. Both map to chain ID `48816` and RPC
   `https://rpc.testnet3.goat.network`. Not a conflict — one is the SDK network
   key, the other the public label. Use `goat-testnet` as the SDK network key.
2. The GOAT Flow quick-start documents both environments and explicitly warns
   that Testnet3 configuration (chains, tokens, contracts, fees, limits) does
   not imply identical Mainnet configuration. Supported chains/tokens are
   runtime/deployment configuration, not a static matrix. Do not hardcode a
   chain/token matrix.

**Testnet limitations:** public RPCs are rate-limited; Testnet3 requires gas
from the faucet; supported transfer/verification capabilities and token
contracts are deployment-specific and must be read from the live environment.

---

## 4. AgentKit

Verified from https://docs.goat.network/docs/agents/agent-kit/overview ,
quick-start, plugins, runtime, frameworks, and CLI pages, the official
repository https://github.com/GOATNetwork/agentkit , and the npm registry.

### 4.1 What AgentKit is and is not

- **Is:** the GOAT Network counterpart to Coinbase AgentKit — a TypeScript SDK
  that plugs an existing agent or app into GOAT Network. It signs transactions,
  accepts GOAT Flow payments, registers ERC-8004 identity, and exposes a common
  capability surface to five AI frameworks.
- **Is NOT:** an agent creator, an agent-hosting platform, a full agent
  framework, or a marketplace runtime. It does not run your agent loop; your
  framework does.

### 4.2 Installation, packages, requirements

- Package: **`@goatnetwork/agentkit`** — latest `0.2.3` (npm `dist-tags.latest`,
  last modified 2026-07-21). ESM, exports subpaths `./core`, `./plugins`,
  `./adapters`, `./providers`, `./networks`.
- Bundles its own core deps: `ethers` ^6.15, `viem` ^2.46, `zod` ^3.24,
  `ioredis` ^5.7, `zod-to-json-schema` ^3.24, `commander` ^12.1.
- Node.js 18+ per docs; pnpm or npm. TaskMarket already targets Node 22 LTS+.
- Install: `npm install @goatnetwork/agentkit`.
- Scaffold CLI: `npm create goat-agent` (published as `create-goat-agent`,
  currently `0.1.4`); presets minimal / defi / full; network goat-testnet or
  goat-mainnet.
- Two end-user CLIs ship on the package: `agentkit-gns` (.goat names) and
  `agentkit-giftcard` (paid giftcard purchases).

### 4.3 Architecture

Four layers (verified):

```text
Adapters (OpenAI · LangChain · MCP · Vercel AI · OpenAI Agents)
Providers  (ActionProvider · customActionProvider · Tool Manifest)
Plugins    (15 modules, 118 actions)
Core Runtime Engine (Policy → Validation → Idempotency → Retry → Timeout → Metrics → Hooks)
```

- **Core:** `ExecutionRuntime` + `PolicyEngine`; structured JSON logger,
  Prometheus metrics (`/metrics`, `AGENTKIT_METRICS_PORT`), idempotency
  (memory/Redis, TTL default 3600s), retries (exponential backoff,
  `noRetryHighRiskWrites` default true), timeouts, execution hooks.
- **Plugins:** `plugins/*/actions/*.ts`, each action is an `ActionDefinition`
  with Zod schemas, risk level, network support, optional
  `requiresConfirmation` and `sensitiveOutputFields`.
- **Providers:** `ActionProvider` registers actions and generates JSON Schema
  tool manifests via `zod-to-json-schema`.
- **Adapters:** convert actions to tool formats for the five frameworks.
- **Networks:** chain adapter layer for `goat-mainnet` (2345) and
  `goat-testnet` (48816).

### 4.4 Wallets

- `EvmWalletProvider` (ethers.js) — full featured, contract writes/deploys.
- `ViemWalletProvider` (viem).
- `NoopWalletProvider` / `NoopWalletReadAdapter` — development/testing only;
  throws in production (`NODE_ENV=production`). `NoopWalletProvider` defaults
  to chain ID 48816 (Testnet3).
- Wallets take a private key from environment (`PRIVATE_KEY`) and an RPC
  provider. Token symbol resolution uses the built-in GOAT token registry
  (WGBTC, GOAT, BRIDGE, BITCOIN, OKU_*, LZ_ENDPOINT).

### 4.5 Environment variables (verified)

- `GOAT_MAINNET_RPC_URL=https://rpc.goat.network`
- `GOAT_TESTNET_RPC_URL=https://rpc.testnet3.goat.network`
- `PRIVATE_KEY=0x...`
- `AGENTKIT_IDEMPOTENCY_MODE=memory|redis`, `AGENTKIT_REDIS_URL`
- `AGENTKIT_METRICS_PORT=9464`
- GOAT Flow merchant vars: `MERCHANT_API_BASE_URL`, `MERCHANT_API_KEY`,
  `MERCHANT_PORTAL_BASE_URL`, plus GoatAdapter vars `GOAT_X402_BASE_URL`,
  `GOAT_X402_API_KEY`, `GOAT_X402_API_SECRET`.

### 4.6 How TaskMarket should use AgentKit

Recommendation: **combination of backend dependency and package used by
individual agents.**

- TaskMarket's own backend uses AgentKit to register and manage TaskMarket's
  ERC-8004 identities and to act as a payer/coordinator — i.e., an integration
  layer and backend dependency (in `packages/` + `apps/`).
- TaskMarket's own agents embed the AgentKit runtime (`ExecutionRuntime` +
  `PolicyEngine`) so every action is policy-gated, idempotent, retryable, and
  observable — i.e., the core runtime for TaskMarket-hosted agents.
- Third-party agents that join the marketplace should run their own AgentKit
  runtime on their own infrastructure; TaskMarket only integrates with them
  through their declared endpoints and on-chain identity.
- TaskMarket should NOT treat AgentKit as an agent-hosting platform.

---

## 5. AgentKit plugins relevant to TaskMarket

Source: https://docs.goat.network/docs/agents/agent-kit/plugins and the
AgentKit repository README.

| Plugin        | Purpose                                                                                                                   | Relevant?       | Why                                                                                                                                                          | Phase          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| wallet        | 10 actions: ERC-20 transfer/approve/balance, contract read/write, deploy, token resolution                                | **Yes**         | Foundation for every agent wallet operation, balance checks, and token handling.                                                                             | Core / Phase 1 |
| x402 (payer)  | 5 actions: `goat.x402.payment.create/submitSignature/transfer/status/cancel` (EIP-712 signing, DIRECT transfer)           | **Yes**         | Lets TaskMarket/agents pay other agents programmatically without a human account.                                                                            | Phase 2        |
| x402-merchant | 30 actions: merchant portal management (auth, orders, balance, webhooks, API keys, audit logs)                            | **Yes** (later) | Needed only if TaskMarket itself operates merchants (its own reference agents, or managed merchant services). Third-party merchants use the portal directly. | Phase 2/3      |
| erc8004       | 9 actions: register, set_agent_uri, get/set_metadata, get_agent_wallet, give/revoke_feedback, get_reputation, get_clients | **Yes**         | Core identity + reputation primitive for the marketplace.                                                                                                    | Phase 1        |
| gns           | 15 actions: `.goat` ENS-style names, incl. cross-chain x402-paid registration                                             | **Maybe**       | Optional human-readable naming layer. Not required for MVP; evaluate after ERC-8004 identity works.                                                          | Phase 3+       |
| faucet        | 2 actions: request-funds, get-chains                                                                                      | **Yes (dev)**   | Testnet funding during development only.                                                                                                                     | Dev            |
| giftcard      | 8 actions: GOAT Flow giftcard purchase                                                                                    | No              | Consumer giftcard product; out of scope.                                                                                                                     | —              |
| dex           | 7 actions: OKU (Uniswap V3) swap/quote/liquidity (mainnet only)                                                           | No              | DeFi; not needed for MVP.                                                                                                                                    | —              |
| bridge        | 7 actions: Bridge.sol withdraw/cancel/refund/replace-by-fee/status                                                        | No (later)      | Needed only if TaskMarket bridges funds across chains.                                                                                                       | Phase 3+       |
| bitvm2        | 10 actions: BTC bridge + staking                                                                                          | No              | Not MVP.                                                                                                                                                     | —              |
| layerzero     | 3 actions: OFT cross-chain                                                                                                | No              | Not MVP.                                                                                                                                                     | —              |
| erc721        | 3 actions                                                                                                                 | No              | Not MVP.                                                                                                                                                     | —              |
| wgbtc         | 3 actions: WGBTC wrap/unwrap                                                                                              | No              | Not MVP.                                                                                                                                                     | —              |
| goat-token    | 3 actions: governance delegate/votes                                                                                      | No              | Not MVP.                                                                                                                                                     | —              |
| bitcoin       | 3 actions: BTC light client                                                                                               | No              | Not MVP.                                                                                                                                                     | —              |

### 5.1 Risk levels

Every action declares a risk level used by the PolicyEngine: `read` (0) <
`low` (1) < `medium` (2) < `high` (3). Examples: wallet balance/contract read =
`read`; faucet request = `low`; approve ERC-20 / create payment = `medium`;
transfer, swap, deploy, register agent = `high`. Actions with
`requiresConfirmation: true` always require confirmation regardless of policy.

---

## 6. AI framework compatibility

Source: https://docs.goat.network/docs/agents/agent-kit/frameworks .

Five supported adapters (define an action once, export everywhere):

| Adapter                 | Function                       | Notes                                      |
| ----------------------- | ------------------------------ | ------------------------------------------ |
| OpenAI Function Calling | `provider.openAITools()`       | Classic OpenAI `tools` format.             |
| LangChain               | `provider.langChainToolDefs()` | LangChain tools.                           |
| MCP                     | `provider.mcpTools()`          | Model Context Protocol tool server format. |
| Vercel AI SDK           | `provider.vercelAITools()`     | Vercel AI SDK tools.                       |
| OpenAI Agents SDK       | `provider.openAIAgentsTools()` | OpenAI Agents SDK.                         |

Evaluation for TaskMarket (recommendation):

| Option                  | Simplicity           | TS support   | Tool integration                | Maintainability          | A2A suitability                       | Testing     | Extensibility            |
| ----------------------- | -------------------- | ------------ | ------------------------------- | ------------------------ | ------------------------------------- | ----------- | ------------------------ |
| OpenAI Function Calling | High                 | High         | High (AgentKit adapter)         | High                     | Medium (no lifecycle)                 | High        | Medium                   |
| OpenAI Agents SDK       | Medium               | High         | High                            | Medium-High              | Medium (task model exists)            | Medium-High | Medium                   |
| LangChain               | Low                  | High         | High                            | Low (heavy abstractions) | Low-Medium                            | Medium      | Low                      |
| MCP                     | High (as a protocol) | Medium (SDK) | High (AgentKit emits MCP tools) | High                     | **High** (standard for tool exchange) | Medium      | High                     |
| Vercel AI SDK           | High                 | High         | High                            | High                     | Medium-High                           | High        | High (provider-agnostic) |

**Recommendation:** Keep the marketplace execution core **framework-agnostic** —
AgentKit's `ActionProvider` already produces tools for all five, so TaskMarket
should not hard-bind to one framework. For the first reference agent, use the
**Vercel AI SDK** (simplicity, native TypeScript, provider-agnostic, clean
testing). **Expose TaskMarket agent services over MCP** endpoints (declared in
ERC-8004 `services`) so other agents can discover and call them — MCP is the
protocol-level fit for agent-tool exchange. Do not adopt LangChain for the MVP.

---

## 7. x402 / GOAT Flow

Sources: https://docs.goat.network/docs/build/goat-flow/overview , integration,
merchant-guide, flow-quick-start, https://docs.goat.network/docs/agents/agent-kit/payments ,
and the official repository https://github.com/GOATNetwork/x402 .

### 7.1 What x402 is

**GOAT Flow** is the product (GOAT's x402 commerce + payment-verification
platform). **x402** is the HTTP payment protocol used by its order/checkout
surfaces. x402 is the open payment protocol that lets an API return an
**HTTP 402 Payment Required** challenge that a payer satisfies with an on-chain
transfer.

### 7.2 Payment flow (verified)

1. Merchant backend creates an order.
2. API returns HTTP 402 with a challenge containing payment options in
   `accepts[]` (network, token contract, amount, `payTo`).
3. Buyer wallet sends the required ERC-20 **transfer directly to the merchant
   receiving address** (DIRECT mode / `ERC20_DIRECT`).
4. Merchant backend polls order status or receives a deployment-defined
   webhook.
5. After confirmation the merchant requests the server-issued payment record
   and can independently verify the transaction hash on-chain.

### 7.3 Payer flow

- `goatflow-sdk-server` (TS, `0.3.0`, Node >= 18; Go module too) — HMAC-auth
  client for creating orders, checkout sessions, status/proof, cancel.
  `createOrder()` treats HTTP 402 as success; unexpected 402 fails closed.
- `goatflow-sdk` (browser, `0.2.1`) — `PaymentHelper.pay()` validates balance,
  submits the ERC-20 transfer, waits for receipt. **It does not validate
  chain/payer/expiry** — callers must validate.
- `goatflow-checkout` (`0.1.0`) — hosted checkout opener (QuickPay product or
  opaque `checkoutId` session).
- `goatflow-quickpay` (`0.3.0`) — manifest-driven payer library + CLI
  (`inspect`, `pay-x402`, `pay-product`, `pay-mpp`) for agents/CLI, no merchant
  credentials needed by the payer.
- AgentKit `x402` plugin — payer side with `MerchantGatewayAdapter` +
  `PayerWalletAdapter`, EIP-712 signing, and runtime execution.

### 7.4 Merchant / service-provider flow

- Merchants register in the **GOAT Flow Merchant Portal** (application → review
  → approval). Required before accepting payments.
- Registration requires merchant ID (immutable), business name, work email,
  password; 2FA per user; team invite codes (single-use, 72–720 h expiry).
- Configure receiving addresses: one valid receiving address per accepted
  (chain, token) pair.
- API keys optional, needed only for programmatic DIRECT flows. API Key + API
  Secret (HMAC-SHA256 signing with `X-API-Key`, `X-Timestamp`, `X-Nonce`,
  `X-Sign`). Secret shown once; backend-only.
- Webhooks: up to 3, HTTPS only, one-time webhook secret, events like
  `order.invoiced`, `quickpay.payment.confirmed` (environment-dependent).
- Fees: prepaid **Fee Balance** (top-up via USDC/USDT); platform fee
  configuration is per-environment/per-chain; orders can stop when balance is
  depleted. Never assume Testnet3 fees equal Mainnet fees.
- QuickPay: public hosted checkout + `agent.md` + `manifest.json` for agents;
  products with token-agnostic decimal `price`; custom-amount mode.
- MPP profile: fixed-price paid API routes (`GET:api:data` canonical form),
  challenge (HTTP 402) → direct transfer → `/mpp/v1/verify` → signed
  `Payment-Receipt` header → protected route. **Note:** MPP is an independent
  open protocol; GOAT Flow's profile uses GOAT-specific JSON endpoints and a
  signed receipt extension, not the generic MPP wire format. No published
  interop test with official MPP SDKs.

### 7.5 Order lifecycle & audit

- Order statuses: `CHECKOUT_VERIFIED`, `PAYMENT_CONFIRMED`, `INVOICED`,
  `FAILED`, `EXPIRED`, `CANCELLED`. Successful terminals: `PAYMENT_CONFIRMED`
  and `INVOICED` (Core may advance DIRECT orders through both in one watcher
  tx). QuickPay session terminals differ: `PAYMENT_CONFIRMED`, `EXPIRED`,
  `FAILED`, `CANCELLED`.
- Cancel only while `CHECKOUT_VERIFIED`. Reservation restoration/refund behavior
  is not part of the public SDK contract — verify with the active deployment.
- Audit: portal Audit Logs (profile, addresses, keys, webhooks, products, MPP
  routes, invites); order proof/payment record available server-side.

### 7.6 Credentials & accounts

- An account IS required to be a merchant (approval-gated). Buyers/payers do
  NOT need merchant credentials; QuickPay and MPP-profile buyers use a wallet +
  RPC.
- What can be done without merchant credentials: inspect manifests, create x402
  sessions via QuickPay public endpoints, submit DIRECT transfers, verify via
  the MPP profile. So TaskMarket as a **payer** needs no merchant account; to
  **sell** services it must operate a merchant account.

### 7.7 Direct vs delegated payment modes

- **DIRECT** is the only public merchant mode today: payer → merchant wallet,
  ERC-20 `transfer`. No custody, no escrow.
- Operator-provisioned **callback** orders (MerchantCallback.sol, EIP-712
  signing, signature submission, chain switching) exist as a compatibility
  appendix only for deployments that explicitly enable them. Not part of the
  public DIRECT path.
- No refund/cancellation guarantee is documented in the public SDK contract;
  treat as deployment-dependent.

### 7.8 Supported chains / tokens

- Runtime/deployment configuration, not a static matrix. Merchant baseline
  (documented, not authoritative): GOAT 2345, Ethereum 1, BSC 56, Arbitrum
  42161, Optimism 10, Base 8453, Berachain 80094, X Layer 196, Metis 1088,
  Tempo 4217. USDC/USDT are common examples; verify per environment.
- Service origins (Mainnet / Testnet3): Merchant Portal
  `flow-merchant.goat.network` / `flow-merchant.testnet3.goat.network`; Flow API
  `flow-api.goat.network` / `flow-api.testnet3.goat.network`; QuickPay/Checkout
  `flow-quickpay.goat.network` / `flow-quickpay.testnet3.goat.network`.

### 7.9 Limits and failure cases

- HTTP error semantics: 400 validation, 401 HMAC/timestamp/nonce, 402 success
  only on challenge endpoints, 403 ownership, 404 not found, 5xx bounded
  retry. Do not blindly retry order creation without a stable `dappOrderId`.
- Replay/duplicate protection: per-request nonce, idempotency keys for QuickPay
  sessions, receipt single-use consumption where configured.
- Reconcile by session/order ID + tx hash; never rebroadcast after ambiguous
  post-broadcast failure; browser `onSuccess` is UX-only, not proof of payment.

---

## 8. ERC-8004

Sources: https://eips.ethereum.org/EIPS/eip-8004 (Draft),
https://docs.goat.network/docs/build/erc-8004 ,
https://docs.goat.network/docs/agents/agent-kit/erc-8004 ,
https://github.com/erc-8004/erc-8004-contracts .

### 8.1 What it provides

A trust layer for agent ecosystems with three registries:

- **Identity Registry** — ERC-721 + URIStorage. Agents are NFTs/tokens; each
  agent is `agentId` (tokenId) in an `agentRegistry`
  (`eip155:{chainId}:{identityRegistryAddress}`). `agentURI` → registration JSON
  (IPFS/HTTPS/data: URI). Browsable/transferable with NFT-compatible tooling.
  Extra on-chain metadata via `getMetadata`/`setMetadata`; reserved key
  `agentWallet` (payment-receiving wallet; owner initially; changeable only with
  EIP-712 (EOA) / ERC-1271 (contract) signature proof; cleared on transfer).
- **Reputation Registry** — feedback (`giveFeedback`/`revokeFeedback`/
  `appendResponse`), read paths (`getSummary`, `readAllFeedback`, `getClients`,
  `getLastIndex`). Values are fixed-point `int128 value` + `valueDecimals`;
  optional `tag1`/`tag2`, endpoint, `feedbackURI` + `feedbackHash`. Scoring/
  aggregation happens on-chain (composable) and off-chain (sophisticated
  algorithms). The submitter must NOT be the agent owner/operator. When an agent
  submits feedback as a client, it SHOULD use its `agentWallet` address.
- **Validation Registry** — generic hooks for validator checks (stake-secured
  re-execution, zkML, TEE oracles): `validationRequest` /
  `validationResponse` / read functions. In the spec; the GOAT docs and AgentKit
  plugin focus on Identity + Reputation.

### 8.2 Agent registration / metadata

- Entry points: `register()`, `register(agentURI)`, `register(agentURI,
metadata)`.
- Registration JSON top-level fields (MUST: `type`, `name`, `description`,
  `services`, `active`, `registrations`; MAY: `image`, `x402Support`,
  `supportedTrust`). `services` entries: `name`, `endpoint`, `version`, optional
  `skills`/`domains` (A2A, MCP, x402, OASF, ENS, DID, web, email).
- On-chain metadata is key/value; only `agentWallet` is reserved.
- Updates: `setAgentURI`, `setMetadata`, `setAgentWallet`,
  `unsetAgentWallet`. State changes emit events for indexing.

### 8.3 Deployments & AgentKit integration

- GOAT Network mainnet (canonical, v2.0.0): Identity
  `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, Reputation
  `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`.
- Testnet3 (network-specific mapping per latest AgentKit): Identity
  `0x556089008Fc0a60cD09390Eca93477ca254A5522`, Reputation
  `0xd9140951d8aE6E5F625a02F5908535e16e3af964`.
- **Important:** AgentKit now resolves ERC-8004 addresses from `ctx.network` at
  runtime; `goat-mainnet` and `goat-testnet` use different registries. Testnet3
  no longer reuses the mainnet registry addresses. Builds must not hardcode one
  address for both networks.
- Registry identifiers: `eip155:2345:0x8004...432` (mainnet),
  `eip155:48816:0x5560...5522` (testnet).
- AgentKit `erc8004` plugin actions: `erc8004.register_agent`,
  `erc8004.set_agent_uri`, `erc8004.get_metadata`, `erc8004.set_metadata`,
  `erc8004.get_agent_wallet`, `erc8004.give_feedback`,
  `erc8004.revoke_feedback`, `erc8004.get_reputation`, `erc8004.get_clients`.

### 8.4 Discovery implications

ERC-8004 gives an agent a stable, censorship-resistant, on-chain identity and
makes agents browseable via NFT tooling. It does NOT provide full-text search,
a marketplace UI, or a curated directory. Discovery requires indexing events
(subgraphs) and resolving registration JSON (IPFS/HTTPS). GOAT documents Sentio
as the supported indexing provider
(https://docs.goat.network/docs/build/services/subgraph).

### 8.5 Risks / costs / update behavior

- Sybil/reputation gaming is explicitly called out in the spec; filtering by
  reviewer is supported on-chain; richer aggregation is off-chain work.
- On-chain pointers and hashes cannot be deleted (audit trail).
- The spec cannot guarantee advertised capabilities are functional or
  non-malicious — trust models (reputation/validation/TEE) address verification.
- Costs: registration and metadata/URI updates are L2 transactions (BTC gas);
  cheap relative to L1 but non-trivial at scale. Reputation writes are also L2
  txs. Off-chain storage (IPFS pinning) is an additional cost.
- ERC-8004 is a **Draft** EIP — spec may evolve; plan for upgradeable
  integration.

---

## 9. Agent identity model (recommendation)

Recommendation: keep these concepts distinct (verified from ERC-8004 spec +
GOAT docs; the model below is a TaskMarket decision, not a protocol fact):

```text
User (human or organization)
 ├── owns
TaskMarket account (application-level: roles, permissions, subscription state)
 ├── manages
Agent (a runnable service; has capabilities + a service endpoint set)
 ├── controls (signer key)
Wallet (EVM address; may hold BTC gas + tokens)
 └── associated with
   ERC-8004 identity (agentId in an identityRegistry; owner wallet ≠ agentWallet)
Reputation (accumulated at the ERC-8004 identity; on-chain feedback)
Service endpoints (declared in registration JSON: MCP / x402 / A2A / web)
```

Rules derived from the protocol:

- **Wallet ≠ identity.** One wallet can own multiple agents (an ERC-721 owner
  can own many tokenIds). Use a distinct signer key per agent where
  practical (least privilege).
- **Owner wallet ≠ agentWallet.** ERC-8004 reserves `agentWallet` for
  payment-receiving; it defaults to the owner and must be explicitly set (with
  proof) when payouts should go elsewhere. x402 DIRECT pays the merchant's
  configured receiving address, not necessarily the agent owner.
- **Reputation attaches to the ERC-8004 identity (agentId + registry), not to
  the TaskMarket account.** Keep TaskMarket-internal reputation/analytics
  separate from on-chain ERC-8004 reputation.
- **Service endpoints are off-chain metadata** declared in registration JSON —
  never assume an endpoint is verified; endpoints can be independently verified
  via the optional `/.well-known/agent-registration.json` domain proof.

---

## 10. Agent discovery

Verified from ERC-8004 docs, GOAT docs, and the Agent Infrastructure overview.

- **ERC-8004 provides the discovery primitive** (registry, on-chain identity,
  metadata URI, reputation reads) but **not** a marketplace/search product.
- **GOAT provides no existing agent directory** as a product. Discovery today
  = query the registry (NFT-compatible), resolve registration JSON, and index
  events (Sentio subgraphs documented).
- **TaskMarket should complement, not duplicate.** Build an off-chain indexed
  catalog (TaskMarket directory) that:
  - indexes ERC-8004 events (registration, metadata, feedback, agent wallet);
  - resolves and validates registration JSON (services, capabilities,
    x402Support);
  - computes its own reputation aggregates (off-chain) and stores TaskMarket
    task-completion evidence;
  - provides search/filtering over capabilities, endpoints, and trust signals.
- Indexable info: agentId, registry identifier, owner, agentWallet, agentURI,
  metadata, registration JSON fields (name, description, services, skills,
  domains, x402Support, active), reputation summary, clients.
- Whether TaskMarket needs its own on-chain registry is an open question (§20);
  MVP recommendation: use the canonical GOAT ERC-8004 registries and index
  them, rather than deploying a new registry.

---

## 11. Agent-to-agent communication

Verified: GOAT does not define a proprietary A2A transport. ERC-8004
registration JSON `services` is the standardized way to advertise endpoints
(A2A agent-card, MCP, x402, web, OASF, ENS, DID). The GOAT stack assumes HTTP +
open standards.

**Recommendation for MVP (reliability + simplicity):**

- **Transport:** plain HTTPS JSON APIs as the primary agent-to-agent transport.
- **Tool/service exposure:** MCP for reference agents that expose tools to other
  agents (AgentKit `provider.mcpTools()`).
- **Payments:** x402 (GOAT Flow) for paid endpoints.
- **Task submission:** synchronous request/response for simple tasks; for async
  jobs, TaskMarket backend orchestrates status and result delivery via
  webhooks/callbacks + polling (the GOAT Flow order-status pattern is a good
  template).
- **Auth:** bearer tokens / API keys per TaskMarket account for MVP, with
  on-chain ERC-8004 identity as the long-term verifiable anchor.
- Do not build an elaborate agent protocol until usage justifies it.

---

## 12. Wallet and key management

Verified from AgentKit quick-start, plugins docs, and CLI docs. Security focus:

- AgentKit manages wallet providers, not key storage. Keys come from the
  environment (`PRIVATE_KEY`) or a secrets manager. Never commit keys; never
  hardcode.
- `EvmWalletProvider`/`ViemWalletProvider` for production; `Noop*` for
  dev/test only (hard-refuses in production).
- Testnet funding: faucet at `https://bridge.testnet3.goat.network/faucet`;
  AgentKit `faucet` plugin has `faucet.request_funds`.
- **Each agent should have its own wallet** (separate signer key) so identity,
  spend, and risk are isolated. Multiple agents may share an owner for
  ERC-8004 ownership, but signer keys should be per-agent.
- **TaskMarket should never custody third-party agent funds.** Payments are
  DIRECT (payer → merchant receiving address). TaskMarket's own agents should
  use dedicated payout addresses (`agentWallet` / merchant receiving address)
  distinct from owner/operator keys.
- MVP recommendation: one signer wallet per TaskMarket-hosted agent; private
  keys injected via env/secrets manager; separate receiving addresses for
  payouts; no HSM until production volume requires it.

---

## 13. Spending controls

Verified from https://docs.goat.network/docs/agents/agent-kit/runtime .

AgentKit PolicyEngine gates: **network allowlist**, **action network support**,
**write permissions** (`writeEnabled`), **risk-level gate**
(`maxRiskWithoutConfirm`: read < low < medium < high). Actions marked
`requiresConfirmation: true` always require explicit confirmation.

Runtime controls: idempotency keys (memory/Redis), `maxRetries` /
`retryDelayMs` / `noRetryHighRiskWrites`, per-action and global `timeoutMs`,
structured logs, Prometheus metrics, execution hooks (audit trails).

**Not provided natively:** per-transaction/per-day monetary limits, approved
contract/token allowlists, per-agent budgets, human-approval thresholds beyond
the boolean `confirmed`. These must be built as a TaskMarket application-level
authorization layer wrapping `runtime.run()`.

**Recommendation — mandatory before real-money agent transactions:**

1. PolicyEngine restricted to allowed networks with `writeEnabled` controlled;
2. risk gating with confirmation required for `medium`+ risk;
3. per-agent spending budgets (daily and per-transaction) enforced in TaskMarket
   application code;
4. Redis idempotency for distributed execution;
5. approved-token / approved-recipient allowlists for transfer actions;
6. execution hooks feeding an audit log;
7. timeouts and bounded retries (`noRetryHighRiskWrites: true` default).

---

## 14. Database requirements (conceptual model)

No tables created. This is the conceptual data model for the architecture phase.

### 14.1 Entities and why they exist

| Entity                   | Why it exists                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| User                     | Human/org identity that owns accounts; login, roles.                                                        |
| TaskMarket account       | Application-level account (profile, keys, quotas, membership). Distinct from on-chain identity.             |
| Agent                    | A registered marketplace participant; a runnable service with capabilities; owned by an account.            |
| Capabilities             | Declared skills/domains/tools an agent offers; powers search and matching.                                  |
| Endpoints                | Service endpoints (MCP, x402, web, A2A) for a given agent; from registration JSON.                          |
| Agent identity           | Mapping of TaskMarket Agent ↔ ERC-8004 `(agentRegistry, agentId)`; plus wallet/owner/agentWallet addresses. |
| Task                     | A unit of work a buyer wants done; listing fields, status, price.                                           |
| Task assignment          | Which agent accepted/executed a task; offer/accept lifecycle.                                               |
| Payment / payment intent | x402 order/session for a task; stable `dappOrderId`/idempotency key.                                        |
| Payment events           | Order status transitions, tx hashes, webhook deliveries.                                                    |
| Task result              | Deliverable/output of a task; evidence for feedback.                                                        |
| Reputation events        | Task-completion evidence feeding ERC-8004 feedback and TaskMarket analytics.                                |
| Audit records            | Immutable log of marketplace actions (who did what, when).                                                  |

### 14.2 State classification

**On-chain state (source of truth for these facts):**

- ERC-8004 registrations (agentId, owner, agentURI, metadata, agentWallet).
- ERC-8004 feedback/reputation (values, revocation, responses).
- x402 DIRECT transfers and their tx hashes (verifiable on-chain).

**Off-chain application state (TaskMarket's own data):**

- Users, accounts, roles, API keys.
- Task listings, assignments, offers, task results.
- Payment intents, order status snapshots, webhook state, reconciliation.
- TaskMarket analytics and derived reputation signals.

**Cached / indexed state (derived, rebuildable):**

- Indexed ERC-8004 metadata and registration JSON (from events/IPFS).
- Reputation aggregates, agent catalogs, search indexes.
- Historical order/payment rollups for dashboards.

---

## 15. Security research

Primary threats and mitigation directions (no implementation):

| Threat                                                  | Mitigation direction                                                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malicious agents / fraudulent services                  | ERC-8004 identity + registration JSON validation; reputation from verified task completion; endpoint domain verification (`.well-known/agent-registration.json`); capability testing before acceptance. |
| Fake reputation / Sybil agents                          | Reviewer-based filtering (spec-supported); task-completion evidence tied to payments; off-chain analytics that weight verified clients; minimum verified-usage before ratings count.                    |
| Malicious endpoints / tool injection / prompt injection | Treat endpoint content as untrusted input; strict output validation; no automatic tool invocation from untrusted metadata; sandbox/allowlist tools per agent.                                           |
| Malicious MCP tools                                     | Only serve MCP tools we implement; only invoke MCP tools from vetted, identity-verified agents; capability allowlists.                                                                                  |
| Unauthorized payments                                   | AgentKit policy gate; per-agent budgets; confirmation for medium+ risk; signed EIP-712 flows; verify order fields before paying.                                                                        |
| Replay attacks / duplicate task execution               | Idempotency keys (payment + task); unique nonces; receipt single-use; task dedup by content hash/id.                                                                                                    |
| Payment/result mismatch                                 | Fulfill only from trusted server status/proof/webhook (never browser `onSuccess`); reconcile order vs task; verify merchant/amount/token/recipient/tx identity.                                         |
| Webhook spoofing                                        | Verify webhook signatures/secrets; HTTPS-only; replay-window checks; idempotent processing.                                                                                                             |
| Credential theft / private-key exposure                 | Keys only in secrets manager; separate keys per agent; never in code/logs/artifacts; rotation procedures; 2FA on merchant portals.                                                                      |
| Denial of service                                       | Rate limits; quotas per account; bounded retries; hosting-level protections; public RPC limits → dedicated infra.                                                                                       |
| Excessive agent spending                                | Spending budgets (per-tx, daily); network/token/recipient allowlists; confirmation thresholds; alerting.                                                                                                |
| Dishonest task results                                  | Result verification step before payout finalization; no escrow (direct payments) — instead gate "paid" vs "accepted" statuses; feedback tied to outcome; optional validation registry later.            |
| Marketplace manipulation                                | Review-bot/Sybil detection; anti-shill weighting; transparency of on-chain signals; operator review of disputes.                                                                                        |

---

## 16. Cost analysis (qualitative)

| Item                                                   | Cost                                                  | Determined by                                                                                                |
| ------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| GOAT L2 transactions (gas, BTC)                        | Low                                                   | EIP-1559 fee model in BTC; sub-cent claims; gas usage per call.                                              |
| ERC-8004 register / setURI / setMetadata               | Low                                                   | L2 gas per tx; small calldata.                                                                               |
| ERC-8004 reputation ops (give/revoke feedback)         | Low                                                   | L2 gas per tx.                                                                                               |
| x402 payments                                          | Low (transfer gas) + Variable (merchant service fees) | Payer gas on the settlement chain; merchant Fee Balance/platform fees are deployment-config; prepaid top-up. |
| Off-chain storage (registration JSON / feedback files) | Low–Medium                                            | IPFS pinning or hosting; frequency of updates.                                                               |
| RPC                                                    | Low–Medium                                            | Public RPCs rate-limited; dedicated/managed RPC is paid.                                                     |
| Database                                               | Low–Medium                                            | Managed Postgres; scale of indexing.                                                                         |
| Hosting                                                | Medium                                                | App/agent hosting, Redis, worker infra.                                                                      |
| AI model calls                                         | Medium–High                                           | Model usage per task; per-agent and marketplace-wide.                                                        |
| External APIs / MCP integrations                       | Variable                                              | Third-party service costs per integration.                                                                   |

Note: do not assume Testnet3 fees/limits equal Mainnet; read the live
environment.

---

## 17. Grant / Builder Program verification

Sources: https://www.goat.network/builder-program (current, published
2026-08-18), https://www.goat.network/news/goat-ai-builder-grants-program
(Apr 30, 2026), plus official X/Twitter posts.

**Current status: active.**

- **Program:** GOAT AI Builder Grants Program (agent-native applications with
  real economic utility).
- **Who:** builders of transactional and productivity applications where agents
  drive real, repeatable economic activity. Only usable products with a clear
  path to revenue.
- **Funding (current page, 2026-08-18):**
  - Base Grant: **$2,000** for apps already generating revenue or a live product
    with a clear, immediate path to revenue.
  - Singularity Investment: **$1,000,000** allocation for high-potential
    applications with real traction.
- **Technical expectations:** integrate **GOAT x402 and/or ERC-8004** as an
  integral part of the product workflow; solve a genuine market need;
  demonstrate an end-to-end workflow; submit a **recorded demo**. Early usage
  data (users, tasks, transactions, GMV) helps. ClawUp (agent deployment) is
  optional but encouraged.
- **Support beyond funding:** technical guidance on x402/ERC-8004, ClawUp
  deployment support, architecture/workflow feedback, early access to
  infrastructure, ecosystem/partner connections, GTM and co-marketing,
  follow-on backing for top performers.
- **Application:** Tally form — `https://tally.so/r/EkJo42`. No explicit
  deadline stated (rolling program). Two stages: Base Grant then Singularity
  Investment.

**Documented inconsistency:** the Apr 30, 2026 program announcement states the
Base Grant is **$500**, while the current builder-program page (updated Aug 18,
2026) states **$2,000**, and official X posts reference "$2000 to start".
Recommendation: treat **$2,000** as the current base-grant figure and confirm at
application time. Do not design the product around the $500 figure or around any
specific total.

---

## 18. Architecture implications

### What must TaskMarket build itself?

- The marketplace backend/frontend: task listings, search, matching, offers,
  assignments, results, dispute/reconciliation flows.
- The off-chain indexed agent catalog and search (from ERC-8004 + registration
  JSON + reputation).
- The agent execution harness for TaskMarket-hosted agents (AgentKit runtime +
  application-level budgets/authorization).
- Webhook receivers for GOAT Flow order events; webhook/task-result delivery.
- Auditing and analytics.

### What should TaskMarket delegate to GOAT Network?

- Settlement, gas, chain infrastructure, explorers, RPC, and (eventually) any
  custom contracts TaskMarket needs. Use canonical networks/addresses; do not
  re-implement chain logic.

### What should TaskMarket delegate to x402 (GOAT Flow)?

- All payment mechanics: order creation, HTTP 402 challenges, DIRECT transfers,
  status/proof, webhooks, merchant onboarding, QuickPay/manifests, and the MPP
  profile for paid routes. TaskMarket handles reconciliation/fulfillment only.

### What should TaskMarket delegate to ERC-8004?

- On-chain agent identity (registration, metadata, agentWallet), on-chain
  reputation (feedback), and the canonical discovery primitive. TaskMarket
  indexes rather than re-creates these.

### What should AgentKit handle?

- Wallet providers, action registration/tool export, policy, validation,
  idempotency, retries, timeouts, metrics, hooks, and ERC-8004/x402 action
  surfaces for TaskMarket-hosted agents.

### What belongs in TaskMarket's database?

- Off-chain application state (users, accounts, tasks, assignments, results,
  payment intents/events, audit records, derived analytics) plus cached/indexed
  copies of on-chain state.

### What belongs on-chain?

- ERC-8004 identities and reputation; x402 DIRECT transfers (and their
  verifiable proofs). Anything that must be independently verifiable by third
  parties.

### What should remain off-chain?

- Task content/results (except hashes/evidence pointers), pricing catalogs
  (until paid surfaces), marketplace analytics, account/role data.

### What should be indexed?

- ERC-8004 events (registration, metadata, feedback, agentWallet changes) and
  order/payment events — via subgraph (Sentio) and TaskMarket's own indexer.

### What should never be trusted without verification?

- Merchant API keys/secrets (backend-only); browser `onSuccess` callbacks;
  any order status or webhook payload (must be authenticated, signed, and
  reconciled); registration JSON content and endpoints (unverified until proven
  or domain-verified); fee configuration and token/chain matrices (read from the
  live environment); reputation claims (require evidence).

---

## 19. Recommended MVP stack

| Concern              | Recommendation                                                                                                                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend             | Next.js + TypeScript (React), consuming the TaskMarket API.                                                                                                                                                                                                                  |
| Backend              | Node.js (22 LTS+) + TypeScript, ESM. HTTP framework: **Fastify** (mature, schema-validated, webhook-friendly).                                                                                                                                                               |
| Runtime              | Node 22+ (already the repo baseline).                                                                                                                                                                                                                                        |
| Package manager      | pnpm (already pinned, `pnpm@10.32.1`).                                                                                                                                                                                                                                       |
| Workspace            | pnpm workspaces (`apps/*`, `packages/*`, `agents/*`) — already configured.                                                                                                                                                                                                   |
| Database             | PostgreSQL (managed); Redis for idempotency/queues/rate-limits.                                                                                                                                                                                                              |
| Test framework       | Vitest (already configured).                                                                                                                                                                                                                                                 |
| Validation library   | Zod (matches AgentKit's use of Zod).                                                                                                                                                                                                                                         |
| Logging              | pino (structured JSON; compatible with AgentKit's structured logger).                                                                                                                                                                                                        |
| AgentKit strategy    | `@goatnetwork/agentkit` as a shared dependency in `packages/` + agent packages; AgentKit runtime inside TaskMarket-hosted agents; use AgentKit's `ActionProvider`/`ExecutionRuntime`/`PolicyEngine`.                                                                         |
| AI framework         | Framework-agnostic core; first reference agent uses **Vercel AI SDK**; expose services over **MCP** (`provider.mcpTools()`).                                                                                                                                                 |
| x402 integration     | Payer: AgentKit `x402` plugin (or `goatflow-quickpay`). Merchant: TaskMarket's reference agents operate their own GOAT Flow merchant accounts via `goatflow-sdk-server` + Merchant Portal. Verification: backend status/proof/webhooks; never fulfill from browser callback. |
| ERC-8004 integration | AgentKit `erc8004` plugin; network-aware addresses; index via subgraph + TaskMarket indexer.                                                                                                                                                                                 |
| Deployment           | Docker containers; managed Postgres + Redis; Node hosting for backend/agents; Sentio for subgraph indexing; environment-separated (Testnet3 vs Mainnet) configuration.                                                                                                       |

---

## 20. Open questions

- Does TaskMarket need its own on-chain registry, or is indexing the canonical
  ERC-8004 registries sufficient? (MVP recommendation: indexing suffices.)
- Should every marketplace agent have its own ERC-8004 identity? (Recommendation:
  yes, at least for agents that transact or accumulate reputation.)
- Should TaskMarket ever custody funds? (Recommendation: no; direct payments.)
- Should payments be direct agent-to-agent? (Recommendation: yes, via x402
  DIRECT; no escrow in MVP.)
- Should TaskMarket act as a merchant, or only coordinate? (Recommendation:
  coordinate + payer in MVP; merchant capability only for TaskMarket's own
  reference agents.)
- What is the minimum viable reputation model? (Recommendation: verified
  task-completion evidence + ERC-8004 feedback, reviewer-filtered.)
- Which AI framework should the first reference agent use? (Recommendation:
  Vercel AI SDK; framework-agnostic core.)
- When (if ever) should TaskMarket adopt the ERC-8004 Validation Registry?
- Should TaskMarket offer .goat names (GNS) as part of identity UX? (Phase 3+.)
- What is the webhook/async-task delivery contract between agents? (MVP:
  HTTPS + TaskMarket-orchestrated status/results.)

---

## 21. Decision log

| Decision          | Current recommendation                                                                                         | Evidence                                        | Confidence  |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------- |
| Network           | Develop on GOAT Testnet3 (chain 48816); production on GOAT Network Alpha Mainnet (chain 2345); native gas BTC  | Official networks/RPC docs (2026-08-18)         | High        |
| Agent runtime     | AgentKit as backend dependency + embedded runtime in TaskMarket-hosted agents; not an agent-hosting platform   | AgentKit docs + repo                            | High        |
| x402 role         | TaskMarket = coordinator + payer in MVP; service providers are merchants; direct payments, no custody          | GOAT Flow docs + merchant guide                 | High        |
| ERC-8004 role     | On-chain identity + reputation via canonical GOAT registries; TaskMarket indexes (no new registry in MVP)      | ERC-8004 EIP draft + GOAT build docs            | Medium-High |
| Database          | PostgreSQL (off-chain app state + cached/indexed on-chain state); Redis for idempotency/queues                 | Architecture foundation + AgentKit runtime docs | High        |
| AI framework      | Framework-agnostic core; Vercel AI SDK for first reference agent; MCP for service exposure                     | AgentKit frameworks docs                        | Medium-High |
| Payments surface  | GOAT Flow DIRECT; payer via AgentKit x402 plugin / goatflow-quickpay; verify via backend status/proof/webhooks | GOAT Flow integration + quick-start             | High        |
| Merchant accounts | Operated per service-provider (each agent/merchant), not centrally by TaskMarket                               | GOAT Flow merchant guide                        | High        |
| Builder program   | Apply for base grant ($2,000 current figure); integrate x402 and/or ERC-8004 integrally; provide recorded demo | Official builder-program page (2026-08-18)      | Medium      |

---

## 22. Source list (primary, all referenced above)

- GOAT Network docs: https://docs.goat.network/
  - Network overview: https://docs.goat.network/docs/network/overview
  - Execution environment: https://docs.goat.network/docs/network/execution-environment
  - Networks & RPC: https://docs.goat.network/docs/build/networks-rpc
  - Contract addresses: https://docs.goat.network/docs/build/contracts
  - Transaction fees: https://docs.goat.network/docs/build/app-development/fees
  - Transaction statuses: https://docs.goat.network/docs/build/app-development/statuses
  - Agent infrastructure: https://docs.goat.network/docs/agents/overview
  - AgentKit overview: https://docs.goat.network/docs/agents/agent-kit/overview
  - AgentKit quick start: https://docs.goat.network/docs/agents/agent-kit/quick-start
  - AgentKit plugins: https://docs.goat.network/docs/agents/agent-kit/plugins
  - AgentKit runtime: https://docs.goat.network/docs/agents/agent-kit/runtime
  - AgentKit frameworks: https://docs.goat.network/docs/agents/agent-kit/frameworks
  - AgentKit CLIs: https://docs.goat.network/docs/agents/agent-kit/cli
  - AgentKit ERC-8004: https://docs.goat.network/docs/agents/agent-kit/erc-8004
  - AgentKit GOAT Flow: https://docs.goat.network/docs/agents/agent-kit/payments
  - GOAT Flow overview: https://docs.goat.network/docs/build/goat-flow/overview
  - GOAT Flow integration: https://docs.goat.network/docs/build/goat-flow/integration
  - GOAT Flow merchant guide: https://docs.goat.network/docs/build/goat-flow/merchant-guide
  - GOAT Flow quick start: https://docs.goat.network/docs/build/goat-flow/flow-quick-start
  - ERC-8004 build page: https://docs.goat.network/docs/build/erc-8004
  - Subgraph indexing: https://docs.goat.network/docs/build/services/subgraph
- Official GitHub repositories:
  - https://github.com/GOATNetwork/agentkit
  - https://github.com/GOATNetwork/x402
  - https://github.com/erc-8004/erc-8004-contracts
- Ethereum EIP-8004 (Draft): https://eips.ethereum.org/EIPS/eip-8004
- AgentKit product page: https://agentkit.goat.network/
- GOAT Network site: https://www.goat.network/
- Builder program: https://www.goat.network/builder-program
  - Announcement: https://www.goat.network/news/goat-ai-builder-grants-program
- npm registry (verified 2026-08-18): `@goatnetwork/agentkit` 0.2.3,
  `create-goat-agent` 0.1.4, `goatflow-sdk-server` 0.3.0, `goatflow-sdk` 0.2.1,
  `goatflow-checkout` 0.1.0, `goatflow-quickpay` 0.3.0.
