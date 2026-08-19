import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GOAT_NETWORK,
  GOAT_BACKUP_RPC_URLS,
  GOAT_CHAIN_ID_HEX,
  GOAT_CHAIN_IDS,
  GOAT_EXPLORER_URLS,
  GOAT_NETWORK_INFO,
  GOAT_RPC_URLS,
  GOAT_TESTNET_FAUCET_URL,
  loadGoatNetworkConfig,
} from './network.js';
import { AgentKitConfigError } from './errors.js';

describe('verified GOAT network facts', () => {
  it('records the official Testnet3 and Alpha Mainnet parameters', () => {
    expect(GOAT_CHAIN_IDS['goat-testnet']).toBe(48816);
    expect(GOAT_CHAIN_IDS['goat-mainnet']).toBe(2345);
    expect(GOAT_CHAIN_ID_HEX['goat-testnet']).toBe('0xBEB0');
    expect(GOAT_CHAIN_ID_HEX['goat-mainnet']).toBe('0x929');
  });

  it('uses the official RPC, backup RPC, and explorer URLs', () => {
    expect(GOAT_RPC_URLS['goat-testnet']).toBe('https://rpc.testnet3.goat.network');
    expect(GOAT_RPC_URLS['goat-mainnet']).toBe('https://rpc.goat.network');
    expect(GOAT_BACKUP_RPC_URLS['goat-testnet']).toBe('https://rpc.ankr.com/goat_testnet');
    expect(GOAT_BACKUP_RPC_URLS['goat-mainnet']).toBe('https://rpc.ankr.com/goat_mainnet');
    expect(GOAT_EXPLORER_URLS['goat-testnet']).toBe('https://explorer.testnet3.goat.network');
    expect(GOAT_EXPLORER_URLS['goat-mainnet']).toBe('https://explorer.goat.network');
  });

  it('records BTC (18 decimals) as the native currency and a testnet-only faucet', () => {
    expect(GOAT_NETWORK_INFO['goat-testnet'].nativeCurrency).toEqual({
      name: 'Bitcoin',
      symbol: 'BTC',
      decimals: 18,
    });
    expect(GOAT_TESTNET_FAUCET_URL).toBe('https://bridge.testnet3.goat.network/faucet');
    expect(GOAT_NETWORK_INFO['goat-mainnet'].faucetUrl).toBeUndefined();
  });
});

describe('loadGoatNetworkConfig', () => {
  it('defaults to the testnet with official URLs when no variables are present', () => {
    const config = loadGoatNetworkConfig({});
    expect(config.network).toBe(DEFAULT_GOAT_NETWORK);
    expect(config.chainId).toBe(48816);
    expect(config.rpcUrl).toBe('https://rpc.testnet3.goat.network');
    expect(config.backupRpcUrl).toBe('https://rpc.ankr.com/goat_testnet');
    expect(config.explorerUrl).toBe('https://explorer.testnet3.goat.network');
    expect(config.faucetUrl).toBe(GOAT_TESTNET_FAUCET_URL);
    expect(config.timeoutMs).toBe(10_000);
  });

  it('honors a testnet RPC override', () => {
    const config = loadGoatNetworkConfig({
      GOAT_TESTNET_RPC_URL: 'https://rpc.internal.example',
    });
    expect(config.rpcUrl).toBe('https://rpc.internal.example');
    expect(config.network).toBe('goat-testnet');
  });

  it('honors a mainnet RPC override when mainnet is explicitly allowed in production', () => {
    const config = loadGoatNetworkConfig({
      NODE_ENV: 'production',
      GOAT_NETWORK: 'goat-mainnet',
      GOAT_MAINNET_RPC_URL: 'https://rpc.internal.example',
    });
    expect(config.network).toBe('goat-mainnet');
    expect(config.chainId).toBe(2345);
    expect(config.rpcUrl).toBe('https://rpc.internal.example');
  });

  it('refuses mainnet in development without an explicit override', () => {
    expect(() => loadGoatNetworkConfig({ GOAT_NETWORK: 'goat-mainnet' })).toThrow(
      AgentKitConfigError,
    );
  });

  it('allows mainnet in development when GOAT_ALLOW_MAINNET=1 is set', () => {
    const config = loadGoatNetworkConfig({
      GOAT_NETWORK: 'goat-mainnet',
      GOAT_ALLOW_MAINNET: '1',
    });
    expect(config.network).toBe('goat-mainnet');
  });

  it('honors a custom RPC timeout', () => {
    const config = loadGoatNetworkConfig({ GOAT_RPC_TIMEOUT_MS: '5000' });
    expect(config.timeoutMs).toBe(5000);
  });

  it('rejects an unknown network name', () => {
    expect(() => loadGoatNetworkConfig({ GOAT_NETWORK: 'bogus' })).toThrow(AgentKitConfigError);
  });

  it('rejects an invalid RPC URL', () => {
    expect(() => loadGoatNetworkConfig({ GOAT_TESTNET_RPC_URL: 'not-a-url' })).toThrow(
      AgentKitConfigError,
    );
  });

  it('rejects an invalid timeout value', () => {
    expect(() => loadGoatNetworkConfig({ GOAT_RPC_TIMEOUT_MS: 'soon' })).toThrow(
      AgentKitConfigError,
    );
  });

  it('ignores unrelated environment variables', () => {
    const config = loadGoatNetworkConfig({ PATH: '/usr/bin', NODE_ENV: 'development' });
    expect(config.network).toBe('goat-testnet');
  });
});
