#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { parseEnv } from './check-env.mjs';

const ENV_PATH = new URL('../.env', import.meta.url);

const DEFAULT_TIMEOUT_MS = 10_000;

const CHAIN_IDS = {
  'goat-testnet': 48816,
  'goat-mainnet': 2345,
};

const DEFAULT_RPC_URLS = {
  'goat-testnet': 'https://rpc.testnet3.goat.network',
  'goat-mainnet': 'https://rpc.goat.network',
};

function loadEnv() {
  const fileEnv = existsSync(ENV_PATH) ? parseEnv(readFileSync(ENV_PATH, 'utf8')) : {};
  return { ...fileEnv, ...process.env };
}

export function parseHexQuantity(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) {
    return null;
  }
  const parsed = Number.parseInt(value.slice(2), 16);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

async function rpcCall(rpcUrl, method, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (payload.error) {
      throw new Error(`RPC error ${payload.error.code}: ${payload.error.message}`);
    }
    return payload.result;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const env = loadEnv();

  let network = env.GOAT_NETWORK || 'goat-testnet';
  const allowMainnet = env.GOAT_ALLOW_MAINNET === '1' || env.NODE_ENV === 'production';

  if (!CHAIN_IDS[network]) {
    console.error(
      `[network-check] unknown network "${network}"; use goat-testnet or goat-mainnet.`,
    );
    process.exit(1);
  }
  if (network === 'goat-mainnet' && !allowMainnet) {
    console.error(
      '[network-check] GOAT mainnet is refused in development; set GOAT_NETWORK=goat-testnet, or GOAT_ALLOW_MAINNET=1 only after an explicit production gate.',
    );
    process.exit(1);
  }

  const expectedChainId = CHAIN_IDS[network];
  const timeoutMs = Number(env.GOAT_RPC_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const override = network === 'goat-testnet' ? env.GOAT_TESTNET_RPC_URL : env.GOAT_MAINNET_RPC_URL;
  const rpcUrl = override || DEFAULT_RPC_URLS[network];

  let url;
  try {
    url = new URL(rpcUrl);
  } catch {
    console.error(`[network-check] invalid RPC URL: ${rpcUrl}`);
    process.exit(1);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    console.error(`[network-check] RPC URL must use http or https: ${rpcUrl}`);
    process.exit(1);
  }

  const startedAt = Date.now();
  try {
    const chainIdHex = await rpcCall(rpcUrl, 'eth_chainId', timeoutMs);
    const chainId = parseHexQuantity(chainIdHex);
    if (chainId === null) {
      throw new Error(`invalid chain ID response: ${String(chainIdHex)}`);
    }
    if (chainId !== expectedChainId) {
      console.error(
        `[network-check] chain ID mismatch: RPC ${rpcUrl} reported ${chainId} (0x${chainId.toString(16)}), expected ${expectedChainId} (0x${expectedChainId.toString(16)}) for ${network}.`,
      );
      process.exit(1);
    }

    const blockNumberHex = await rpcCall(rpcUrl, 'eth_blockNumber', timeoutMs);
    const blockNumber = parseHexQuantity(blockNumberHex);
    if (blockNumber === null) {
      throw new Error(`invalid block number response: ${String(blockNumberHex)}`);
    }

    const latencyMs = Date.now() - startedAt;
    console.log(
      `[network-check] OK - ${network} (chain ID ${chainId}) reachable via ${rpcUrl}; block ${blockNumber}; latency ${latencyMs}ms.`,
    );
    process.exit(0);
  } catch (error) {
    console.error(
      `[network-check] ${network} (chain ID ${expectedChainId}) is not reachable via ${rpcUrl}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  main();
}
