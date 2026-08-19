import { z } from 'zod';

import { GOAT_NETWORKS, type GoatNetwork } from './config.js';
import { AgentKitConfigError } from './errors.js';

/** Native gas asset on all GOAT networks (verified from GOAT docs). */
export const GOAT_NATIVE_CURRENCY = {
  name: 'Bitcoin',
  symbol: 'BTC',
  decimals: 18,
} as const;

/** Chain IDs verified from the official GOAT "Networks and RPC" page. */
export const GOAT_CHAIN_IDS = {
  'goat-testnet': 48816,
  'goat-mainnet': 2345,
} as const satisfies Record<GoatNetwork, number>;

/** Wallet/tooling hex chain IDs (`0xBEB0` for Testnet3, `0x929` for Alpha Mainnet). */
export const GOAT_CHAIN_ID_HEX = {
  'goat-testnet': '0xBEB0',
  'goat-mainnet': '0x929',
} as const satisfies Record<GoatNetwork, string>;

/** Verified public RPC endpoints (primary + backup) from the official docs. */
export const GOAT_RPC_URLS = {
  'goat-testnet': 'https://rpc.testnet3.goat.network',
  'goat-mainnet': 'https://rpc.goat.network',
} as const satisfies Record<GoatNetwork, string>;

export const GOAT_BACKUP_RPC_URLS = {
  'goat-testnet': 'https://rpc.ankr.com/goat_testnet',
  'goat-mainnet': 'https://rpc.ankr.com/goat_mainnet',
} as const satisfies Record<GoatNetwork, string>;

/** Verified explorer URLs from the official GOAT docs. */
export const GOAT_EXPLORER_URLS = {
  'goat-testnet': 'https://explorer.testnet3.goat.network',
  'goat-mainnet': 'https://explorer.goat.network',
} as const satisfies Record<GoatNetwork, string>;

/** Testnet3 faucet (test gas). Mainnet has no faucet. */
export const GOAT_TESTNET_FAUCET_URL = 'https://bridge.testnet3.goat.network/faucet';

/** Verified per-network facts used by config resolution and connectivity checks. */
export interface GoatNetworkInfo {
  key: GoatNetwork;
  chainId: number;
  chainIdHex: string;
  rpcUrl: string;
  backupRpcUrl: string;
  explorerUrl: string;
  nativeCurrency: typeof GOAT_NATIVE_CURRENCY;
  faucetUrl?: string;
}

/** Verified facts for every supported GOAT network. */
export const GOAT_NETWORK_INFO: Record<GoatNetwork, GoatNetworkInfo> = {
  'goat-testnet': {
    key: 'goat-testnet',
    chainId: GOAT_CHAIN_IDS['goat-testnet'],
    chainIdHex: GOAT_CHAIN_ID_HEX['goat-testnet'],
    rpcUrl: GOAT_RPC_URLS['goat-testnet'],
    backupRpcUrl: GOAT_BACKUP_RPC_URLS['goat-testnet'],
    explorerUrl: GOAT_EXPLORER_URLS['goat-testnet'],
    nativeCurrency: GOAT_NATIVE_CURRENCY,
    faucetUrl: GOAT_TESTNET_FAUCET_URL,
  },
  'goat-mainnet': {
    key: 'goat-mainnet',
    chainId: GOAT_CHAIN_IDS['goat-mainnet'],
    chainIdHex: GOAT_CHAIN_ID_HEX['goat-mainnet'],
    rpcUrl: GOAT_RPC_URLS['goat-mainnet'],
    backupRpcUrl: GOAT_BACKUP_RPC_URLS['goat-mainnet'],
    explorerUrl: GOAT_EXPLORER_URLS['goat-mainnet'],
    nativeCurrency: GOAT_NATIVE_CURRENCY,
  },
};

