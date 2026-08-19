import { AgentKitConnectivityError } from './errors.js';
import type { GoatNetworkConfig } from './network.js';

/** A minimal JSON-RPC 2.0 request payload. */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: unknown[];
}

/** A minimal JSON-RPC 2.0 response payload. */
interface JsonRpcResponse {
  result?: unknown;
  error?: { code: number; message: string };
}

/** Result of a successful GOAT network connectivity check. */
export interface GoatConnectivityResult {
  network: GoatNetworkConfig['network'];
  /** Chain ID the RPC endpoint reported. */
  chainId: number;
  /** Latest block number the RPC endpoint reported. */
  blockNumber: number;
  /** RPC endpoint that was probed. */
  rpcUrl: string;
  /** Round-trip latency of the checks, in milliseconds. */
  latencyMs: number;
  /** ISO-8601 timestamp of the check. */
  checkedAt: string;
}

/** Fetch-like callable injected for testing. */
export type FetchLike = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<Response>;

export interface GoatConnectivityOptions {
  /** Timeout per RPC call, in milliseconds. Defaults to the config timeout. */
  timeoutMs?: number;
  /** Fetch implementation override (used by tests). */
  fetchImpl?: FetchLike;
}

/**
 * Parse an RPC hex quantity such as `0x1` or `0x0` into a safe integer.
 * Returns `null` when the value is not a valid non-negative hex quantity.
 */
function parseHexQuantity(value: unknown): number | null {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) {
    return null;
  }
  const parsed = Number.parseInt(value.slice(2), 16);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

async function rpcCall(
  rpcUrl: string,
  method: string,
  timeoutMs: number,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();

  const request: JsonRpcRequest = { jsonrpc: '2.0', id: 1, method, params: [] };

  let response: Response;
  try {
    response = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AgentKitConnectivityError(
        'GOAT_RPC_TIMEOUT',
        `RPC call to ${method} timed out after ${timeoutMs}ms against ${rpcUrl}.`,
      );
    }
    throw new AgentKitConnectivityError(
      'GOAT_RPC_UNREACHABLE',
      `RPC call to ${method} against ${rpcUrl} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new AgentKitConnectivityError(
      'GOAT_RPC_UNREACHABLE',
      `RPC endpoint ${rpcUrl} returned HTTP ${response.status} for ${method}.`,
    );
  }

  let payload: JsonRpcResponse;
  try {
    payload = (await response.json()) as JsonRpcResponse;
  } catch {
    throw new AgentKitConnectivityError(
      'GOAT_RPC_BAD_RESPONSE',
      `RPC endpoint ${rpcUrl} returned a non-JSON body for ${method}.`,
    );
  }

  if (payload.error !== undefined) {
    throw new AgentKitConnectivityError(
      'GOAT_RPC_BAD_RESPONSE',
      `RPC endpoint ${rpcUrl} returned error ${payload.error.code} for ${method}: ${payload.error.message}`,
    );
  }

  return payload.result;
}

/**
 * Probe the configured GOAT network RPC endpoint and verify it reports the
 * expected chain ID. Performs a `eth_chainId` call (chain-ID verification) and
 * an `eth_blockNumber` call (liveness check) against the configured RPC URL.
 *
 * Fails safely: throws {@link AgentKitConnectivityError} when the endpoint is
 * unreachable, times out, responds with a malformed payload, or reports a chain
 * ID that does not match the configured network. Only HTTP(S) RPC URLs are
 * accepted (SSRF guard). No transactions are ever sent by this check.
 */
export async function checkGoatNetworkConnectivity(
  config: GoatNetworkConfig,
  options: GoatConnectivityOptions = {},
): Promise<GoatConnectivityResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? config.timeoutMs;

  let url: URL;
  try {
    url = new URL(config.rpcUrl);
  } catch {
    throw new AgentKitConnectivityError(
      'GOAT_RPC_INVALID_URL',
      `Configured RPC URL is not a valid URL: ${config.rpcUrl}`,
    );
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AgentKitConnectivityError(
      'GOAT_RPC_INVALID_URL',
      `Configured RPC URL must use http or https: ${config.rpcUrl}`,
    );
  }

  const startedAt = Date.now();
  const rawChainId = await rpcCall(config.rpcUrl, 'eth_chainId', timeoutMs, fetchImpl);
  const chainId = parseHexQuantity(rawChainId);

  if (chainId === null) {
    throw new AgentKitConnectivityError(
      'GOAT_RPC_BAD_RESPONSE',
      `RPC endpoint ${config.rpcUrl} returned an invalid chain ID: ${String(rawChainId)}`,
    );
  }

  if (chainId !== config.chainId) {
    throw new AgentKitConnectivityError(
      'GOAT_CHAIN_ID_MISMATCH',
      `RPC endpoint ${config.rpcUrl} reported chain ID ${chainId} (0x${chainId.toString(16)}), expected ${config.chainId} (0x${config.chainId.toString(16)}) for ${config.network}.`,
    );
  }

  const rawBlockNumber = await rpcCall(config.rpcUrl, 'eth_blockNumber', timeoutMs, fetchImpl);
  const blockNumber = parseHexQuantity(rawBlockNumber);

  if (blockNumber === null) {
    throw new AgentKitConnectivityError(
      'GOAT_RPC_BAD_RESPONSE',
      `RPC endpoint ${config.rpcUrl} returned an invalid block number: ${String(rawBlockNumber)}`,
    );
  }

  return {
    network: config.network,
    chainId,
    blockNumber,
    rpcUrl: config.rpcUrl,
    latencyMs: Date.now() - startedAt,
    checkedAt: new Date().toISOString(),
  };
}
