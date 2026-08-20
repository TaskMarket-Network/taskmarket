import type { NextConfig } from 'next';

/**
 * The dashboard consumes the workspace package `@taskmarket/agent-registry`,
 * which ships TypeScript source (NodeNext, `.js` import specifiers). We
 * transpile the workspace package here and teach webpack to resolve `.js`
 * specifiers to the `.ts` sources they point at.
 */
const nextConfig: NextConfig = {
  transpilePackages: ['@taskmarket/agent-registry'],
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
