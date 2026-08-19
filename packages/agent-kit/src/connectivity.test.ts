import { describe, expect, it } from 'vitest';

import { checkGoatNetworkConnectivity, type FetchLike } from './connectivity.js';
import { AgentKitConnectivityError } from './errors.js';
import { loadGoatNetworkConfig, type GoatNetworkConfig } from './network.js';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Build a fetch stub that answers methods with the given results. */
function stubFetch(results: Record<string, unknown>): FetchLike {
  return async (_input, init) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as { method: string }) : null;
    if (body === null) {
      return jsonResponse({ error: { code: -32600, message: 'no method' } });
    }
    const result = results[body.method];
    if (result === undefined) {
      return jsonResponse({ error: { code: -32601, message: 'method not found' } });
    }
    return jsonResponse({ jsonrpc: '2.0', id: 1, result });
  };
}

function testnetConfig(): GoatNetworkConfig {
  return loadGoatNetworkConfig({});
}

describe('checkGoatNetworkConnectivity', () => {
  it('verifies chain ID and block number on a healthy testnet RPC', async () => {
    const result = await checkGoatNetworkConnectivity(testnetConfig(), {
      fetchImpl: stubFetch({ eth_chainId: '0xBEB0', eth_blockNumber: '0x1' }),
    });
    expect(result.network).toBe('goat-testnet');
    expect(result.chainId).toBe(48816);
    expect(result.blockNumber).toBe(1);
    expect(result.rpcUrl).toBe('https://rpc.testnet3.goat.network');
    expect(result.checkedAt).toEqual(expect.any(String));
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('accepts lowercase hex chain IDs', async () => {
    const result = await checkGoatNetworkConnectivity(testnetConfig(), {
      fetchImpl: stubFetch({ eth_chainId: '0xbeb0', eth_blockNumber: '0x10' }),
    });
    expect(result.chainId).toBe(48816);
    expect(result.blockNumber).toBe(16);
  });

  it('throws GOAT_CHAIN_ID_MISMATCH when the RPC reports the wrong chain ID', async () => {
    await expect(
      checkGoatNetworkConnectivity(testnetConfig(), {
        fetchImpl: stubFetch({ eth_chainId: '0x929', eth_blockNumber: '0x1' }),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'GOAT_CHAIN_ID_MISMATCH' }) as unknown as Error,
    );
  });

  it('throws GOAT_RPC_BAD_RESPONSE when the chain ID is not a hex quantity', async () => {
    await expect(
      checkGoatNetworkConnectivity(testnetConfig(), {
        fetchImpl: stubFetch({ eth_chainId: 'not-hex', eth_blockNumber: '0x1' }),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'GOAT_RPC_BAD_RESPONSE' }) as unknown as Error,
    );
  });

  it('throws GOAT_RPC_BAD_RESPONSE when the RPC returns an error object', async () => {
    await expect(
      checkGoatNetworkConnectivity(testnetConfig(), {
        fetchImpl: async () =>
          jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'boom' } }),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'GOAT_RPC_BAD_RESPONSE' }) as unknown as Error,
    );
  });

  it('throws GOAT_RPC_UNREACHABLE on an HTTP error status', async () => {
    await expect(
      checkGoatNetworkConnectivity(testnetConfig(), {
        fetchImpl: async () => jsonResponse({}, 503),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'GOAT_RPC_UNREACHABLE' }) as unknown as Error,
    );
  });

  it('throws GOAT_RPC_UNREACHABLE when the RPC call throws', async () => {
    await expect(
      checkGoatNetworkConnectivity(testnetConfig(), {
        fetchImpl: async () => {
          throw new Error('connection refused');
        },
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'GOAT_RPC_UNREACHABLE' }) as unknown as Error,
    );
  });

  it('throws GOAT_RPC_INVALID_URL for a non-URL rpcUrl', async () => {
    await expect(
      checkGoatNetworkConnectivity({ ...testnetConfig(), rpcUrl: 'not-a-url' }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'GOAT_RPC_INVALID_URL' }) as unknown as Error,
    );
  });

  it('throws GOAT_RPC_INVALID_URL for a non-HTTP(S) scheme', async () => {
    await expect(
      checkGoatNetworkConnectivity({ ...testnetConfig(), rpcUrl: 'file:///etc/passwd' }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'GOAT_RPC_INVALID_URL' }) as unknown as Error,
    );
  });

  it('aborts and throws GOAT_RPC_TIMEOUT when the request hangs', async () => {
    const fetchImpl: FetchLike = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });

    const config: GoatNetworkConfig = { ...testnetConfig(), timeoutMs: 50 };
    await expect(
      checkGoatNetworkConnectivity(config, { fetchImpl, timeoutMs: 50 }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'GOAT_RPC_TIMEOUT' }) as unknown as Error,
    );
  });

  it('verifies connectivity against mainnet config when allowed', async () => {
    const config = loadGoatNetworkConfig({
      NODE_ENV: 'production',
      GOAT_NETWORK: 'goat-mainnet',
    });
    const result = await checkGoatNetworkConnectivity(config, {
      fetchImpl: stubFetch({ eth_chainId: '0x929', eth_blockNumber: '0x2' }),
    });
    expect(result.chainId).toBe(2345);
    expect(result.network).toBe('goat-mainnet');
  });
});

describe('checkGoatNetworkConnectivity error type', () => {
  it('throws an AgentKitConnectivityError with the expected code', async () => {
    try {
      await checkGoatNetworkConnectivity(testnetConfig(), {
        fetchImpl: stubFetch({ eth_chainId: '0x999', eth_blockNumber: '0x1' }),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentKitConnectivityError);
      expect((error as AgentKitConnectivityError).code).toBe('GOAT_CHAIN_ID_MISMATCH');
      return;
    }
    throw new Error('expected checkGoatNetworkConnectivity to throw');
  });
});