/** Normalized GOAT network configuration used for connectivity checks. */
export interface GoatNetworkConfig {
  /** The active network. Defaults to testnet only. */
  network: GoatNetwork;
  /** Chain ID the RPC endpoint must report. */
  chainId: number;
  /** RPC endpoint used for connectivity checks (env override or verified default). */
  rpcUrl: string;
  /** Backup RPC endpoint (informational; not used by the check). */
  backupRpcUrl: string;
  /** Block explorer URL. */
  explorerUrl: string;
  /** Testnet faucet URL; present only for the testnet. */
  faucetUrl?: string;
  /** Native gas asset facts. */
  nativeCurrency: { name: string; symbol: string; decimals: number };
  /** RPC request timeout for connectivity checks. */
  timeoutMs: number;
}

export const DEFAULT_GOAT_NETWORK: GoatNetwork = 'goat-testnet';
export const DEFAULT_GOAT_RPC_TIMEOUT_MS = 10_000;

/** Environment variable names recognized by {@link loadGoatNetworkConfig}. */
export const GOAT_NETWORK_ENV_KEYS = [
  'GOAT_NETWORK',
  'GOAT_TESTNET_RPC_URL',
  'GOAT_MAINNET_RPC_URL',
  'GOAT_RPC_TIMEOUT_MS',
  'GOAT_ALLOW_MAINNET',
] as const;

const goatNetworkEnvSchema = z
  .object({
    GOAT_NETWORK: z.enum(GOAT_NETWORKS).optional(),
    GOAT_TESTNET_RPC_URL: z.string().url().optional(),
    GOAT_MAINNET_RPC_URL: z.string().url().optional(),
    GOAT_RPC_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
    GOAT_ALLOW_MAINNET: z.enum(['0', '1']).optional(),
  })
  .strict();

/**
 * Load and validate GOAT network configuration from an environment record (for
 * example `process.env`). Development defaults are testnet-only: the active
 * network defaults to `goat-testnet`, and `goat-mainnet` is refused unless
 * `GOAT_ALLOW_MAINNET=1` or `NODE_ENV=production`. RPC endpoints default to the
 * verified official URLs. Throws {@link AgentKitConfigError} on invalid or
 * unsafe values.
 */
export function loadGoatNetworkConfig(env: Record<string, string | undefined>): GoatNetworkConfig {
  const picked: Record<string, string | undefined> = {};
  for (const key of GOAT_NETWORK_ENV_KEYS) {
    if (env[key] !== undefined) {
      picked[key] = env[key];
    }
  }

  const parsed = goatNetworkEnvSchema.safeParse(picked);
  if (!parsed.success) {
    throw new AgentKitConfigError(parsed.error.issues);
  }

  const value = parsed.data;
  const network = value.GOAT_NETWORK ?? DEFAULT_GOAT_NETWORK;

  if (
    network === 'goat-mainnet' &&
    value.GOAT_ALLOW_MAINNET !== '1' &&
    env.NODE_ENV !== 'production'
  ) {
    throw new AgentKitConfigError([
      {
        code: 'custom',
        path: ['GOAT_NETWORK'],
        message:
          'GOAT mainnet is refused in development; set GOAT_NETWORK=goat-testnet, or set GOAT_ALLOW_MAINNET=1 only after an explicit production gate.',
      },
    ]);
  }

  const info = GOAT_NETWORK_INFO[network];
  const override =
    network === 'goat-testnet' ? value.GOAT_TESTNET_RPC_URL : value.GOAT_MAINNET_RPC_URL;

  const config: GoatNetworkConfig = {
    network,
    chainId: info.chainId,
    rpcUrl: override ?? info.rpcUrl,
    backupRpcUrl: info.backupRpcUrl,
    explorerUrl: info.explorerUrl,
    nativeCurrency: info.nativeCurrency,
    timeoutMs: value.GOAT_RPC_TIMEOUT_MS ?? DEFAULT_GOAT_RPC_TIMEOUT_MS,
  };

  if (info.faucetUrl !== undefined) {
    config.faucetUrl = info.faucetUrl;
  }

  return config;
}
