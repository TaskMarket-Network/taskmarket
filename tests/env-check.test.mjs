import { describe, expect, it } from 'vitest';

import { parseEnv, validateEnv } from '../scripts/check-env.mjs';

const EXAMPLE = `# Local development only
NODE_ENV=development
DATABASE_URL=postgres://taskmarket_dev:taskmarket_dev@localhost:5432/taskmarket_dev
REDIS_URL=redis://localhost:6379
`;

describe('parseEnv', () => {
  it('parses simple KEY=VALUE lines and skips comments and blanks', () => {
    const vars = parseEnv(EXAMPLE);
    expect(vars.NODE_ENV).toBe('development');
    expect(vars.DATABASE_URL).toBe(
      'postgres://taskmarket_dev:taskmarket_dev@localhost:5432/taskmarket_dev',
    );
    expect(vars.REDIS_URL).toBe('redis://localhost:6379');
  });

  it('strips matching quotes around values', () => {
    expect(parseEnv('FOO="quoted"').FOO).toBe('quoted');
    expect(parseEnv("BAR='single'").BAR).toBe('single');
  });
});

describe('validateEnv', () => {
  it('accepts a safe development environment', () => {
    const { errors } = validateEnv({
      example: EXAMPLE,
      env: {
        NODE_ENV: 'development',
        DATABASE_URL: 'postgres://taskmarket_dev:taskmarket_dev@localhost:5432/taskmarket_dev',
        REDIS_URL: 'redis://localhost:6379',
      },
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects NODE_ENV=production without an explicit override', () => {
    const { errors } = validateEnv({ example: EXAMPLE, env: { NODE_ENV: 'production' } });
    expect(errors.some((error) => error.includes('NODE_ENV=production'))).toBe(true);
  });

  it('rejects values that look like private keys', () => {
    const { errors } = validateEnv({
      example: EXAMPLE,
      env: { PRIVATE_KEY: `0x${'a'.repeat(64)}` },
    });
    expect(errors.some((error) => error.includes('private key'))).toBe(true);
  });

  it('does not flag placeholder-named variables', () => {
    const { errors } = validateEnv({
      example: EXAMPLE,
      env: { PLACEHOLDER_PRIVATE_KEY: `0x${'a'.repeat(64)}` },
    });
    expect(errors).toHaveLength(0);
  });

  it('warns about declared variables that are not set', () => {
    const { warnings } = validateEnv({ example: EXAMPLE, env: { NODE_ENV: 'development' } });
    expect(warnings.length).toBeGreaterThan(0);
  });
});
