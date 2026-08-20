import { describe, expect, it } from 'vitest';

import { listMigrationFiles, pendingMigrations } from '../scripts/migrate.mjs';

describe('listMigrationFiles', () => {
  it('discovers migrations across packages in sorted order', () => {
    const files = listMigrationFiles();
    expect(files.length).toBeGreaterThanOrEqual(2);
    expect(files.some((f) => f.version === 'agent-registry/001_agent_registry.sql')).toBe(true);
    expect(files.some((f) => f.version === 'catalog/001_marketplace_catalog.sql')).toBe(true);
    expect(files.every((f) => f.file.endsWith('.sql'))).toBe(true);
    const versions = files.map((f) => f.version);
    expect(versions).toEqual([...versions].sort());
  });
});

describe('pendingMigrations', () => {
  const files = [
    { version: 'a/001_a.sql', dir: new URL('file:///a/migrations/'), file: '001_a.sql' },
    { version: 'b/002_b.sql', dir: new URL('file:///b/migrations/'), file: '002_b.sql' },
    { version: 'b/003_c.sql', dir: new URL('file:///b/migrations/'), file: '003_c.sql' },
  ];

  it('returns only migrations not yet applied', () => {
    expect(pendingMigrations([], files)).toEqual(files);
    expect(pendingMigrations(['a/001_a.sql'], files)).toEqual([files[1], files[2]]);
    expect(
      pendingMigrations(
        files.map((f) => f.version),
        files,
      ),
    ).toEqual([]);
  });

  it('matches legacy basename-only records so they are not re-run', () => {
    expect(pendingMigrations(['001_a.sql'], files)).toEqual([files[1], files[2]]);
  });

  it('ignores applied versions not present in the file list', () => {
    const files = [
      { version: 'a/001_a.sql', dir: new URL('file:///a/migrations/'), file: '001_a.sql' },
    ];
    expect(pendingMigrations(['a/001_a.sql', 'b/002_b.sql'], files)).toEqual([]);
  });
});
