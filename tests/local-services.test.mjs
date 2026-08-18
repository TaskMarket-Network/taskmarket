import { describe, expect, it } from 'vitest';

import { parseConnectionString } from '../scripts/check-local-services.mjs';

describe('parseConnectionString', () => {
  it('parses a postgres URL', () => {
    expect(
      parseConnectionString('postgres://user:pass@localhost:5432/taskmarket_dev'),
    ).toMatchObject({
      scheme: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'taskmarket_dev',
    });
  });

  it('falls back to default ports', () => {
    expect(parseConnectionString('postgres://user:pass@localhost/taskmarket_dev').port).toBe(5432);
    expect(parseConnectionString('redis://localhost').port).toBe(6379);
  });

  it('accepts postgresql and rediss schemes', () => {
    expect(parseConnectionString('postgresql://h/db').scheme).toBe('postgresql');
    expect(parseConnectionString('rediss://h').port).toBe(6379);
  });

  it('returns null for invalid input', () => {
    expect(parseConnectionString('not a url')).toBeNull();
    expect(parseConnectionString('ftp://localhost')).toBeNull();
    expect(parseConnectionString('')).toBeNull();
  });
});
